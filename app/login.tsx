import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { Eye, EyeOff, LogIn, Pill, UserPlus } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { Palette } from '../constants/theme';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { auth } from '../services/firebase';

const CRITERIA = [
  { label: 'At least 8 characters',      test: (p: string) => p.length >= 8 },
  { label: 'Uppercase letter (A–Z)',      test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Lowercase letter (a–z)',      test: (p: string) => /[a-z]/.test(p) },
  { label: 'Number (0–9)',               test: (p: string) => /[0-9]/.test(p) },
  { label: 'Special character (!@#$…)',  test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const STRENGTH_LABELS = ['', 'Very Weak', 'Fair', 'Strong', 'Very Strong'];
const STRENGTH_COLORS = ['', '#ef4444', '#f59e0b', '#3b82f6', '#10b981'];

function getStrength(p: string) {
  if (!p) return 0;
  const met = CRITERIA.filter(c => c.test(p)).length;
  if (p.length < 6) return 1;
  if (met <= 2) return 1;
  if (met === 3) return 2;
  if (met === 4) return 3;
  return 4;
}

export default function LoginScreen() {
  const router = useRouter();
  const { speak, voiceEnabled } = useAccessibility();
  const [email, setEmail]                   = useState('');
  const [password, setPassword]             = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLogin, setIsLogin]               = useState(true);
  const [loading, setLoading]               = useState(false);
  const [showPassword, setShowPassword]     = useState(false);
  const [showConfirm, setShowConfirm]       = useState(false);

  const strength      = getStrength(password);
  const strengthColor = STRENGTH_COLORS[strength];
  const strengthLabel = STRENGTH_LABELS[strength];
  const passwordsMatch = confirmPassword === '' || password === confirmPassword;

  React.useEffect(() => {
    if (voiceEnabled) {
      speak(isLogin ? 'Sign in to your account' : 'Create a new account');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled, isLogin]);

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    if (!isLogin && password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('[Login] Auth error code:', error.code);
      console.error('[Login] Auth error message:', error.message);
      Alert.alert('Error', `${error.code}: ${error.message}`);
    }
    setLoading(false);
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <View style={s.bg}>
      <View style={s.blobTL} />
      <View style={s.blobBR} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Logo ── */}
          <View style={s.logoSection}>
            <View style={s.logoMark}>
              <Pill size={36} color="#fff" />
            </View>
            <Text style={s.appName}>SmartDose</Text>
            <Text style={s.appSub}>
              {isLogin ? 'Sign in to your account' : 'Create a new account'}
            </Text>
          </View>

          {/* ── Card ── */}
          <View style={s.card}>

            {/* Email */}
            <Text style={s.label}>Email</Text>
            <TextInput
              style={s.input}
              placeholder="you@example.com"
              placeholderTextColor="#94a3b8"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {/* Password */}
            <Text style={[s.label, { marginTop: 14 }]}>Password</Text>
            <View style={[
              s.inputRow,
              !isLogin && password.length > 0 && { borderColor: strengthColor },
            ]}>
              <TextInput
                style={s.inputFlex}
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={20} color="#94a3b8" /> : <Eye size={20} color="#94a3b8" />}
              </TouchableOpacity>
            </View>

            {/* Strength meter */}
            {!isLogin && password.length > 0 && (
              <View style={s.strengthBlock}>
                <View style={s.barsRow}>
                  {[1, 2, 3, 4].map(i => (
                    <View
                      key={i}
                      style={[s.bar, { backgroundColor: i <= strength ? strengthColor : '#e2e8f0' }]}
                    />
                  ))}
                  <Text style={[s.strengthLbl, { color: strengthColor }]}>{strengthLabel}</Text>
                </View>
                <View style={s.criteriaList}>
                  {CRITERIA.map(c => {
                    const ok = c.test(password);
                    return (
                      <View key={c.label} style={s.criteriaRow}>
                        <Text style={[s.criteriaIcon, { color: ok ? '#10b981' : '#94a3b8' }]}>
                          {ok ? '✓' : '✕'}
                        </Text>
                        <Text style={[s.criteriaText, { color: ok ? '#1e293b' : '#94a3b8' }]}>
                          {c.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Confirm password */}
            {!isLogin && (
              <>
                <Text style={[s.label, { marginTop: 14 }]}>Confirm Password</Text>
                <View style={[
                  s.inputRow,
                  confirmPassword.length > 0 && { borderColor: passwordsMatch ? '#10b981' : '#ef4444' },
                ]}>
                  <TextInput
                    style={s.inputFlex}
                    placeholder="Repeat password"
                    placeholderTextColor="#94a3b8"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirm}
                  />
                  <TouchableOpacity style={s.eyeBtn} onPress={() => setShowConfirm(!showConfirm)}>
                    {showConfirm ? <EyeOff size={20} color="#94a3b8" /> : <Eye size={20} color="#94a3b8" />}
                  </TouchableOpacity>
                </View>
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <Text style={s.errorText}>Passwords do not match</Text>
                )}
              </>
            )}

            {/* Submit */}
            <TouchableOpacity
              style={[s.btn, loading && { opacity: 0.65 }]}
              onPress={handleAuth}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={s.btnInner}>
                  {isLogin
                    ? <LogIn size={18} color="#fff" />
                    : <UserPlus size={18} color="#fff" />}
                  <Text style={s.btnText}>{isLogin ? 'Sign In' : 'Create Account'}</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Toggle */}
            <TouchableOpacity onPress={switchMode} style={{ marginTop: 18 }}>
              <Text style={s.switchText}>
                {isLogin ? "Don't have an account? " : 'Already have an account? '}
                <Text style={s.switchLink}>{isLogin ? 'Register' : 'Sign In'}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0B5F59' },
  blobTL: {
    position: 'absolute', top: -80, left: -80,
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  blobBR: {
    position: 'absolute', bottom: -100, right: -60,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 52 },

  /* logo */
  logoSection: { alignItems: 'center', marginBottom: 32 },
  logoMark: {
    width: 80, height: 80, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  appName: { fontSize: 30, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  appSub:  { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginTop: 6, fontWeight: '500' },

  /* card */
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 8,
  },
  label: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 7 },
  input: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 10, padding: 14, fontSize: 15, color: '#1e293b',
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10,
  },
  inputFlex: { flex: 1, padding: 14, fontSize: 15, color: '#1e293b' },
  eyeBtn:   { padding: 14 },

  /* strength */
  strengthBlock: { marginTop: 10, marginBottom: 2 },
  barsRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  bar:      { flex: 1, height: 5, borderRadius: 999 },
  strengthLbl: { fontSize: 12, fontWeight: '800', width: 80, textAlign: 'right' },
  criteriaList: { gap: 6 },
  criteriaRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  criteriaIcon: { fontSize: 13, fontWeight: '800', width: 14, textAlign: 'center' },
  criteriaText: { fontSize: 13 },

  errorText: { fontSize: 12, color: '#ef4444', marginTop: 5, fontWeight: '600' },

  /* button */
  btn: {
    backgroundColor: Palette.primary, padding: 15, borderRadius: 10,
    alignItems: 'center', marginTop: 22,
    shadowColor: Palette.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 4,
  },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText:  { color: '#fff', fontSize: 16, fontWeight: '800' },

  /* toggle */
  switchText: { textAlign: 'center', color: '#94a3b8', fontSize: 14 },
  switchLink: { color: Palette.primary, fontWeight: '700' },
});
