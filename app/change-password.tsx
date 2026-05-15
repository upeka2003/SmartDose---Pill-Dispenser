import { useRouter } from 'expo-router';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { Eye, EyeOff } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { auth } from '../services/firebase';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { speak, voiceEnabled } = useAccessibility();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (voiceEnabled) {
      speak('Change your password. Please confirm your current password.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled]);

  const handleUpdate = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match!');
      return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) {
       Alert.alert('Error', 'No user logged in.');
       return;
    }

    setLoading(true);
    try {
      // Re-authenticate
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPassword);
      Alert.alert('Success ✅', 'Your password was successfully updated!');
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update password');
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Change Password 🔒</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.form}>
        <Text style={styles.infoText}>
          To change your password, please confirm your current password below.
        </Text>

        <Text style={styles.label}>CURRENT PASSWORD</Text>
        <View style={styles.passwordContainer}>
          <TextInput 
            style={styles.passwordInput} 
            secureTextEntry={!showCurrent} 
            value={currentPassword} 
            onChangeText={setCurrentPassword} 
            placeholder="Enter current password" 
            placeholderTextColor="#94a3b8" 
          />
          <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowCurrent(!showCurrent)}>
            {showCurrent ? <EyeOff size={20} color="#94a3b8" /> : <Eye size={20} color="#94a3b8" />}
          </TouchableOpacity>
        </View>
        
        <Text style={styles.label}>NEW PASSWORD</Text>
        <View style={styles.passwordContainer}>
          <TextInput 
            style={styles.passwordInput} 
            secureTextEntry={!showNew} 
            value={newPassword} 
            onChangeText={setNewPassword} 
            placeholder="Enter new password" 
            placeholderTextColor="#94a3b8" 
          />
          <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowNew(!showNew)}>
            {showNew ? <EyeOff size={20} color="#94a3b8" /> : <Eye size={20} color="#94a3b8" />}
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>CONFIRM NEW PASSWORD</Text>
        <View style={styles.passwordContainer}>
          <TextInput 
            style={styles.passwordInput} 
            secureTextEntry={!showConfirm} 
            value={confirmPassword} 
            onChangeText={setConfirmPassword} 
            placeholder="Confirm new password" 
            placeholderTextColor="#94a3b8" 
          />
          <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirm(!showConfirm)}>
            {showConfirm ? <EyeOff size={20} color="#94a3b8" /> : <Eye size={20} color="#94a3b8" />}
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity style={styles.btn} onPress={handleUpdate} disabled={loading}>
          <Text style={styles.btnText}>{loading ? 'Updating...' : 'Update Password'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 48, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn: { width: 60 },
  backText: { color: '#ef4444', fontSize: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  form: { padding: 20 },
  infoText: { fontSize: 14, color: '#64748b', marginBottom: 20, lineHeight: 22 },
  label: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 8, marginTop: 12, letterSpacing: 0.5 },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12 },
  passwordInput: { flex: 1, padding: 14, fontSize: 16, color: '#1e293b' },
  eyeBtn: { padding: 14 },
  btn: { backgroundColor: '#3b82f6', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 32, elevation: 2, shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
