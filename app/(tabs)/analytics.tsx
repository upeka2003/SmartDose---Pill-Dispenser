import { useNotifications } from '@/contexts/NotificationContext';
import { useFocusEffect, useRouter } from 'expo-router';
import { Bell, Calendar, FileText, Flame, Share2 } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Share, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Palette, Radius, Shadows } from '../../constants/theme';
import { useAccessibility } from '../../contexts/AccessibilityContext';
import { listenMedications, Medication } from '../../services/medicationService';

const RTDB_URL    = process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL ?? '';
const RTDB_SECRET = process.env.EXPO_PUBLIC_FIREBASE_DATABASE_SECRET ?? '';
const rtdbUrl = (path: string) =>
  `${RTDB_URL}/${path}.json${RTDB_SECRET ? `?auth=${RTDB_SECRET}` : ''}`;

// Local date string for Date objects (browser timezone)
const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Convert firmware unix key → Sri Lanka date string.
// Firmware RTC stores LKT time (UTC+5:30) as if it were UTC, so timestamps
// are +19800 s ahead of real UTC. Adding 19800 gives the real LKT instant;
// toISOString() then yields the correct Sri Lanka calendar date.
const rtdbKeyToLKTDate = (key: number): string =>
  new Date((key + 19800) * 1000).toISOString().slice(0, 10);

export default function AnalyticsScreen() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [rtdbHistory, setRtdbHistory] = useState<Record<string, any>>({});
  const [selectedPeriod, setSelectedPeriod] = useState('Week');
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState<{ visible: boolean; type: 'start' | 'end' }>({ visible: false, type: 'start' });
  const [pickerMonth, setPickerMonth] = useState(new Date());

  const todayDate = new Date();
  const [customStart, setCustomStart] = useState(new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - 7));
  const [customEnd, setCustomEnd] = useState(todayDate);

  const router = useRouter();
  const { hasUnread } = useNotifications();
  const { speak, voiceEnabled, palette, darkMode } = useAccessibility();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  useEffect(() => {
    const unsubMeds = listenMedications(setMedications);

    let cancelled = false;
    const pollHistory = async () => {
      if (cancelled) return;
      try {
        const url = 'https://smartdose-dcd88-default-rtdb.firebaseio.com/smartdose/history.json?auth=CZnwewbitQSo2RY8CvP6nf0lHbX4fAgwS7dZAKMi';
        const res  = await fetch(url);
        const data = await res.json();
        console.log('[Analytics] raw history keys:', data ? Object.keys(data).length : 'null');
        if (!cancelled) setRtdbHistory(data || {});
      } catch (e) { console.error('[Analytics] history poll error:', e); }
    };

    pollHistory();
    const histTimer = setInterval(pollHistory, 15_000);
    return () => { cancelled = true; clearInterval(histTimer); unsubMeds(); };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (voiceEnabled) speak('Analytics. View your medication adherence and statistics.');
      return () => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        try {
          const Speech = require('expo-speech');
          Speech.stop && Speech.stop();
        } catch {}
      };
    }, [voiceEnabled])
  );

  // ── Core data: group all RTDB history by Sri Lanka date ─────────────────
  type DayData = { taken: number; missed: number };
  const historyByDate = useMemo(() => {
    const map: Record<string, DayData> = {};
    for (const [id, val] of Object.entries(rtdbHistory)) {
      console.log('[Analytics] entry:', id, JSON.stringify(val));
      const key = Number(id);
      if (!Number.isFinite(key) || key < 1_000_000_000) continue;
      const dateStr = rtdbKeyToLKTDate(key);
      if (!map[dateStr]) map[dateStr] = { taken: 0, missed: 0 };
      // History entries are push-key wrapped: val = { "-PushKey": { status, medication, ... } }
      const entry = (val && typeof val === 'object' && !val.status)
        ? Object.values(val)[0] as any
        : val;
      const status = typeof entry?.status === 'string' ? entry.status.trim().toLowerCase() : '';
      if (status === 'taken' || status === 'dispensed' || status === 'auto-dispensed') map[dateStr].taken++;
      else if (status === 'missed') map[dateStr].missed++;
    }
    console.log('[Analytics] historyByDate:', JSON.stringify(map));
    return map;
  }, [rtdbHistory]);

  // ── Period filter: set of date strings in the selected period ─────────────
  const periodDates = useMemo(() => {
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    return Object.keys(historyByDate).filter(dateStr => {
      const d = new Date(dateStr);
      if (selectedPeriod === 'Week') {
        const cut = new Date(); cut.setDate(cut.getDate() - 7); cut.setHours(0, 0, 0, 0);
        return d >= cut && d <= todayEnd;
      } else if (selectedPeriod === 'Month') {
        const cut = new Date(); cut.setMonth(cut.getMonth() - 1); cut.setHours(0, 0, 0, 0);
        return d >= cut && d <= todayEnd;
      }
      return d >= customStart && d <= customEnd;
    });
  }, [historyByDate, selectedPeriod, customStart, customEnd]);

  const periodDateSet = useMemo(() => new Set(periodDates), [periodDates]);

  const takenCount  = periodDates.reduce((s, d) => s + historyByDate[d].taken,  0);
  const missedCount = periodDates.reduce((s, d) => s + historyByDate[d].missed, 0);
  const totalCount  = takenCount + missedCount;
  const adherence   = totalCount > 0 ? Math.round(takenCount / totalCount * 100) : 0;

  // ── Streak (consecutive days where missed === 0 and taken > 0) ────────────
  const streak = useMemo(() => {
    const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
    let s = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(todayMid); d.setDate(d.getDate() - i);
      const day = historyByDate[toDateStr(d)];
      if (!day || day.taken + day.missed === 0) { if (i === 0) continue; break; }
      if (day.missed === 0) s++; else break;
    }
    return s;
  }, [historyByDate]);

  const bestStreak = useMemo(() => {
    let best = 0, cur = 0;
    for (const dateStr of Object.keys(historyByDate).sort()) {
      const d = historyByDate[dateStr];
      if (d.missed === 0 && d.taken > 0) { cur++; best = Math.max(best, cur); } else { cur = 0; }
    }
    return best;
  }, [historyByDate]);

  // Unified chart item shape: takenRatio and missedRatio are 0–1 fractions.
  type ChartItem = { label: string; takenRatio: number; missedRatio: number; isFuture: boolean; hasData: boolean };

  const logsToRatio = (taken: number, missed: number): Pick<ChartItem, 'takenRatio' | 'missedRatio' | 'hasData'> => {
    const total = taken + missed;
    return total > 0
      ? { takenRatio: taken / total, missedRatio: missed / total, hasData: true }
      : { takenRatio: 0, missedRatio: 0, hasData: false };
  };

  const chartData: ChartItem[] = (() => {
    if (selectedPeriod === 'Week') {
      const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
      return Array.from({ length: 7 }, (_, i) => {
        const cur = new Date(todayMidnight);
        cur.setDate(cur.getDate() - 6 + i);
        if (cur > todayMidnight) return { label: DAY_NAMES[cur.getDay()], takenRatio: 0, missedRatio: 0, isFuture: true, hasData: false };
        const day = historyByDate[toDateStr(cur)];
        return { label: DAY_NAMES[cur.getDay()], ...logsToRatio(day?.taken ?? 0, day?.missed ?? 0), isFuture: false };
      });
    } else if (selectedPeriod === 'Month') {
      return [1, 2, 3, 4].map(w => {
        const wStart = new Date(); wStart.setDate(wStart.getDate() - (4 - w) * 7 - 7); wStart.setHours(0,0,0,0);
        const wEnd   = new Date(wStart); wEnd.setDate(wEnd.getDate() + 7);
        let taken = 0, missed = 0;
        for (const [ds, d] of Object.entries(historyByDate)) {
          const day = new Date(ds);
          if (day >= wStart && day < wEnd) { taken += d.taken; missed += d.missed; }
        }
        return { label: `Wk ${w}`, ...logsToRatio(taken, missed), isFuture: false };
      });
    } else {
      const totalDays = Math.max(1, Math.ceil((customEnd.getTime() - customStart.getTime()) / (1000 * 60 * 60 * 24)));
      const partSize  = Math.ceil(totalDays / 5);
      return [1, 2, 3, 4, 5].map(p => {
        const pStart = new Date(customStart); pStart.setDate(pStart.getDate() + (p - 1) * partSize);
        const pEnd   = new Date(pStart); pEnd.setDate(pEnd.getDate() + partSize);
        let taken = 0, missed = 0;
        for (const [ds, d] of Object.entries(historyByDate)) {
          const day = new Date(ds);
          if (day >= pStart && day < pEnd) { taken += d.taken; missed += d.missed; }
        }
        return { label: `P${p}`, ...logsToRatio(taken, missed), isFuture: false };
      });
    }
  })();

  const calendarDays = (targetDate?: Date) => {
    const d = targetDate || selectedMonth;
    const year = d.getFullYear();
    const month = d.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date().getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return { days, today, month, year };
  };

  const { days, today, month, year } = calendarDays();
  const monthName = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });

  const getDayStatus = (day: number) => {
    const checkDate  = new Date(year, month, day);
    const todayMid   = new Date(); todayMid.setHours(0, 0, 0, 0);
    if (checkDate > todayMid) return 'future';
    const dateStr = toDateStr(checkDate);
    const d = historyByDate[dateStr];
    if (!d || d.taken + d.missed === 0) return checkDate.getTime() === todayMid.getTime() ? 'pending' : 'none';
    if (d.missed === 0) return 'taken';
    if (d.taken  === 0) return 'missed';
    return 'partial';
  };

  const getMedAdherence = (med: Medication) => {
    let taken = 0, total = 0;
    for (const [id, val] of Object.entries(rtdbHistory)) {
      const key = Number(id);
      if (!Number.isFinite(key) || key < 1_000_000_000) continue;
      if (!periodDateSet.has(rtdbKeyToLKTDate(key))) continue;
      const entry = (val && typeof val === 'object' && !val.status)
        ? Object.values(val)[0] as any
        : val;
      if (entry?.medicationId !== med.id) continue;
      total++;
      const st = typeof entry?.status === 'string' ? entry.status.trim().toLowerCase() : '';
      if (st === 'taken' || st === 'dispensed' || st === 'auto-dispensed') taken++;
    }
    return { taken, total, pct: total > 0 ? Math.round(taken / total * 100) : 0 };
  };

  const handleShare = async () => {
    let periodStr = selectedPeriod;
    if (selectedPeriod === 'Custom') {
      periodStr = `${customStart.toLocaleDateString()} to ${customEnd.toLocaleDateString()}`;
    }
    const report = `
SmartDose - Medication Report
==============================
Period: ${periodStr}
Date Generated: ${new Date().toLocaleDateString()}

📊 Overall Adherence: ${adherence}%
💊 Doses Taken: ${takenCount}/${totalCount}
❌ Doses Missed: ${missedCount}
🔥 Current Streak: ${streak} days
🏆 Best Streak: ${bestStreak} days

Health Status: ${adherence >= 90 ? '🌟 Excellent' : adherence >= 75 ? '👍 Good' : '⚠️ Needs Improvement'}

Generated by SmartDose App.
    `;
    await Share.share({ message: report, title: 'SmartDose Report' });
  };

  const handleExportPDF = () => {
    Alert.alert(
      '📄 Export Report',
      `SmartDose Report\n\nAdherence: ${adherence}%\nDoses Taken: ${takenCount}/${totalCount}\nStreak: ${streak} days`,
      [
        { text: 'Share', onPress: handleShare },
        { text: 'Close', style: 'cancel' }
      ]
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} backgroundColor={palette.background} />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>SmartDose</Text>
          <Text style={styles.headerSub}>Automated Pill Dispenser</Text>
        </View>
        <TouchableOpacity style={styles.bellBtn} onPress={() => router.push('/notifications')}>
          <Bell size={23} color={palette.text} />
          {hasUnread && <View style={styles.bellDot} />}
        </TouchableOpacity>
      </View>

      {medications.length === 0 ? (
        <View style={styles.getStartedCard}>
          <Text style={styles.getStartedIcon}>💊</Text>
          <Text style={styles.getStartedTitle}>No medications yet</Text>
          <Text style={styles.getStartedSub}>Add medications from the Home tab to start tracking your adherence here.</Text>
        </View>
      ) : (
        <View style={styles.streakCard}>
          <View style={styles.streakLeft}>
            <Flame size={32} color="#f59e0b" />
            <View>
              <Text style={styles.streakNumber}>{streak} Days</Text>
              <Text style={styles.streakLabel}>Current Streak</Text>
            </View>
          </View>
          <View style={styles.streakRight}>
            <Text style={styles.streakBest}>Best: {bestStreak} days</Text>
            <Text style={styles.streakAdherence}>{adherence}% this period</Text>
          </View>
        </View>
      )}

      <View style={styles.periodRow}>
        {['Week', 'Month', 'Custom'].map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.periodBtn, selectedPeriod === p && styles.periodSelected]}
            onPress={() => setSelectedPeriod(p)}
          >
            <Text style={[styles.periodText, selectedPeriod === p && styles.periodTextSelected]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {selectedPeriod === 'Custom' && (
        <View style={styles.customDateCard}>
          <Text style={styles.customDateTitle}>Select Report Date Range</Text>
          <View style={styles.datePickerRow}>
            <TouchableOpacity
              style={styles.dateInputBtn}
              onPress={() => { setPickerMonth(new Date(customStart)); setShowDatePicker({ visible: true, type: 'start' }); }}>
              <Text style={styles.dateLabel}>Start Date</Text>
              <Text style={styles.dateValue}>{customStart.toLocaleDateString()}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dateInputBtn}
              onPress={() => { setPickerMonth(new Date(customEnd)); setShowDatePicker({ visible: true, type: 'end' }); }}>
              <Text style={styles.dateLabel}>End Date</Text>
              <Text style={styles.dateValue}>{customEnd.toLocaleDateString()}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.dateHint}>* Tap on dates to change range.</Text>
        </View>
      )}

      {medications.length > 0 && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{adherence}%</Text>
            <Text style={styles.statLabel}>Average Adherence</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{takenCount}<Text style={styles.statTotal}>/{totalCount}</Text></Text>
            <Text style={styles.statLabel}>Total Doses</Text>
          </View>
        </View>
      )}

      <View style={styles.card}>
        <TouchableOpacity style={styles.calendarHeader} onPress={() => setShowCalendar(!showCalendar)}>
          <View style={styles.calendarTitleRow}>
            <Calendar size={20} color={palette.blue} />
            <Text style={styles.cardTitle}>Monthly Calendar</Text>
          </View>
          <Text style={styles.calendarToggle}>{showCalendar ? 'Collapse' : 'Open'}</Text>
        </TouchableOpacity>

        {showCalendar && (
          <View>
            <View style={styles.monthNav}>
              <TouchableOpacity onPress={() => { const d = new Date(selectedMonth); d.setMonth(d.getMonth() - 1); setSelectedMonth(d); }}>
                <Text style={styles.navBtn}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.monthName}>{monthName}</Text>
              <TouchableOpacity onPress={() => { const d = new Date(selectedMonth); d.setMonth(d.getMonth() + 1); setSelectedMonth(d); }}>
                <Text style={styles.navBtn}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dayLabels}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <Text key={d} style={styles.dayLabel}>{d}</Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {days.map((day, i) => (
                <View key={i} style={styles.dayCell}>
                  {day ? (
                    <View style={[
                      styles.dayCircle,
                      day === today && month === new Date().getMonth() && styles.dayToday,
                      getDayStatus(day) === 'taken' && styles.dayTaken,
                      getDayStatus(day) === 'partial' && styles.dayPartial,
                      getDayStatus(day) === 'missed' && styles.dayMissed,
                    ]}>
                      <Text style={[
                        styles.dayText,
                        (getDayStatus(day) !== 'pending' && getDayStatus(day) !== 'future' && getDayStatus(day) !== 'none') && styles.dayTextWhite
                      ]}>{day}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
            <View style={styles.legend}>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#10b981' }]} /><Text style={styles.legendText}>Taken</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} /><Text style={styles.legendText}>Partial</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} /><Text style={styles.legendText}>Missed</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#059669' }]} /><Text style={styles.legendText}>Today</Text></View>
            </View>
          </View>
        )}
      </View>

      {medications.length > 0 && <View style={styles.card}>
        <Text style={styles.cardTitle}>{selectedPeriod} Overview</Text>
        <View style={styles.barChart}>
          {chartData.map((d, i) => {
            const BAR_H  = 80;
            const takenH = d.hasData ? Math.round(d.takenRatio  * BAR_H) : 0;
            const missedH = d.hasData ? Math.round(d.missedRatio * BAR_H) : 0;
            return (
              <View key={i} style={styles.barGroup}>
                <View style={[styles.stackBar, { height: BAR_H }]}>
                  {takenH  > 0 && <View style={{ position: 'absolute', bottom: 0,       left: 0, right: 0, height: takenH,  backgroundColor: '#10b981', borderRadius: 4 }} />}
                  {missedH > 0 && <View style={{ position: 'absolute', bottom: takenH,  left: 0, right: 0, height: missedH, backgroundColor: '#ef4444' }} />}
                </View>
                <Text style={styles.barLabel}>{d.label}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#10b981' }]} /><Text style={styles.legendText}>Taken</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} /><Text style={styles.legendText}>Missed</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#e5e7eb' }]} /><Text style={styles.legendText}>No data</Text></View>
        </View>
      </View>}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Medication-Specific Adherence</Text>
        {medications.length === 0 || totalCount === 0 ? (
          <View style={styles.emptyAdherence}>
            <Text style={styles.emptyAdherenceIcon}>📊</Text>
            <Text style={styles.emptyAdherenceTitle}>No data yet</Text>
            <Text style={styles.emptyAdherenceText}>Mark medications as taken on the Home screen to see your adherence here.</Text>
          </View>
        ) : (
          medications.map(med => {
            const { taken, total, pct } = getMedAdherence(med);
            const statusColor = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
            const statusLabel = pct >= 80 ? 'Good' : pct >= 50 ? 'Fair' : 'Low';
            const statusBg    = pct >= 80 ? '#d1fae5' : pct >= 50 ? '#fef3c7' : '#fee2e2';
            return (
              <View key={med.id} style={styles.adherenceCard}>
                <View style={[styles.adherenceBadge, { backgroundColor: med.color + '18' }]}>
                  <View style={[styles.adherenceBadgeInner, { backgroundColor: med.color }]}>
                    <Text style={styles.adherenceBadgeTxt}>C{med.compartment}</Text>
                  </View>
                </View>
                <View style={styles.adherenceBody}>
                  <View style={styles.adherenceTopRow}>
                    <Text style={styles.medName} numberOfLines={1}>{med.name}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                      <Text style={[styles.statusBadgeTxt, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                  </View>
                  <Text style={styles.medSub}>{med.dosage}  ·  {med.frequency ?? 'Once daily'}</Text>
                  <View style={styles.trackBg}>
                    <View style={[styles.trackFill, { width: `${pct}%`, backgroundColor: statusColor }]} />
                  </View>
                  <Text style={styles.doseCount}>{taken} of {total} doses taken</Text>
                </View>
                <View style={[styles.pctBox, { borderColor: statusColor + '40', backgroundColor: statusColor + '10' }]}>
                  <Text style={[styles.pctNum, { color: statusColor }]}>{pct}</Text>
                  <Text style={[styles.pctSign, { color: statusColor }]}>%</Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Share with Doctor</Text>
        <Text style={styles.shareDesc}>Share your medication adherence report with your healthcare provider</Text>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
          <Share2 size={18} color="#fff" />
          <Text style={styles.shareBtnText}>Share Report</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.shareBtn, { backgroundColor: '#10b981', marginTop: 8 }]} onPress={handleExportPDF}>
          <FileText size={18} color="#fff" />
          <Text style={styles.shareBtnText}>Export Report</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showDatePicker.visible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select {showDatePicker.type === 'start' ? 'Start' : 'End'} Date</Text>
            <View style={styles.monthNav}>
              <TouchableOpacity onPress={() => { const d = new Date(pickerMonth); d.setMonth(d.getMonth() - 1); setPickerMonth(d); }}>
                <Text style={styles.navBtn}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.monthName}>{pickerMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</Text>
              <TouchableOpacity onPress={() => { const d = new Date(pickerMonth); d.setMonth(d.getMonth() + 1); setPickerMonth(d); }}>
                <Text style={styles.navBtn}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dayLabels}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <Text key={i} style={styles.dayLabel}>{d}</Text>)}
            </View>
            <View style={styles.calendarGrid}>
              {calendarDays(pickerMonth).days.map((day, i) => (
                <TouchableOpacity key={i} style={styles.dayCell} onPress={() => {
                  if (!day) return;
                  const d = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), day);
                  if (showDatePicker.type === 'start') setCustomStart(d);
                  else setCustomEnd(d);
                  setShowDatePicker({ visible: false, type: 'start' });
                }}>
                  {day ? (
                    <View style={[styles.dayCircle]}>
                      <Text style={styles.dayText}>{day}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowDatePicker({ visible: false, type: 'start' })}>
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const makeStyles = (P: typeof Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: P.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 18, backgroundColor: P.background },
  headerTitle: { fontSize: 26, fontWeight: '900', color: P.text },
  headerSub: { fontSize: 13, color: P.textMuted, marginTop: 2 },
  bellBtn: { position: 'relative', width: 46, height: 46, borderRadius: Radius.md, backgroundColor: P.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: P.border, ...Shadows.card },
  bellDot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  streakCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', margin: 16, padding: 16, backgroundColor: P.amberSoft, borderRadius: Radius.lg, borderWidth: 1, borderColor: '#F6D878', ...Shadows.card },
  streakLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  streakNumber: { fontSize: 23, fontWeight: '900', color: P.text },
  streakLabel: { fontSize: 13, color: P.textMuted, fontWeight: '700' },
  streakRight: { alignItems: 'flex-end' },
  streakBest: { fontSize: 13, color: P.textMuted },
  streakAdherence: { fontSize: 14, fontWeight: '800', color: P.amber },
  periodRow: { flexDirection: 'row', marginHorizontal: 16, gap: 8, marginBottom: 8 },
  periodBtn: { flex: 1, paddingVertical: 10, borderRadius: 999, backgroundColor: P.surface, alignItems: 'center', borderWidth: 1, borderColor: P.border, ...Shadows.card },
  periodSelected: { backgroundColor: P.primary, borderColor: P.primary },
  periodText: { fontSize: 14, color: P.textMuted, fontWeight: '700' },
  periodTextSelected: { color: '#fff', fontWeight: '600' },
  customDateCard: { backgroundColor: P.surface, marginHorizontal: 16, marginBottom: 8, padding: 16, borderRadius: Radius.lg, borderWidth: 1, borderColor: P.border, ...Shadows.card },
  customDateTitle: { fontSize: 14, fontWeight: '800', color: P.text, marginBottom: 12 },
  datePickerRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  dateInputBtn: { flex: 1, backgroundColor: P.background, padding: 10, borderRadius: Radius.sm, borderWidth: 1, borderColor: P.border, alignItems: 'center' },
  dateLabel: { fontSize: 11, color: P.textMuted, marginBottom: 4 },
  dateValue: { fontSize: 13, fontWeight: '800', color: P.text },
  dateHint: { fontSize: 11, color: P.textSoft, fontStyle: 'italic' },
  statsRow: { flexDirection: 'row', marginHorizontal: 16, gap: 8, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: P.surface, borderRadius: Radius.lg, padding: 16, borderWidth: 1, borderColor: P.border, ...Shadows.card },
  statValue: { fontSize: 32, fontWeight: '900', color: P.text },
  statTotal: { fontSize: 18, color: P.textSoft, fontWeight: '700' },
  statLabel: { fontSize: 13, color: P.textMuted, marginTop: 4, fontWeight: '700' },
  card: { margin: 16, marginBottom: 0, backgroundColor: P.surface, borderRadius: Radius.lg, padding: 16, borderWidth: 1, borderColor: P.border, ...Shadows.card },
  cardTitle: { fontSize: 17, fontWeight: '900', color: P.text, marginBottom: 14 },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calendarTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  calendarToggle: { fontSize: 12, color: P.textMuted, fontWeight: '800' },
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 12 },
  navBtn: { fontSize: 28, color: P.blue, paddingHorizontal: 12, paddingVertical: 4 },
  monthName: { fontSize: 15, fontWeight: '800', color: P.text },
  dayLabels: { flexDirection: 'row', marginBottom: 4 },
  dayLabel: { flex: 1, textAlign: 'center', fontSize: 11, color: P.textSoft, fontWeight: '700' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayToday: { backgroundColor: P.primary },
  dayTaken: { backgroundColor: P.green },
  dayPartial: { backgroundColor: P.amber },
  dayMissed: { backgroundColor: P.rose },
  dayText: { fontSize: 13, color: P.text },
  dayTextWhite: { color: '#fff', fontWeight: '600' },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: P.textMuted },
  barChart:  { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 100, marginBottom: 8 },
  barGroup:  { alignItems: 'center', gap: 4 },
  stackBar:  { width: 28, borderRadius: 6, overflow: 'hidden', backgroundColor: '#e5e7eb', position: 'relative' },
  barLabel:  { fontSize: 11, color: P.textSoft },
  medName: { fontSize: 14, fontWeight: '800', color: P.text },
  medSub: { fontSize: 11, color: P.textMuted, marginTop: 1 },
  doseCount: { fontSize: 12, color: P.textSoft },
  adherenceCard: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 10, backgroundColor: P.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: P.border,
    overflow: 'hidden', ...Shadows.card,
  },
  adherenceBadge: { width: 56, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  adherenceBadgeInner: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  adherenceBadgeTxt: { color: '#fff', fontWeight: '900', fontSize: 12 },
  adherenceBody: { flex: 1, paddingVertical: 12, paddingRight: 8 },
  adherenceTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  trackBg: { height: 7, backgroundColor: P.border, borderRadius: 999, marginTop: 8, marginBottom: 6 },
  trackFill: { height: 7, borderRadius: 999, minWidth: 4 },
  pctBox: { width: 54, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1 },
  pctNum: { fontSize: 20, fontWeight: '900', lineHeight: 22 },
  pctSign: { fontSize: 10, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  statusBadgeTxt: { fontSize: 10, fontWeight: '800' },
  emptyAdherence: { alignItems: 'center', paddingVertical: 28, gap: 6 },
  emptyAdherenceIcon: { fontSize: 36 },
  emptyAdherenceTitle: { fontSize: 15, fontWeight: '800', color: P.text },
  emptyAdherenceText: { fontSize: 13, color: P.textSoft, textAlign: 'center', paddingHorizontal: 12 },
  getStartedCard: { margin: 16, marginBottom: 0, backgroundColor: P.primarySoft, borderRadius: Radius.lg, padding: 24, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: P.primary + '30' },
  getStartedIcon: { fontSize: 40 },
  getStartedTitle: { fontSize: 17, fontWeight: '900', color: P.text },
  getStartedSub: { fontSize: 13, color: P.textMuted, textAlign: 'center', lineHeight: 20 },
  shareDesc: { fontSize: 13, color: P.textMuted, marginBottom: 12 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: P.primary, paddingVertical: 12, borderRadius: Radius.sm, ...Shadows.button },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: P.surface, borderRadius: Radius.lg, padding: 20, width: '90%', maxWidth: 400 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: P.text, marginBottom: 16, textAlign: 'center' },
  modalCloseBtn: { marginTop: 16, padding: 10, backgroundColor: P.background, borderRadius: Radius.sm, alignItems: 'center' },
  modalCloseBtnText: { color: P.textMuted, fontWeight: '800' },
});
