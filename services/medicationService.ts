import { onValue, ref, remove, set } from 'firebase/database';
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db, rtdb } from './firebase';

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  time: string;
  times?: string[];
  compartment: number;
  color: string;
  active: boolean;
  taken?: boolean;
  totalPills?: number;
  currentPills?: number;
  pillCount?: number;
  frequency?: string;
  mealPreference?: string;
  notes?: string;
  lastRefillAt?: string;
}

export interface DeviceStatus {
  connected: boolean;
  battery: number;
  lastSync: string;
  signalStrength: number;
  model?: string;
  serialNumber?: string;
  firmware?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  unread: boolean;
  timestamp: string;
  status?: string;
  medication?: string;
}

export interface AdherenceLog {
  id: string;
  medicationId: string;
  date: string;
  time: string;
  status: 'taken' | 'missed';
  timestamp: string;
}

export const listenMedications = (callback: (meds: Medication[]) => void) => {
  const colRef = collection(db, 'medications');
  return onSnapshot(colRef, (snapshot) => {
    const meds = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    })) as Medication[];
    callback(meds);
  });
};

export const deleteMedication = async (id: string) => {
  await deleteDoc(doc(db, 'medications', id));
  for (let i = 0; i < 8; i++) {
    await remove(ref(rtdb, `smartdose/medications/${id}_${i}`));
  }
};

export const markMedicationTaken = async (id: string) => {
  const docRef = doc(db, 'medications', id);
  await updateDoc(docRef, { taken: true });
  const now = new Date();
  await addDoc(collection(db, 'adherenceLogs'), {
    medicationId: id,
    status: 'taken',
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    date: now.toISOString().split('T')[0],
    timestamp: now.toISOString(),
  });
};

export const listenAdherenceLogs = (callback: (logs: AdherenceLog[]) => void) => {
  const colRef = collection(db, 'adherenceLogs');
  return onSnapshot(colRef, (snapshot) => {
    const logs = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    })) as AdherenceLog[];
    callback(logs);
  });
};

export const logMedicationDose = async (
  medicationId: string,
  status: 'taken' | 'missed',
  time: string,
  date: string = new Date().toISOString().split('T')[0]
) => {
  const colRef = collection(db, 'adherenceLogs');
  await addDoc(colRef, {
    medicationId,
    status,
    time,
    date,
    timestamp: new Date().toISOString()
  });
};

export const listenAppNotifications = (callback: (notifications: AppNotification[]) => void) => {
  const notifRef = ref(rtdb, 'smartdose/notifications');
  return onValue(notifRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }
    const data = snapshot.val();
    const list: AppNotification[] = Object.entries(data)
      .map(([id, val]: [string, any]) => ({
        id,
        title: val.status === 'taken'
          ? 'Dose Taken'
          : val.status === 'missed'
          ? 'Dose Missed'
          : 'Dispensed',
        message: val.status === 'taken'
          ? `${val.medication} dose taken successfully!`
          : val.status === 'missed'
          ? `${val.medication} dose was missed!`
          : `${val.medication} was dispensed manually.`,
        time: val.time || '',
        unread: !val.read,
        timestamp: id,
        status: val.status,
        medication: val.medication,
      }))
      .sort((a, b) => b.id.localeCompare(a.id));
    callback(list);
  });
};

export const markNotificationRead = async (id: string) => {
  await set(ref(rtdb, `smartdose/notifications/${id}/read`), true);
};

export const markAllNotificationsRead = async (notifications: AppNotification[]) => {
  for (const item of notifications) {
    if (item.unread) {
      await set(ref(rtdb, `smartdose/notifications/${item.id}/read`), true);
    }
  }
};

export const markTakenRTDB = async (med: Medication) => {
  const now     = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const unixSec = Math.floor(now.getTime() / 1000);
  const slotKey = `${med.id}_0`;

  // Update lastStatus on the primary RTDB slot so the Home page polling picks it up
  await set(ref(rtdb, `smartdose/medications/${slotKey}/lastStatus`), 'taken');

  // Log to RTDB history (same format the firmware uses; compartment is 0-indexed there)
  await set(ref(rtdb, `smartdose/history/${unixSec}`), {
    medicationId: med.id,
    medication:   med.name,
    compartment:  med.compartment - 1,
    status:       'taken',
    time:         timeStr,
    source:       'manual',
  });
};

export const dispenseNow = async (compartment: number) => {
  await set(ref(rtdb, 'smartdose/commands'), {
    dispenseNow: true,
    compartment: compartment,
    pillCount: 1,
    openDoor: false
  });
};

export const findDevice = async () => {
  await set(ref(rtdb, 'smartdose/commands'), {
    findDevice: true,
    dispenseNow: false,
    openDoor: false
  });
};

export const stopFindDevice = async () => {
  await set(ref(rtdb, 'smartdose/commands/findDevice'), false);
};

export const setPowerSaving = async (enabled: boolean) => {
  await set(ref(rtdb, 'smartdose/settings/powerSaving'), enabled);
};

export const listenPowerSaving = (callback: (enabled: boolean) => void) => {
  const r = ref(rtdb, 'smartdose/settings/powerSaving');
  return onValue(r, (snapshot) => {
    callback(snapshot.exists() ? !!snapshot.val() : false);
  });
};

// Heartbeat timeout: device sends status every 60s; allow 5 minutes before marking offline.
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export const listenDeviceStatus = (callback: (status: any) => void) => {
  const statusRef = ref(rtdb, 'smartdose/device');
  return onValue(
    statusRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback({ connected: false });
        return;
      }
      const status = snapshot.val();
      const now = Date.now();

      // Primary: Firebase server timestamp — set by Firebase itself, always accurate UTC.
      // Device writes {".sv":"timestamp"} which Firebase replaces with server ms.
      const serverTime = Number(status.serverTime);
      if (Number.isFinite(serverTime) && serverTime > 1_000_000_000_000) {
        const ageMs = now - serverTime;
        // Allow up to 30s future offset (phone/server clock skew tolerance).
        const fresh = ageMs > -30_000 && ageMs < HEARTBEAT_TIMEOUT_MS;
        callback({ ...status, connected: status.connected === true && fresh });
        return;
      }

      // Fallback for older firmware without serverTime.
      // RTC stores local time (UTC+5:30) treated as UTC → lastSyncMs is ~19800000ms
      // (5.5 h) in the future.  Without Math.abs, a negative ageMs (future timestamp
      // = device just wrote this) is correctly treated as fresh, while a large
      // positive ageMs (device genuinely offline for hours) triggers the timeout.
      const lastSeen = Number(status.lastSyncMs ?? Date.parse(status.lastSync ?? ''));
      if (!Number.isFinite(lastSeen)) {
        callback({ ...status, connected: status.connected === true });
        return;
      }
      const ageMs = now - lastSeen; // negative when timestamp is in the future (timezone-shifted RTC)
      const fresh = ageMs < HEARTBEAT_TIMEOUT_MS;
      callback({ ...status, connected: status.connected === true && fresh });
    },
    (error) => {
      const code = (error as any).code ?? 'unknown';
      console.error('[SmartDose] RTDB listenDeviceStatus error:', code, error.message);
      callback({ connected: false, _rtdbError: code });
    }
  );
};

export const listenESP32History = (callback: (history: any[]) => void) => {
  const historyRef = ref(rtdb, 'smartdose/history');
  return onValue(historyRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const list = Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val }));
      callback(list);
    } else {
      callback([]);
    }
  });
};

export const listenRTDBMedicationStatuses = (
  callback: (statuses: Record<string, string>) => void
) => {
  const medsRef = ref(rtdb, 'smartdose/medications');
  return onValue(medsRef, (snapshot) => {
    if (!snapshot.exists()) { callback({}); return; }
    const data = snapshot.val() as Record<string, any>;
    const statuses: Record<string, string> = {};
    for (const val of Object.values(data)) {
      if (!val?.lastStatus) continue;
      const status = String(val.lastStatus);
      // Primary: match by Firestore doc ID
      if (val.medicationId && !statuses[val.medicationId]) {
        statuses[val.medicationId] = status;
      }
      // Fallback: match by medication name (lowercased)
      if (val.name) {
        const nameKey = 'name:' + String(val.name).toLowerCase();
        if (!statuses[nameKey]) statuses[nameKey] = status;
      }
      // Fallback: match by compartment number (1-indexed as stored by app)
      if (val.compartment != null) {
        const compKey = 'comp:' + String(val.compartment);
        if (!statuses[compKey]) statuses[compKey] = status;
      }
    }
    callback(statuses);
  });
};

export const listenInventory = (callback: (inventory: Record<string, number>) => void) => {
  const inventoryRef = ref(rtdb, 'smartdose/inventory');
  return onValue(inventoryRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val());
    } else {
      callback({});
    }
  });
};

export default {};
