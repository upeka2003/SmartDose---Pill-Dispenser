import { useNotifications } from '@/contexts/NotificationContext';
import { useFocusEffect, useRouter } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';
import { Bell, Package } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Palette, Radius, Shadows } from '../../constants/theme';
import { useAccessibility } from '../../contexts/AccessibilityContext';
import { db } from '../../services/firebase';
import { listenMedications, Medication } from '../../services/medicationService';

const COMP_COLORS = ['#3B82F6', '#10B981', '#F59E0B'];

export default function InventoryScreen() {
  const router = useRouter();
  const { hasUnread } = useNotifications();
  const { cbColors, colorBlindMode, palette, darkMode } = useAccessibility();
  const [medications, setMedications] = useState<Medication[]>([]);
  const s = useMemo(() => makeStyles(palette), [palette]);

  useEffect(() => {
    const unsub = listenMedications(setMedications);
    return () => unsub();
  }, []);

  useFocusEffect(React.useCallback(() => {}, []));

  const getCompartmentMeds = (comp: number) =>
    medications.filter(m => Number(m.compartment) === comp);

  const handleRefill = (med: Medication) => {
    Alert.alert(
      'Refill',
      `Refill "${med.name}" to ${med.totalPills ?? 30} pills?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Refill', onPress: async () => {
            try {
              await updateDoc(doc(db, 'medications', med.id), {
                currentPills: med.totalPills ?? 30,
              });
              Alert.alert('Done', `${med.name} refilled.`);
            } catch {
              Alert.alert('Error', 'Could not update. Check Firebase rules.');
            }
          },
        },
      ]
    );
  };

  const totalMeds = medications.length;
  const lowMeds   = medications.filter(m => {
    const cur = (m as any).currentPills ?? (m as any).totalPills ?? 30;
    const tot = (m as any).totalPills ?? 30;
    return (cur / tot) <= 0.3;
  }).length;

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} backgroundColor={palette.background} />

      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>SmartDose</Text>
          <Text style={s.headerSub}>Pill Compartments</Text>
        </View>
        <TouchableOpacity style={s.bellBtn} onPress={() => router.push('/notifications')} activeOpacity={0.7}>
          <Bell size={22} color={palette.text} />
          {hasUnread && <View style={s.bellDot} />}
        </TouchableOpacity>
      </View>

      <View style={s.titleSection}>
        <Text style={s.title}>Inventory</Text>
        <Text style={s.subtitle}>Medication compartment status</Text>
      </View>

      {totalMeds > 0 && (
        <View style={s.summaryRow}>
          <View style={s.summaryCard}>
            <Text style={s.summaryNum}>{totalMeds}</Text>
            <Text style={s.summaryLabel}>Medications</Text>
          </View>
          <View style={[s.summaryCard, lowMeds > 0 && s.summaryWarn]}>
            <Text style={[s.summaryNum, lowMeds > 0 && s.summaryNumWarn]}>{lowMeds}</Text>
            <Text style={s.summaryLabel}>Need Refill</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryNum}>3</Text>
            <Text style={s.summaryLabel}>Compartments</Text>
          </View>
        </View>
      )}

      {[1, 2, 3].map(comp => {
        const meds  = getCompartmentMeds(comp);
        const color = COMP_COLORS[comp - 1];

        return (
          <View key={comp} style={[s.compCard, { borderLeftColor: color, borderLeftWidth: 4 }]}>
            <View style={s.compHeader}>
              <View style={[s.compBadge, { backgroundColor: color }]}>
                <Text style={s.compBadgeTxt}>C{comp}</Text>
              </View>
              <Text style={s.compTitle}>Compartment {comp}</Text>
              {meds.length === 0 && (
                <View style={s.emptyTag}>
                  <Text style={s.emptyTagTxt}>Empty</Text>
                </View>
              )}
            </View>

            {meds.length === 0 ? (
              <View style={s.emptyRow}>
                <Package size={18} color={palette.textSoft} />
                <Text style={s.emptyTxt}>No medication assigned to this compartment</Text>
              </View>
            ) : (
              meds.map(med => {
                const cur = (med as any).currentPills ?? (med as any).totalPills ?? 30;
                const tot = (med as any).totalPills ?? 30;
                const pct = Math.min(Math.round((cur / tot) * 100), 100);
                const isLow = pct <= 30;
                const isMid = pct > 30 && pct <= 60;
                const barColor = isLow
                  ? cbColors.danger
                  : isMid
                  ? cbColors.warning
                  : colorBlindMode ? '#2563EB' : med.color;

                return (
                  <View key={med.id} style={s.medRow}>
                    <View style={s.medLeft}>
                      <View style={[s.medDot, { backgroundColor: med.color }]} />
                      <View>
                        <Text style={s.medName}>{med.name}</Text>
                        <Text style={s.medSub}>
                          {med.dosage}
                          {med.pillCount && med.pillCount > 1
                            ? `  ·  ${med.pillCount} pills/dose`
                            : '  ·  1 pill/dose'}
                        </Text>
                      </View>
                    </View>

                    {isLow && (
                      <View style={s.lowBadge}>
                        <Text style={s.lowBadgeTxt}>Low</Text>
                      </View>
                    )}

                    <View style={s.track}>
                      <View style={[s.trackFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                    </View>
                    <Text style={s.pillsTxt}>{cur} / {tot} pills  ({pct}%)</Text>

                    <TouchableOpacity
                      style={[s.refillBtn, { backgroundColor: isLow ? cbColors.danger : color }]}
                      onPress={() => handleRefill(med)}
                      activeOpacity={0.8}
                    >
                      <Text style={s.refillTxt}>{isLow ? '⚠ Refill Now' : '+ Refill'}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        );
      })}

      {totalMeds === 0 && (
        <View style={s.globalEmpty}>
          <Text style={s.globalEmptyIcon}>📦</Text>
          <Text style={s.globalEmptyTitle}>No medications added yet</Text>
          <Text style={s.globalEmptySub}>Add medications using the + button on the Home tab</Text>
        </View>
      )}

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

const makeStyles = (P: typeof Palette) => StyleSheet.create({
  container:   { flex: 1, backgroundColor: P.background },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: P.text },
  headerSub:   { fontSize: 13, color: P.textMuted, marginTop: 2 },
  bellBtn:     { width: 46, height: 46, borderRadius: Radius.md, backgroundColor: P.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: P.border, ...Shadows.card },
  bellDot:     { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },

  titleSection: { paddingHorizontal: 20, paddingBottom: 12 },
  title:        { fontSize: 25, fontWeight: '900', color: P.text },
  subtitle:     { fontSize: 14, color: P.textMuted, marginTop: 4 },

  summaryRow:    { flexDirection: 'row', marginHorizontal: 16, gap: 10, marginBottom: 16 },
  summaryCard:   { flex: 1, backgroundColor: P.surface, borderRadius: Radius.lg, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: P.border, ...Shadows.card },
  summaryWarn:   { backgroundColor: P.amberSoft, borderColor: '#F6D878' },
  summaryNum:    { fontSize: 28, fontWeight: '900', color: P.text },
  summaryNumWarn:{ color: P.amber },
  summaryLabel:  { fontSize: 11, color: P.textMuted, marginTop: 4, fontWeight: '700', textAlign: 'center' },

  compCard:   { marginHorizontal: 16, marginBottom: 14, backgroundColor: P.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: P.border, overflow: 'hidden', ...Shadows.card },
  compHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 12, gap: 12 },
  compBadge:  { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  compBadgeTxt: { color: '#fff', fontWeight: '900', fontSize: 14 },
  compTitle:  { fontSize: 16, fontWeight: '800', color: P.text, flex: 1 },
  emptyTag:   { backgroundColor: P.background, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.sm },
  emptyTagTxt:{ fontSize: 12, color: P.textSoft, fontWeight: '700' },

  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 16, opacity: 0.5 },
  emptyTxt: { fontSize: 13, color: P.textSoft, fontStyle: 'italic' },

  medRow:   { paddingHorizontal: 16, paddingBottom: 16 },
  medLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  medDot:   { width: 12, height: 12, borderRadius: 6 },
  medName:  { fontSize: 15, fontWeight: '800', color: P.text },
  medSub:   { fontSize: 12, color: P.textMuted, marginTop: 2 },

  lowBadge:    { alignSelf: 'flex-start', backgroundColor: P.amberSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.sm, marginBottom: 8, borderWidth: 1, borderColor: '#F6D878' },
  lowBadgeTxt: { fontSize: 11, color: P.amber, fontWeight: '800' },

  track:     { height: 8, backgroundColor: P.border, borderRadius: 999, marginBottom: 6 },
  trackFill: { height: 8, borderRadius: 999, minWidth: 4 },
  pillsTxt:  { fontSize: 12, color: P.textMuted, marginBottom: 10 },

  refillBtn: { alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 16, borderRadius: Radius.sm, ...Shadows.button },
  refillTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },

  globalEmpty:      { alignItems: 'center', padding: 48, gap: 10 },
  globalEmptyIcon:  { fontSize: 48 },
  globalEmptyTitle: { fontSize: 18, fontWeight: '900', color: P.text },
  globalEmptySub:   { fontSize: 14, color: P.textSoft, textAlign: 'center' },
});
