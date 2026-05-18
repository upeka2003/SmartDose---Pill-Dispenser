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
  await remove(ref(rtdb, `medications/${id}_0`));
  await remove(ref(rtdb, `medications/${id}_1`));
  await remove(ref(rtdb, `medications/${id}_2`));
  await remove(ref(rtdb, `medications/${id}_3`));
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

      // Primary liveness signal: uptimeMs is device millis() — always-increasing,
      // clock-independent. If present and changed since last write, device is alive.
      // We treat any data with connected:true as live when uptimeMs exists
      // (the Firebase onValue listener fires only on real changes, not cached stale data).
      if (status.uptimeMs !== undefined) {
        // Device firmware supports uptimeMs — trust connected flag directly.
        callback({ ...status, connected: status.connected === true });
        return;
      }

      // Fallback for older firmware without uptimeMs: use timestamp with generous window.
      // Use Math.abs so future timestamps (timezone mismatch) also pass the check.
      const lastSeen = Number(status.lastSyncMs ?? Date.parse(status.lastSync ?? ''));
      const now = Date.now();
      const ageMs = Math.abs(now - lastSeen); // absolute difference handles future timestamps
      const heartbeatFresh = !Number.isFinite(lastSeen) || ageMs < 12 * 60 * 60 * 1000; // 12h
      callback({
        ...status,
        connected: status.connected === true && heartbeatFresh,
      });
    },
    (error) => {
      // Firebase permission denied or network error
      const code = (error as any).code ?? 'unknown';
      console.error('[SmartDose] RTDB device status error:', code, error.message);
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
