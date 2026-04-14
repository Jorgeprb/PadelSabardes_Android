import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, ScrollView, TextInput, FlatList, Modal, Image
} from 'react-native';
import { db } from '../../services/firebaseConfig';
import { doc, getDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';

export default function GroupDetailScreen({ route, navigation }: any) {
  const { groupId } = route.params;
  const { primaryColor, colors, fontScale } = useTheme();
  const { t } = useTranslation();

  const [group, setGroup] = useState<any>(null);
  const [groupName, setGroupName] = useState('');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addMemberModal, setAddMemberModal] = useState(false);

  const s = (n: number) => n * fontScale;
  const styles = getStyles(colors, primaryColor, s);

  useEffect(() => {
    const load = async () => {
      const [gSnap, uSnap] = await Promise.all([
        getDoc(doc(db, 'groups', groupId)),
        getDocs(collection(db, 'users'))
      ]);
      if (gSnap.exists()) {
        const data = gSnap.data();
        setGroup({ id: gSnap.id, ...data });
        setGroupName(data.name || '');
        setMemberIds(data.userIds || []);
      }
      setAllUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    };
    load();
  }, [groupId]);

  const handleSave = async () => {
    if (!groupName.trim()) return Alert.alert(t('error'), 'El nombre no puede estar vacío.');
    setSaving(true);
    try {
      await updateDoc(doc(db, 'groups', groupId), { name: groupName.trim(), userIds: memberIds });
      Alert.alert(t('success'), t('save_group'));
      navigation.goBack();
    } catch (e: any) { Alert.alert(t('error'), e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'groups', groupId));
      setDeleteModal(false);
      navigation.goBack();
    } catch (e: any) { Alert.alert(t('error'), e.message); }
    finally { setDeleting(false); }
  };

  const removeMember = (uid: string) => {
    setMemberIds(prev => prev.filter(id => id !== uid));
  };

  const addMember = (uid: string) => {
    if (!memberIds.includes(uid)) setMemberIds(prev => [...prev, uid]);
    setAddMemberModal(false);
  };

  const availableToAdd = allUsers.filter(u => !memberIds.includes(u.id));
  const memberUsers = memberIds.map(id => allUsers.find(u => u.id === id)).filter(Boolean);

  if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}><ActivityIndicator size="large" color={primaryColor} /></View>;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{group?.name}</Text>
        <TouchableOpacity onPress={() => setDeleteModal(true)} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={22} color={colors.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={styles.section}>
          <Text style={styles.label}>{t('group_name')}</Text>
          <TextInput
            style={styles.input}
            value={groupName}
            onChangeText={setGroupName}
            placeholder={t('group_name')}
            placeholderTextColor={colors.textDim}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.memberHeader}>
            <Text style={styles.label}>{t('group_participants')} ({memberIds.length})</Text>
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: primaryColor }]} onPress={() => setAddMemberModal(true)}>
              <Ionicons name="person-add-outline" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
          {memberUsers.map((u: any) => (
            <View key={u.id} style={styles.memberRow}>
              {u.fotoURL ? (
                <Image source={{ uri: u.fotoURL }} style={styles.memberAvatar} />
              ) : (
                <View style={[styles.memberAvatar, styles.memberAvatarPlaceholder]}>
                  <Text style={{ color: colors.text, fontWeight: '900' }}>{u.nombreApellidos?.charAt(0)}</Text>
                </View>
              )}
              <Text style={styles.memberName}>{u.nombreApellidos}</Text>
              <TouchableOpacity onPress={() => removeMember(u.id)} style={styles.removeBtn}>
                <Ionicons name="close-circle" size={22} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))}
          {memberUsers.length === 0 && (
            <Text style={{ color: colors.textDim, fontStyle: 'italic' }}>Sin participantes</Text>
          )}
        </View>

        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: primaryColor }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>{t('save_group')}</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* Delete Modal */}
      <Modal visible={deleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Ionicons name="warning" size={48} color={colors.danger} style={{ marginBottom: 12 }} />
            <Text style={styles.modalTitle}>{t('delete_group_confirm')}</Text>
            <Text style={styles.modalMsg}>{t('delete_group_msg')}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]} onPress={() => setDeleteModal(false)}>
                <Text style={[styles.saveBtnText, { color: colors.text }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1, backgroundColor: colors.danger }]} onPress={handleDelete} disabled={deleting}>
                {deleting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>{t('delete')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={addMemberModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '85%', minHeight: '60%', alignItems: 'stretch' }]}>
            <Text style={[styles.modalTitle, { marginBottom: 16 }]}>Añadir Participante</Text>
            <FlatList
              data={availableToAdd}
              keyExtractor={u => u.id}
              style={{ flex: 1, width: '100%', marginBottom: 16 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.memberRow} onPress={() => addMember(item.id)}>
                  {item.fotoURL ? (
                    <Image source={{ uri: item.fotoURL }} style={styles.memberAvatar} />
                  ) : (
                    <View style={[styles.memberAvatar, styles.memberAvatarPlaceholder]}>
                      <Text style={{ color: colors.text, fontWeight: '900' }}>{item.nombreApellidos?.charAt(0)}</Text>
                    </View>
                  )}
                  <Text style={styles.memberName}>{item.nombreApellidos}</Text>
                  <Ionicons name="add-circle-outline" size={26} color={primaryColor} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={{ color: colors.textDim, textAlign: 'center', margin: 16 }}>Todos los usuarios ya están en el grupo.</Text>}
            />
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]} onPress={() => setAddMemberModal(false)}>
              <Text style={[styles.saveBtnText, { color: colors.text }]}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors, primaryColor: string, s: (n: number) => number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: 8, borderRadius: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, marginRight: 12 },
  headerTitle: { flex: 1, fontSize: s(20), fontWeight: '900', color: colors.text },
  deleteBtn: { padding: 8, borderRadius: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.danger },

  section: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  label: { fontSize: s(12), fontWeight: '900', color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  input: { backgroundColor: colors.background, color: colors.text, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12, fontSize: s(16), borderWidth: 1, borderColor: colors.border },

  memberHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  addBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  memberAvatarPlaceholder: { backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  memberName: { flex: 1, fontSize: s(15), fontWeight: '700', color: colors.text },
  removeBtn: { padding: 4 },

  saveBtn: { padding: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '900', fontSize: s(15) },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 10, alignItems: 'center' },
  modalTitle: { fontSize: s(20), fontWeight: '900', color: colors.text, textAlign: 'center' },
  modalMsg: { fontSize: s(14), color: colors.textDim, textAlign: 'center', marginBottom: 8 },
});
