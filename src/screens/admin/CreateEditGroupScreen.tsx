import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, FlatList } from 'react-native';
import { db } from '../../services/firebaseConfig';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function CreateEditGroupScreen({ navigation }: any) {
  const { user } = useAuth();
  const { primaryColor, colors } = useTheme();
  const styles = getStyles(colors);

  const [name, setName] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (e) {} finally { setLoadingUsers(false); }
  };

  const toggleUserSelection = (id: string) => {
    const newSet = new Set(selectedUserIds);
    newSet.has(id) ? newSet.delete(id) : newSet.add(id);
    setSelectedUserIds(newSet);
  };

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert('Error', 'Ingresa el nombre del grupo');
    try {
      setLoading(true);
      await addDoc(collection(db, 'groups'), { name, userIds: Array.from(selectedUserIds), creatorId: user?.uid, fechaCreacion: new Date().toISOString() });
      Alert.alert('Éxito', 'Grupo creado');
      navigation.goBack();
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setLoading(false); }
  };

  const renderUserItem = ({ item }: any) => {
    const isSelected = selectedUserIds.has(item.id);
    return (
      <TouchableOpacity 
        style={[styles.userCard, isSelected && { borderColor: primaryColor, borderWidth: 2 }]} 
        onPress={() => toggleUserSelection(item.id)}
      >
        <View>
          <Text style={styles.userName}>{item.nombreApellidos}</Text>
          <Text style={styles.userEmail}>{item.email}</Text>
        </View>
        <Ionicons name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={28} color={isSelected ? primaryColor : colors.border} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Crear Grupo</Text>
        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: primaryColor }]} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Guardar</Text>}
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Nombre del Grupo</Text>
      <TextInput 
        style={styles.input} placeholder="Ej: Jugadores Martes" placeholderTextColor={colors.textDim} value={name} onChangeText={setName}
      />

      <Text style={styles.label}>Selecciona Miembros ({selectedUserIds.size})</Text>
      {loadingUsers ? (
        <ActivityIndicator size="large" color={primaryColor} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(i) => i.id}
          renderItem={renderUserItem}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 16, marginBottom: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  headerTitle: { fontSize: 20, fontWeight: '900', color: colors.text, flex: 1, textAlign: 'center' },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  saveText: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  label: { color: colors.textDim, marginBottom: 8, fontSize: 13, marginTop: 16, fontWeight: 'bold', textTransform: 'uppercase' },
  input: { backgroundColor: colors.surface, color: colors.text, padding: 18, borderRadius: 16, marginBottom: 8, fontSize: 16, borderWidth: 1, borderColor: colors.border },
  userCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 2, borderColor: 'transparent', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 1 },
  userName: { color: colors.text, fontSize: 16, fontWeight: 'bold' },
  userEmail: { color: colors.textDim, fontSize: 14, marginTop: 4 }
});
