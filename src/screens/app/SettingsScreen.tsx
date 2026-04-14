import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  Image, Switch, ScrollView, TextInput, Modal, ActionSheetIOS, Platform
} from 'react-native';
import { auth, db, storage } from '../../services/firebaseConfig';
import { signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, updateDoc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';
import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';

// Extended color palette — cubriendo todo el espectro
const COLOR_PALETTE = [
  '#ef4444','#f97316','#f59e0b','#eab308','#84cc16',
  '#22c55e','#10b981','#14b8a6','#06b6d4','#0ea5e9',
  '#3b82f6','#6366f1','#8b5cf6','#a855f7','#d946ef',
  '#ec4899','#f43f5e','#64748b','#1e293b','#ffffff',
];

export default function SettingsScreen() {
  const { user, refreshUser } = useAuth();
  const {
    primaryColor, setPrimaryColor, isDarkMode, toggleDarkMode,
    isCalendarView, toggleCalendarView, autoApproveTournament, toggleAutoApproveTournament,
    openMatchCreation, toggleOpenMatchCreation, fontSize, setFontSize, fontScale, colors
  } = useTheme();
  const { t, language, setLanguage } = useTranslation();

  // Profile editing
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.nombreApellidos || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Password
  const [pwModalVisible, setPwModalVisible] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  // Admin mode
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Master password
  const [masterPwModal, setMasterPwModal] = useState(false);
  const [newMasterPw, setNewMasterPw] = useState('');
  const [savingMasterPw, setSavingMasterPw] = useState(false);

  // Tournament slots
  const [slots, setSlots] = useState<any[]>([]);
  const [slotModalVisible, setSlotModalVisible] = useState(false);
  const [newSlotDay, setNewSlotDay] = useState('Lunes');
  const [newSlotTime, setNewSlotTime] = useState('17:00');
  const [savingSlot, setSavingSlot] = useState(false);
  const [matchesPerWeek, setMatchesPerWeek] = useState(1);
  const [savingMpw, setSavingMpw] = useState(false);

  // Notif prefs
  const [notifPrefs, setNotifPrefs] = useState({
    pushEnabled: true, invitations: true, joins: true, leaves: true, changes: true, cancellations: true,
  });

  const s = (base: number) => base * fontScale;
  const styles = getStyles(colors, primaryColor, s);

  useEffect(() => {
    if (!user?.uid) return;
    const unsubNotifs = onSnapshot(doc(db, 'users', user.uid), snap => {
      if (snap.exists() && snap.data().notifPrefs) {
        setNotifPrefs(p => ({ ...p, ...snap.data().notifPrefs }));
      }
    });
    const unsubSlots = onSnapshot(doc(db, 'config', 'tournamentSlots'), snap => {
      if (snap.exists()) {
        setSlots(snap.data().slots || []);
        if (snap.data().matchesPerWeek) setMatchesPerWeek(snap.data().matchesPerWeek);
      }
    });
    return () => { unsubNotifs(); unsubSlots(); };
  }, [user?.uid]);

  const addTournamentSlot = async () => {
    setSavingSlot(true);
    try {
      // Auto-calculate end time (1.5h)
      const [h, m] = newSlotTime.split(':').map(Number);
      const startTotal = h * 60 + m;
      const endTotal = startTotal + 90;
      const endH = Math.floor(endTotal / 60) % 24;
      const endM = endTotal % 60;
      const endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

      const newSlot = {
        id: Date.now().toString(),
        day: newSlotDay,
        start: newSlotTime,
        end: endTime,
        display: `${newSlotDay} ${newSlotTime} - ${endTime}`
      };

      const updatedSlots = [...slots, newSlot].sort((a, b) => {
        const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        const dayDiff = days.indexOf(a.day) - days.indexOf(b.day);
        if (dayDiff !== 0) return dayDiff;
        return a.start.localeCompare(b.start);
      });

      await setDoc(doc(db, 'config', 'tournamentSlots'), { slots: updatedSlots });
      setSlotModalVisible(false);
    } catch (e: any) { Alert.alert(t('error'), e.message); }
    finally { setSavingSlot(false); }
  };

  const deleteSlot = async (id: string) => {
    const updated = slots.filter(s => s.id !== id);
    await setDoc(doc(db, 'config', 'tournamentSlots'), { slots: updated }, { merge: true });
  };

  const saveMatchesPerWeek = async (val: number) => {
    const v = Math.max(1, Math.min(5, val));
    setMatchesPerWeek(v);
    setSavingMpw(true);
    try {
      await setDoc(doc(db, 'config', 'tournamentSlots'), { matchesPerWeek: v }, { merge: true });
    } catch (e: any) { Alert.alert(t('error'), e.message); }
    finally { setSavingMpw(false); }
  };

  const saveNotifPref = async (key: string, value: boolean) => {
    if (!user?.uid) return;
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    await updateDoc(doc(db, 'users', user.uid), { notifPrefs: updated });
  };

  const handleLogout = async () => {
    try { await signOut(auth); } catch (e) { Alert.alert(t('error'), 'No se pudo cerrar sesión'); }
  };

  const handleSaveProfile = async () => {
    if (!user || !nameInput.trim()) return;
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { nombreApellidos: nameInput.trim() });
      await refreshUser();
      setEditingName(false);
    } catch (e: any) { Alert.alert(t('error'), e.message); }
    finally { setSavingProfile(false); }
  };

  const handleChangePassword = async () => {
    if (newPw !== confirmPw) return Alert.alert(t('error'), t('passwords_no_match'));
    if (!user || !auth.currentUser) return;
    setChangingPw(true);
    try {
      const cred = EmailAuthProvider.credential(user.email!, currentPw);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, newPw);
      Alert.alert(t('success'), '¡Contraseña actualizada!');
      setPwModalVisible(false);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (e: any) { Alert.alert(t('error'), 'Verifica tu contraseña actual.'); }
    finally { setChangingPw(false); }
  };

  const handleActivateAdmin = async () => {
    const configSnap = await getDoc(doc(db, 'config', 'settings'));
    const masterPw = configSnap.exists() ? configSnap.data().masterPassword : 'Sabardes34';
    if (password !== masterPw) return Alert.alert(t('error'), 'Contraseña incorrecta');
    if (!user) return;
    try {
      setLoading(true);
      await updateDoc(doc(db, 'users', user.uid), { role: 'admin' });
      Alert.alert(t('success'), 'Modo administrador activado.');
      setPassword('');
      await refreshUser();
    } catch (e) { Alert.alert(t('error'), 'No se pudo actualizar el rol.'); }
    finally { setLoading(false); }
  };

  const handleDeactivateAdmin = async () => {
    if (!user) return;
    try {
      setLoading(true);
      await updateDoc(doc(db, 'users', user.uid), { role: 'user' });
      Alert.alert(t('success'), 'Privilegios de administrador eliminados.');
      await refreshUser();
    } catch (e) { Alert.alert(t('error'), 'No se pudo actualizar el rol.'); }
    finally { setLoading(false); }
  };

  const handleSaveMasterPassword = async () => {
    if (!newMasterPw.trim()) return;
    setSavingMasterPw(true);
    try {
      await setDoc(doc(db, 'config', 'settings'), { masterPassword: newMasterPw.trim() }, { merge: true });
      Alert.alert(t('success'), 'Contraseña maestra actualizada.');
      setMasterPwModal(false); setNewMasterPw('');
    } catch (e: any) { Alert.alert(t('error'), e.message); }
    finally { setSavingMasterPw(false); }
  };

  const retryNotificationPermissions = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    Alert.alert(status === 'granted' ? '✅ Permisos concedidos' : '❌ Permisos denegados',
      status === 'granted' ? 'Las notificaciones están activadas.' : 'Ve a Ajustes del sistema para activarlas manualmente.');
  };

  const showImageSourcePicker = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancelar', 'Sacar foto', 'Elegir de la galería'],
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) takePhoto();
          else if (idx === 2) pickFromGallery();
        }
      );
    } else {
      // Android: show Alert with two buttons
      Alert.alert('Foto de perfil', '¿Cómo quieres actualizar tu foto?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: '📷 Sacar foto', onPress: takePhoto },
        { text: '🖼️ Galería', onPress: pickFromGallery },
      ]);
    }
  };

  const takePhoto = async () => {
    if (!user) return;
    const camPerm = await ImagePicker.requestCameraPermissionsAsync();
    if (!camPerm.granted) {
      return Alert.alert(
        'Permiso necesario',
        'Necesitas conceder acceso a la cámara. Ve a Ajustes > PadelSabardes > Cámara.',
        [{ text: 'OK' }]
      );
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      uploadImage(result.assets[0].uri);
    }
  };

  const pickFromGallery = async () => {
    if (!user) return;
    const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!libPerm.granted) {
      return Alert.alert(
        'Permiso necesario',
        'Necesitas conceder acceso a la galería. Ve a Ajustes > PadelSabardes > Fotos.',
        [{ text: 'OK' }]
      );
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      uploadImage(result.assets[0].uri);
    }
  };

  // Kept for compatibility
  const pickImage = showImageSourcePicker;

  const uploadImage = async (uri: string) => {
    if (!user) return;
    try {
      setUploadingImage(true);

      // Use fetch() instead of XHR — works correctly with Firebase Web SDK v12 in React Native
      const response = await fetch(uri);
      if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
      const blob = await response.blob();

      const storageRef = ref(storage, `profiles/${user.uid}`);
      await uploadBytes(storageRef, blob);
      const downloadUrl = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'users', user.uid), { fotoURL: downloadUrl });
      await refreshUser();
      Alert.alert('✅ Foto actualizada', '¡Tu foto de perfil ha sido actualizada con éxito!');
    } catch (e: any) {
      console.error('Upload error:', e);
      Alert.alert(
        t('error'),
        `No se pudo subir la foto.\n\nDetalle: ${e?.message || 'Error desconocido'}\n\nAsegúrate de que Firebase Storage tenga las reglas correctas.`
      );
    } finally { setUploadingImage(false); }
  };

  // Component code continues...


  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.pageTitle}>{t('settings')}</Text>

        {/* ── MI PERFIL ── */}
        <SectionLabel label={t('profile')} styles={styles} />
        <SectionCard styles={styles}>
          <View style={styles.profileRow}>
            <TouchableOpacity onPress={pickImage} style={styles.avatarWrap}>
              {uploadingImage ? (
                <View style={[styles.avatar, styles.avatarPlaceholder]}><ActivityIndicator color={primaryColor} /></View>
              ) : user?.fotoURL ? (
                <Image source={{ uri: user.fotoURL }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>{user?.nombreApellidos?.charAt(0)?.toUpperCase()}</Text>
                </View>
              )}
              <View style={[styles.cameraBadge, { backgroundColor: primaryColor }]}>
                <Ionicons name="camera" size={12} color="#fff" />
              </View>
            </TouchableOpacity>

            <View style={styles.profileInfo}>
              {editingName ? (
                <View style={styles.nameEditRow}>
                  <TextInput
                    style={styles.nameInput}
                    value={nameInput}
                    onChangeText={setNameInput}
                    autoFocus
                    placeholder={t('full_name')}
                    placeholderTextColor={colors.textDim}
                  />
                  <TouchableOpacity onPress={handleSaveProfile} disabled={savingProfile} style={styles.nameActionBtn}>
                    {savingProfile ? <ActivityIndicator size="small" color={primaryColor} /> : <Ionicons name="checkmark" size={20} color={primaryColor} />}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setEditingName(false); setNameInput(user?.nombreApellidos || ''); }} style={styles.nameActionBtn}>
                    <Ionicons name="close" size={20} color={colors.textDim} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.nameDisplayRow}>
                  <Text style={styles.profileName} numberOfLines={1}>{user?.nombreApellidos}</Text>
                  <TouchableOpacity onPress={() => setEditingName(true)} style={styles.pencilBtn}>
                    <Ionicons name="pencil" size={16} color={primaryColor} />
                  </TouchableOpacity>
                </View>
              )}
              <Text style={[styles.profileRole, { color: primaryColor }]}>{user?.role}</Text>
              <Text style={styles.profileEmail}>{user?.email}</Text>
            </View>
          </View>

          <Divider styles={styles} />

          <TouchableOpacity style={styles.actionRow} onPress={() => setPwModalVisible(true)}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textDim} />
            <Text style={styles.actionRowText}>{t('change_password')}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </TouchableOpacity>
        </SectionCard>

        {/* ── PARTIDOS ── */}
        {user?.role === 'admin' && (
          <>
            <SectionLabel label="Partidos" styles={styles} />
            <SectionCard styles={styles}>
              <ToggleRow
                icon="tennisball-outline"
                label={t('open_match_creation')}
                desc={t('open_match_creation_desc')}
                value={openMatchCreation}
                onToggle={toggleOpenMatchCreation}
                styles={styles}
                primaryColor={primaryColor}
                colors={colors}
              />
            </SectionCard>
          </>
        )}

        {/* ── TORNEOS (ADMIN) ── */}
        {user?.role === 'admin' && (
          <>
            <SectionLabel label={t('admin_options')} styles={styles} />
            <SectionCard styles={styles}>
              <ToggleRow
                icon="trophy-outline"
                label={t('auto_approve')}
                desc={t('auto_approve_desc')}
                value={autoApproveTournament}
                onToggle={toggleAutoApproveTournament}
                styles={styles}
                primaryColor={primaryColor}
                colors={colors}
              />
            </SectionCard>
          </>
        )}



        {/* ── APARIENCIA ── */}
        <SectionLabel label={t('appearance')} styles={styles} />
        <SectionCard styles={styles}>
          <ToggleRow icon="moon-outline" label={t('dark_mode')} value={isDarkMode} onToggle={toggleDarkMode} styles={styles} primaryColor={primaryColor} colors={colors} />
          <Divider styles={styles} />
          <ToggleRow icon="calendar-outline" label={t('calendar_view')} value={isCalendarView} onToggle={toggleCalendarView} styles={styles} primaryColor={primaryColor} colors={colors} />

          <Divider styles={styles} />
          <Text style={styles.subLabel}>{t('language')}</Text>
          <View style={styles.langRow}>
            {(['es', 'gl'] as const).map(lang => (
              <TouchableOpacity
                key={lang}
                style={[styles.langBtn, language === lang && { backgroundColor: primaryColor, borderColor: primaryColor }]}
                onPress={() => setLanguage(lang)}
              >
                <Text style={[styles.langBtnText, language === lang && { color: '#fff' }]}>
                  {lang === 'es' ? '🇪🇸 Castellano de Castilla' : '🏔️ Galego'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Divider styles={styles} />
          <Text style={styles.subLabel}>{t('main_color')}</Text>
          <View style={styles.colorGrid}>
            {COLOR_PALETTE.map(color => (
              <TouchableOpacity
                key={color}
                onPress={() => setPrimaryColor(color)}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: color },
                  primaryColor === color && styles.colorSwatchSelected,
                  color === '#ffffff' && { borderWidth: 1, borderColor: colors.border }
                ]}
              >
                {primaryColor === color && <Ionicons name="checkmark" size={14} color={color === '#ffffff' ? '#000' : '#fff'} />}
              </TouchableOpacity>
            ))}
          </View>

          <Divider styles={styles} />
          <Text style={styles.subLabel}>{t('font_size')}</Text>
          <View style={styles.fontRow}>
            {(['small', 'normal', 'large'] as const).map((size, i) => (
              <TouchableOpacity
                key={size}
                style={[styles.fontBtn, fontSize === size && { backgroundColor: primaryColor, borderColor: primaryColor }]}
                onPress={() => setFontSize(size)}
              >
                <Text style={{ fontSize: [13, 17, 22][i], fontWeight: '900', color: fontSize === size ? '#fff' : colors.text }}>A</Text>
              </TouchableOpacity>
            ))}
          </View>
        </SectionCard>

        {/* ── NOTIFICACIONES ── */}
        <SectionLabel label={t('notifications')} styles={styles} />
        <SectionCard styles={styles}>
          <ToggleRow
            icon="notifications-outline"
            label={t('notif_push')}
            value={notifPrefs.pushEnabled}
            onToggle={v => saveNotifPref('pushEnabled', v)}
            styles={styles}
            primaryColor={primaryColor}
            colors={colors}
          />
          <View style={styles.retryRow}>
            <TouchableOpacity style={[styles.retryBtn, { borderColor: primaryColor }]} onPress={retryNotificationPermissions}>
              <Ionicons name="refresh" size={14} color={primaryColor} />
              <Text style={[styles.retryText, { color: primaryColor }]}>{t('notif_retry_perms')}</Text>
            </TouchableOpacity>
          </View>

          {notifPrefs.pushEnabled && (
            <>
              <Divider styles={styles} />
              <ToggleRow icon="mail-outline" label={t('notif_invitations')} value={notifPrefs.invitations} onToggle={v => saveNotifPref('invitations', v)} styles={styles} primaryColor={primaryColor} colors={colors} />
              <Divider styles={styles} />
              {(user?.role === 'admin' || openMatchCreation) && (
                <>
                  <ToggleRow icon="person-add-outline" label={t('notif_joins')} value={notifPrefs.joins} onToggle={v => saveNotifPref('joins', v)} styles={styles} primaryColor={primaryColor} colors={colors} />
                  <Divider styles={styles} />
                </>
              )}
              <ToggleRow icon="person-remove-outline" label={t('notif_leaves')} value={notifPrefs.leaves} onToggle={v => saveNotifPref('leaves', v)} styles={styles} primaryColor={primaryColor} colors={colors} />
              <Divider styles={styles} />
              <ToggleRow icon="time-outline" label={t('notif_changes')} value={notifPrefs.changes} onToggle={v => saveNotifPref('changes', v)} styles={styles} primaryColor={primaryColor} colors={colors} />
              <Divider styles={styles} />
              <ToggleRow icon="close-circle-outline" label={t('notif_cancellations')} value={notifPrefs.cancellations} onToggle={v => saveNotifPref('cancellations', v)} styles={styles} primaryColor={primaryColor} colors={colors} />
            </>
          )}
        </SectionCard>

        {/* ── HORARIOS TORNEO (ADMIN) ── */}
        {user?.role === 'admin' && (
          <>
            <SectionLabel label={t('manage_tournament_slots')} styles={styles} />
            <SectionCard styles={styles}>
              {/* Partidos por semana */}
              <Text style={styles.subLabel}>Partidos mínimos por equipo por semana</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 16, marginTop: 8 }}>
                <TouchableOpacity 
                  style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' }}
                  onPress={() => saveMatchesPerWeek(matchesPerWeek - 1)}
                >
                  <Text style={{ fontSize: 24, color: colors.text, fontWeight: '900' }}>-</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 28, fontWeight: '900', color: primaryColor, minWidth: 32, textAlign: 'center' }}>
                  {savingMpw ? '...' : matchesPerWeek}
                </Text>
                <TouchableOpacity 
                  style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' }}
                  onPress={() => saveMatchesPerWeek(matchesPerWeek + 1)}
                >
                  <Text style={{ fontSize: 24, color: colors.text, fontWeight: '900' }}>+</Text>
                </TouchableOpacity>
                <Text style={{ color: colors.textDim, fontSize: 12, flex: 1 }}>partido{matchesPerWeek !== 1 ? 's' : ''} / equipo / semana (máx. 5)</Text>
              </View>

              {/* Slot list */}
              {slots.map(slot => (
                <View key={slot.id} style={styles.slotRow}>
                  <Ionicons name="time-outline" size={16} color={primaryColor} />
                  <Text style={styles.slotText}>{slot.display}</Text>
                  <TouchableOpacity onPress={() => deleteSlot(slot.id)}>
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addSlotBtn} onPress={() => setSlotModalVisible(true)}>
                <Ionicons name="add-circle-outline" size={18} color={primaryColor} />
                <Text style={[styles.addSlotText, { color: primaryColor }]}>{t('add_slot')}</Text>
              </TouchableOpacity>
            </SectionCard>
          </>
        )}

        {/* ── CAMBIAR CONTRASEÑA MAESTRA (ADMIN) ── */}
        {user?.role === 'admin' && (
          <>
            <SectionLabel label={t('master_password')} styles={styles} />
            <SectionCard styles={styles}>
              <TouchableOpacity style={styles.actionRow} onPress={() => setMasterPwModal(true)}>
                <Ionicons name="key-outline" size={18} color={colors.textDim} />
                <Text style={styles.actionRowText}>{t('change_master_password')}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
              </TouchableOpacity>
            </SectionCard>
          </>
        )}

        {/* ── MODO ADMIN ── */}
        {user?.role !== 'admin' ? (
          <>
            <SectionLabel label={t('admin_mode')} styles={styles} />
            <SectionCard styles={styles}>
              <View style={styles.adminBox}>
                <TextInput
                  style={[styles.nameInput, { flex: 1 }]}
                  placeholder={t('master_password')}
                  placeholderTextColor={colors.textDim}
                  secureTextEntry value={password} onChangeText={setPassword}
                />
                <TouchableOpacity style={[styles.enterBtn, { backgroundColor: primaryColor }]} onPress={handleActivateAdmin} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.enterBtnText}>{t('enter')}</Text>}
                </TouchableOpacity>
              </View>
            </SectionCard>
          </>
        ) : (
          <>
            <SectionLabel label="Desactivar Admin" styles={styles} />
            <SectionCard styles={styles}>
              <TouchableOpacity style={styles.actionRow} onPress={handleDeactivateAdmin}>
                <Ionicons name="shield-half-outline" size={18} color={colors.danger} />
                <Text style={[styles.actionRowText, { color: colors.danger, fontWeight: '700' }]}>Perder privilegios de Administrador</Text>
              </TouchableOpacity>
            </SectionCard>
          </>
        )}

        {/* ── CERRAR SESIÓN ── */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>{t('logout')}</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Modal: Añadir Franja Torneo */}
      <Modal visible={slotModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t('add_slot')}</Text>
            
            <Text style={styles.subLabel}>Día de la semana</Text>
            <View style={styles.dayPicker}>
              {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(d => (
                <TouchableOpacity 
                  key={d} 
                  style={[styles.dayChip, newSlotDay === d && { backgroundColor: primaryColor }]} 
                  onPress={() => setNewSlotDay(d)}
                >
                  <Text style={[styles.dayChipText, newSlotDay === d && { color: '#fff' }]}>{d.slice(0, 1)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.subLabel}>Hora de inicio (ej. 17:00)</Text>
            <TextInput 
              style={styles.modalInput} 
              placeholder="HH:mm" 
              placeholderTextColor={colors.textDim} 
              value={newSlotTime} 
              onChangeText={setNewSlotTime} 
            />
            <Text style={{ fontSize: 12, color: colors.textDim, paddingHorizontal: 4 }}>* Se sumará 1h 30min automáticamente al guardarse.</Text>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.background }]} onPress={() => setSlotModalVisible(false)}>
                <Text style={[styles.modalBtnText, { color: colors.text }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: primaryColor }]} onPress={addTournamentSlot} disabled={savingSlot}>
                {savingSlot ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalBtnText}>{t('add_slot')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Cambiar Contraseña */}
      <Modal visible={pwModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t('change_password')}</Text>
            <TextInput style={styles.modalInput} placeholder={t('current_password')} placeholderTextColor={colors.textDim} secureTextEntry value={currentPw} onChangeText={setCurrentPw} />
            <TextInput style={styles.modalInput} placeholder={t('new_password')} placeholderTextColor={colors.textDim} secureTextEntry value={newPw} onChangeText={setNewPw} />
            <TextInput style={styles.modalInput} placeholder={t('confirm_password')} placeholderTextColor={colors.textDim} secureTextEntry value={confirmPw} onChangeText={setConfirmPw} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]} onPress={() => setPwModalVisible(false)}>
                <Text style={[styles.modalBtnText, { color: colors.text }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: primaryColor }]} onPress={handleChangePassword} disabled={changingPw}>
                {changingPw ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalBtnText}>{t('update_password')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Cambiar Contraseña Maestra */}
      <Modal visible={masterPwModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t('change_master_password')}</Text>
            <TextInput style={styles.modalInput} placeholder={t('new_master_password')} placeholderTextColor={colors.textDim} secureTextEntry value={newMasterPw} onChangeText={setNewMasterPw} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]} onPress={() => setMasterPwModal(false)}>
                <Text style={[styles.modalBtnText, { color: colors.text }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: primaryColor }]} onPress={handleSaveMasterPassword} disabled={savingMasterPw}>
                {savingMasterPw ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalBtnText}>{t('save_changes')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Helper components defined outside to prevent remounting & keyboard issues
const SectionCard = ({ children, styles }: { children: React.ReactNode, styles: any }) => (
  <View style={styles.sectionCard}>{children}</View>
);

const SectionLabel = ({ label, styles }: { label: string, styles: any }) => (
  <Text style={styles.sectionLabel}>{label}</Text>
);

const Divider = ({ styles }: { styles: any }) => <View style={styles.divider} />;

const ToggleRow = ({ icon, label, desc, value, onToggle, styles, primaryColor, colors }: any) => (
  <View style={styles.toggleRow}>
    <View style={styles.toggleIconWrap}>
      <Ionicons name={icon} size={18} color={primaryColor} />
    </View>
    <View style={styles.toggleTexts}>
      <Text style={styles.toggleLabel}>{label}</Text>
      {desc && <Text style={styles.toggleDesc}>{desc}</Text>}
    </View>
    <Switch
      value={value}
      onValueChange={onToggle}
      trackColor={{ true: primaryColor, false: colors.border }}
      thumbColor="#fff"
    />
  </View>
);

const getStyles = (colors: ThemeColors, primaryColor: string, s: (n: number) => number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 20, paddingBottom: 80 },
  pageTitle: { fontSize: s(34), fontWeight: '900', color: colors.text, marginBottom: 28, letterSpacing: -0.5 },

  sectionLabel: { fontSize: s(11), fontWeight: '900', color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10, marginLeft: 4 },
  sectionCard: { backgroundColor: colors.surface, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 0, marginBottom: 24, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 16 },
  subLabel: { fontSize: s(12), fontWeight: '700', color: colors.textDim, marginBottom: 12, marginTop: 4, paddingHorizontal: 16 },

  // Profile
  profileRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  avatarWrap: { position: 'relative', marginRight: 16 },
  avatar: { width: 68, height: 68, borderRadius: 34 },
  avatarPlaceholder: { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  avatarInitial: { fontSize: s(26), fontWeight: '900', color: colors.text },
  cameraBadge: { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.surface },
  profileInfo: { flex: 1 },
  nameDisplayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profileName: { fontSize: s(18), fontWeight: '900', color: colors.text, flex: 1 },
  pencilBtn: { padding: 6, borderRadius: 8, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  nameInput: { flex: 1, backgroundColor: colors.background, color: colors.text, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, fontSize: s(15), borderWidth: 1, borderColor: colors.border },
  nameActionBtn: { padding: 8, borderRadius: 8, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  profileRole: { fontSize: s(12), fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  profileEmail: { fontSize: s(12), color: colors.textDim, marginTop: 2 },

  actionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  actionRowText: { flex: 1, fontSize: s(15), color: colors.text, fontWeight: '500' },

  // Toggle rows
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  toggleIconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: colors.border },
  toggleTexts: { flex: 1 },
  toggleLabel: { fontSize: s(15), color: colors.text, fontWeight: '600' },
  toggleDesc: { fontSize: s(12), color: colors.textDim, marginTop: 2 },

  // Language
  langRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 4 },
  langBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, borderWidth: 2, borderColor: colors.border, alignItems: 'center' },
  langBtnText: { fontWeight: '700', fontSize: s(12), color: colors.text, textAlign: 'center' },

  // Colors
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10, paddingBottom: 4 },
  colorSwatch: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  colorSwatchSelected: { borderWidth: 3, borderColor: colors.text, transform: [{ scale: 1.15 }] },

  // Font size
  fontRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 4 },
  fontBtn: { flex: 1, height: 54, borderRadius: 12, borderWidth: 2, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },

  // Notifs
  retryRow: { paddingHorizontal: 16, paddingBottom: 8 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start' },
  retryText: { fontSize: s(13), fontWeight: '700' },

  // Admin
  adminBox: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  enterBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  enterBtnText: { color: '#fff', fontWeight: '900', fontSize: s(14) },

  // Logout
  logoutBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.danger, padding: 18, borderRadius: 18, shadowColor: colors.danger, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  logoutText: { color: '#fff', fontSize: s(16), fontWeight: '900' },

  // Slot Styles
  slotRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 },
  slotText: { flex: 1, fontSize: s(14), color: colors.text, fontWeight: '600' },
  addSlotBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 8 },
  addSlotText: { fontSize: s(14), fontWeight: '700' },
  dayPicker: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  dayChip: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  dayChipText: { fontSize: s(14), fontWeight: '900', color: colors.textDim },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 28, gap: 12 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 4 },
  modalTitle: { fontSize: s(22), fontWeight: '900', color: colors.text, marginBottom: 4 },
  modalInput: { backgroundColor: colors.background, color: colors.text, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, fontSize: s(15), borderWidth: 1, borderColor: colors.border },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, padding: 16, borderRadius: 14, alignItems: 'center' },
  modalBtnText: { color: '#fff', fontWeight: '900', fontSize: s(15) },
});
