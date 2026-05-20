import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { Camera, CheckCircle, Lock, Mail, Pencil, User } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, Platform, ScrollView,
    StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Palette, Radius, Shadows } from '../constants/theme';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { auth } from '../services/firebase';
import { getProfile, saveProfile } from '../services/profileService';

// Resize a File to maxPx on its longest side and return a base64 JPEG data-URL.
// Keeps the result small enough to fit in a Firestore document (< 1 MB).
function resizeImageToBase64(file: File, maxPx = 256, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      console.log(`[Profile] Resizing ${img.width}×${img.height} → ${w}×${h}`);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 2D not supported')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('Image load failed')); };
    img.src = blobUrl;
  });
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ uri, name, size = 96 }: { uri: string; name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  if (uri) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
        {/* Use img on web, Image on native */}
        {Platform.OS === 'web'
          ? <img src={uri} style={{ width: size, height: size, objectFit: 'cover' }} />
          : (() => {
              const { Image } = require('react-native');
              return <Image source={{ uri }} style={{ width: size, height: size }} />;
            })()
        }
      </View>
    );
  }

  const bg = ['#0F766E', '#2563EB', '#7C3AED', '#DB2777'][
    name.charCodeAt(0) % 4 || 0
  ];
  return (
    <View style={[s.initialsCircle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[s.initialsText, { fontSize: size * 0.33 }]}>{initials}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const { speak, voiceEnabled } = useAccessibility();
  const fileInputRef = useRef<any>(null);

  const [userId, setUserId]         = useState('');
  const [email, setEmail]           = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio]               = useState('');
  const [photoURL, setPhotoURL]     = useState('');
  const [uploading, setUploading]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [loading, setLoading]       = useState(true);
  const [saved, setSaved]           = useState(false);

  // Load current user + profile from Firestore
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace('/login'); return; }
      setUserId(user.uid);
      setEmail(user.email ?? '');

      const profile = await getProfile(user.uid);
      if (profile) {
        setDisplayName(profile.displayName || user.displayName || '');
        setBio(profile.bio || '');
        setPhotoURL(profile.photoURL || user.photoURL || '');
      } else {
        setDisplayName(user.displayName || '');
        setPhotoURL(user.photoURL || '');
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  React.useEffect(() => {
    if (voiceEnabled) {
      speak('Profile page. Edit your details here.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled]);

  // ── Photo picker ────────────────────────────────────────────────────────────

  const pickPhoto = () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file || !userId) return;
        try {
          // Convert to base64 using canvas (no Firebase Storage, no CORS)
          const base64 = await resizeImageToBase64(file);
          console.log('[Profile] base64 length:', base64.length);
          setPhotoURL(base64);
          await saveProfile(userId, { photoURL: base64 });
          console.log('[Profile] photo saved to Firestore');
        } catch (err) {
          console.error('[Profile] photo save error:', err);
        }
      };
      input.click();
    }
  };

  // ── Save profile ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert('Error', 'Name cannot be empty.');
      return;
    }
    console.log('[Profile] Saving profile — userId:', userId, 'photoURL length:', photoURL.length);
    setSaving(true);
    try {
      await saveProfile(userId, { displayName: displayName.trim(), bio: bio.trim(), photoURL });
      console.log('[Profile] Profile saved successfully');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      console.error('[Profile] Save failed:', err);
      Alert.alert('Save failed', err.message ?? String(err));
    }
    setSaving(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.loadingBox}>
        <ActivityIndicator size="large" color={Palette.primary} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backText}>‹  Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Profile</Text>
        <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color={Palette.primary} />
            : saved
              ? <CheckCircle size={22} color={Palette.green} />
              : <Text style={s.saveBtnText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero strip ── */}
        <View style={s.hero}>
          <View style={s.heroStrip} />

          {/* Avatar */}
          <View style={s.avatarWrap}>
            <View style={s.avatarRing}>
              <Avatar uri={photoURL} name={displayName || email} size={88} />
            </View>
            <TouchableOpacity style={s.cameraBtn} onPress={pickPhoto} disabled={uploading}>
              {uploading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Camera size={16} color="#fff" />}
            </TouchableOpacity>
          </View>

          <Text style={s.heroName}>{displayName || 'Set your name'}</Text>
          <Text style={s.heroEmail}>{email}</Text>
        </View>

        {/* ── Form ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>PERSONAL INFORMATION</Text>

          <View style={s.card}>
            {/* Full Name */}
            <View style={s.fieldRow}>
              <View style={s.fieldIcon}><User size={16} color={Palette.primary} /></View>
              <View style={s.fieldBody}>
                <Text style={s.fieldLabel}>Full Name</Text>
                <TextInput
                  style={s.fieldInput}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Enter your full name"
                  placeholderTextColor={Palette.textSoft}
                />
              </View>
            </View>

            <View style={s.divider} />

            {/* Bio */}
            <View style={s.fieldRow}>
              <View style={s.fieldIcon}><Pencil size={16} color={Palette.primary} /></View>
              <View style={s.fieldBody}>
                <Text style={s.fieldLabel}>Bio</Text>
                <TextInput
                  style={[s.fieldInput, s.bioInput]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Tell us about yourself…"
                  placeholderTextColor={Palette.textSoft}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>ACCOUNT</Text>
          <View style={s.card}>
            <View style={s.fieldRow}>
              <View style={s.fieldIcon}><Mail size={16} color={Palette.textMuted} /></View>
              <View style={s.fieldBody}>
                <Text style={s.fieldLabel}>Email</Text>
                <Text style={s.fieldReadonly}>{email}</Text>
              </View>
              <Lock size={14} color={Palette.textSoft} />
            </View>
          </View>
        </View>

        {/* Save button (bottom) */}
        <TouchableOpacity style={[s.bigSaveBtn, saving && { opacity: 0.65 }]} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.bigSaveBtnText}>{saved ? '✓  Saved!' : 'Save Changes'}</Text>}
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Palette.background },
  loadingBox:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.background },

  /* header */
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 50, paddingBottom: 14,
    backgroundColor: Palette.surface, borderBottomWidth: 1, borderBottomColor: Palette.border,
  },
  backBtn:      { width: 64 },
  backText:     { fontSize: 17, color: Palette.primary, fontWeight: '700' },
  headerTitle:  { fontSize: 17, fontWeight: '800', color: Palette.text },
  saveBtn:      { width: 64, alignItems: 'flex-end', justifyContent: 'center', height: 28 },
  saveBtnText:  { fontSize: 16, color: Palette.primary, fontWeight: '800' },

  scroll: { paddingBottom: 48 },

  /* hero */
  hero:       { alignItems: 'center', paddingBottom: 24, marginBottom: 8 },
  heroStrip:  { height: 80, width: '100%', backgroundColor: Palette.primary, position: 'absolute', top: 0 },
  avatarWrap: { marginTop: 36, position: 'relative' },
  avatarRing: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: '#fff',
    overflow: 'hidden',
    ...Shadows.card,
  },
  initialsCircle: { alignItems: 'center', justifyContent: 'center' },
  initialsText:   { color: '#fff', fontWeight: '900' },
  cameraBtn: {
    position: 'absolute', bottom: 0, right: 0,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Palette.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  heroName:  { marginTop: 12, fontSize: 20, fontWeight: '900', color: Palette.text },
  heroEmail: { fontSize: 13, color: Palette.textMuted, marginTop: 3, fontWeight: '500' },

  /* sections */
  section:      { paddingHorizontal: 16, marginTop: 20 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: Palette.textMuted, marginBottom: 8, letterSpacing: 0.6, textTransform: 'uppercase' },
  card: {
    backgroundColor: Palette.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Palette.border, overflow: 'hidden',
    ...Shadows.card,
  },
  divider: { height: 1, backgroundColor: Palette.border, marginLeft: 54 },

  /* field */
  fieldRow:     { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 12 },
  fieldIcon:    { width: 28, height: 28, borderRadius: 8, backgroundColor: Palette.primarySoft, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  fieldBody:    { flex: 1 },
  fieldLabel:   { fontSize: 12, fontWeight: '700', color: Palette.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldInput:   { fontSize: 15, color: Palette.text, fontWeight: '600', padding: 0 },
  bioInput:     { minHeight: 60, textAlignVertical: 'top' },
  fieldReadonly:{ fontSize: 15, color: Palette.textMuted, fontWeight: '600' },

  /* big save */
  bigSaveBtn: {
    marginHorizontal: 16, marginTop: 28,
    backgroundColor: Palette.primary, borderRadius: Radius.md,
    padding: 16, alignItems: 'center',
    ...Shadows.button,
  },
  bigSaveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
