import { useRouter } from 'expo-router';
import { deleteUser, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { Eye, EyeOff } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { auth } from '../services/firebase';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { speak, voiceEnabled } = useAccessibility();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (voiceEnabled) {
      speak('Delete account. Warning! This action cannot be undone.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled]);

  const handleDelete = async () => {
    if (!password) {
      Alert.alert('Error', 'Please enter your password to confirm deletion.');
      return;
    }
    const user = auth.currentUser;
    if (!user || !user.email) {
       Alert.alert('Error', 'No user logged in.');
       return;
    }

    Alert.alert(
      'Final Warning',
      'Are you absolutely sure? This action cannot be reversed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              // Re-authenticate
              const credential = EmailAuthProvider.credential(user.email!, password);
              await reauthenticateWithCredential(user, credential);

              // Delete account
              await deleteUser(user);
              Alert.alert('Deleted', 'Your account has been permanently deleted.');
              // Redirect to Login/Index
              router.replace('/');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete account');
            }
            setLoading(false);
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Delete Account ⚠️</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.form}>
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>Warning!</Text>
          <Text style={styles.warningText}>
            Deleting your account will permanently erase all your health data, medication schedules, and device settings. This action cannot be undone.
          </Text>
        </View>

        <Text style={styles.label}>CONFIRM PASSWORD</Text>
        <View style={styles.passwordContainer}>
          <TextInput 
            style={styles.passwordInput} 
            secureTextEntry={!showPassword} 
            value={password} 
            onChangeText={setPassword} 
            placeholder="Enter your password to confirm" 
            placeholderTextColor="#94a3b8" 
          />
          <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
            {showPassword ? <EyeOff size={20} color="#94a3b8" /> : <Eye size={20} color="#94a3b8" />}
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity style={styles.btn} onPress={handleDelete} disabled={loading}>
          <Text style={styles.btnText}>{loading ? 'Deleting...' : 'Permanently Delete Account'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 48, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn: { width: 60 },
  backText: { color: '#64748b', fontSize: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  form: { padding: 20 },
  warningBox: { backgroundColor: '#fef2f2', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#fecaca' },
  warningTitle: { color: '#dc2626', fontWeight: 'bold', fontSize: 16, marginBottom: 8 },
  warningText: { color: '#dc2626', lineHeight: 22, fontSize: 14 },
  label: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 8, marginTop: 12, letterSpacing: 0.5 },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12 },
  passwordInput: { flex: 1, padding: 14, fontSize: 16, color: '#1e293b' },
  eyeBtn: { padding: 14 },
  btn: { backgroundColor: '#ef4444', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 32, elevation: 2, shadowColor: '#ef4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
