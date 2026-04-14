import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot } from 'firebase/firestore';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ThemeColors } from '../../context/ThemeContext';

export default function GroupsScreen({ navigation }: any) {
  const [groups, setGroups] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { primaryColor, colors } = useTheme();

  const styles = getStyles(colors);

  useEffect(() => {
    const unsubGroups = onSnapshot(collection(db, 'groups'), (snap) => {
      setGroups(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => { unsubGroups(); unsubUsers(); };
  }, []);

  const getGroupMembers = (userIds: string[]) => {
    return users.filter(u => userIds?.includes(u.id));
  };

  const renderGroup = ({ item }: any) => {
    const members = getGroupMembers(item.userIds || []);
    const displayMembers = members.slice(0, 4);
    const extraCount = members.length - displayMembers.length;

    return (
      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('GroupDetail', { groupId: item.id })}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <Text style={styles.memberNames} numberOfLines={1}>
            {members.map(m => m.nombreApellidos?.split(' ')[0]).join(', ') || 'Sin miembros'}
          </Text>
          
          <View style={styles.memberStrip}>
            {displayMembers.map((m, i) => (
              m.fotoURL ? (
                <Image key={m.id} source={{ uri: m.fotoURL }} style={[styles.miniAvatar, { marginLeft: i > 0 ? -10 : 0 }]} />
              ) : (
                <View key={m.id} style={[styles.miniAvatar, styles.miniAvatarPlaceholder, { marginLeft: i > 0 ? -10 : 0 }]}>
                  <Text style={styles.miniInitial}>{m.nombreApellidos?.charAt(0)}</Text>
                </View>
              )
            ))}
            {extraCount > 0 && (
              <View style={[styles.miniAvatar, styles.extraCircle]}>
                <Text style={styles.extraText}>+{extraCount}</Text>
              </View>
            )}
            <Text style={[styles.cardInfo, { color: primaryColor, marginLeft: 8 }]}>{members.length} miembros</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Grupos</Text>
      </View>
      
      {loading ? (
        <ActivityIndicator size="large" color={primaryColor} style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={renderGroup}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No hay grupos creados.</Text>}
        />
      )}

      <TouchableOpacity 
        style={[styles.fab, { backgroundColor: primaryColor }]}
        onPress={() => navigation.navigate('CreateEditGroup')}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: 24, paddingBottom: 8, backgroundColor: colors.background },
  headerTitle: { fontSize: 32, fontWeight: '900', color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 18, fontWeight: '900', color: colors.text, marginBottom: 4 },
  memberNames: { fontSize: 13, color: colors.textDim, marginBottom: 12 },
  memberStrip: { flexDirection: 'row', alignItems: 'center' },
  miniAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.surface },
  miniAvatarPlaceholder: { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  miniInitial: { fontSize: 12, fontWeight: '900', color: colors.textDim },
  extraCircle: { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', marginLeft: -10 },
  extraText: { fontSize: 11, fontWeight: '900', color: colors.textDim },
  cardInfo: { fontWeight: '900', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyText: { color: colors.textDim, textAlign: 'center', marginTop: 32, fontSize: 16 },
  fab: { position: 'absolute', bottom: 32, right: 32, width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10 }
});
