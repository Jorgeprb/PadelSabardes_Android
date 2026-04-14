import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Image, Alert, TouchableOpacity, Modal } from 'react-native';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, doc, deleteDoc, updateDoc, query, getDocs, arrayRemove } from 'firebase/firestore';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { deleteUser as firebaseDeleteUser } from 'firebase/auth';

export default function UsersListScreen() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const { primaryColor, colors } = useTheme();
  const styles = getStyles(colors, primaryColor);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(data);
      setLoading(false);
    }, (error) => {
      Alert.alert("Error de Firebase", error.message);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const executeDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const uid = deleteTarget.id;

      // 1. Borrar de todos los partidos en los que participa o está invitado
      const matchesSnap = await getDocs(collection(db, 'matches'));
      const matchUpdates = matchesSnap.docs.map(async (mDoc) => {
        const data = mDoc.data();
        const updates: any = {};
        if (data.listaParticipantes?.includes(uid)) updates.listaParticipantes = arrayRemove(uid);
        if (data.listaInvitados?.includes(uid)) updates.listaInvitados = arrayRemove(uid);
        if (Object.keys(updates).length > 0) await updateDoc(doc(db, 'matches', mDoc.id), updates);
      });
      await Promise.all(matchUpdates);

      // 2. Borrar de torneos/parejas si existe
      const teamsSnap = await getDocs(collection(db, 'tournamentTeams'));
      const teamUpdates = teamsSnap.docs.map(async (tDoc) => {
        const data = tDoc.data();
        if (data.player1Id === uid || data.player2Id === uid) {
          await deleteDoc(doc(db, 'tournamentTeams', tDoc.id));
        }
      });
      await Promise.all(teamUpdates);

      // 3. Borrar el documento de usuario de Firestore
      await deleteDoc(doc(db, 'users', uid));

      setDeleteTarget(null);
      Alert.alert('Eliminado', `${deleteTarget.nombreApellidos} ha sido borrado del sistema completamente.`);
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo eliminar al usuario: ' + e.message);
    } finally {
      setDeleting(false);
    }
  };

  const renderItem = ({ item }: any) => (
    <View style={styles.card}>
      {item.fotoURL ? (
        <Image source={{ uri: item.fotoURL }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitial}>{item.nombreApellidos?.charAt(0)?.toUpperCase() || '?'}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{item.nombreApellidos}</Text>
        <Text style={styles.cardText}>{item.email}</Text>
      </View>
      <View style={[styles.roleBadge, item.role === 'admin' && { borderColor: primaryColor }]}>
         <Text style={[styles.roleText, item.role === 'admin' && { color: primaryColor }]}>{item.role}</Text>
      </View>
      <TouchableOpacity style={styles.deleteBtn} onPress={() => setDeleteTarget(item)}>
        <Ionicons name="trash-outline" size={20} color={colors.danger} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.headerTitle}>Usuarios Registrados</Text>
      {loading ? (
        <ActivityIndicator size="large" color={primaryColor} style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={users}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
        />
      )}

      <Modal visible={!!deleteTarget} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Ionicons name="warning" size={52} color={colors.danger} style={{ marginBottom: 16 }} />
            <Text style={styles.modalTitle}>¿Borrar Usuario?</Text>
            <Text style={styles.modalSubtitle}>
              Se eliminará a <Text style={{ fontWeight: '900', color: colors.text }}>{deleteTarget?.nombreApellidos}</Text> de todos los partidos, equipos de torneo y de la base de datos permanentemente. Esta acción no se puede deshacer.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeleteTarget(null)} disabled={deleting}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={executeDelete} disabled={deleting}>
                {deleting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmText}>Borrar Todo</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors, primaryColor: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerTitle: { fontSize: 24, fontWeight: '900', color: colors.text, padding: 24, paddingBottom: 16 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 56, height: 56, borderRadius: 28, marginRight: 16 },
  avatarPlaceholder: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.background, marginRight: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  avatarInitial: { color: colors.text, fontSize: 20, fontWeight: '900' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  cardText: { color: colors.textDim, fontSize: 14, fontWeight: '500' },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginRight: 12 },
  roleText: { color: colors.textDim, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  deleteBtn: { padding: 8, borderRadius: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.danger },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: colors.surface, padding: 28, borderRadius: 24, width: '85%', alignItems: 'center' },
  modalTitle: { fontSize: 22, fontWeight: '900', color: colors.text, marginBottom: 12 },
  modalSubtitle: { fontSize: 14, color: colors.textDim, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  modalActions: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn: { flex: 1, padding: 16, backgroundColor: colors.background, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.text, fontWeight: '700' },
  confirmBtn: { flex: 1, padding: 16, backgroundColor: colors.danger, borderRadius: 14, alignItems: 'center' },
  confirmText: { color: '#fff', fontWeight: '900' },
});
