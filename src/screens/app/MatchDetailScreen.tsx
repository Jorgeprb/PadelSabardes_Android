import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Image, Modal } from 'react-native';
import { db } from '../../services/firebaseConfig';
import { collection, doc, getDoc, getDocs, updateDoc, arrayUnion, arrayRemove, deleteDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { sendCategorizedPushNotification } from '../../services/PushService';

export default function MatchDetailScreen({ route, navigation }: any) {
  const { matchId } = route.params;
  const [match, setMatch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [kickTarget, setKickTarget] = useState<any>(null);
  const [participantsData, setParticipantsData] = useState<any[]>([]);
  const [adminUserModalVisible, setAdminUserModalVisible] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const { user } = useAuth();
  const { primaryColor, colors } = useTheme();

  const styles = getStyles(colors);

  useEffect(() => {
    setLoading(true);
    const docRef = doc(db, 'matches', matchId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const matchData = { id: docSnap.id, ...docSnap.data() };
        setMatch(matchData);
        fetchParticipants(matchData.listaParticipantes || []);
      } else {
        if (!deleteModalVisible) {
            // navigation.goBack(); 
        }
      }
    });
    return () => unsubscribe();
  }, [matchId]);

  const fetchParticipants = async (userIds: string[]) => {
    if (userIds.length === 0) {
      setParticipantsData([]);
      setLoading(false);
      return;
    }
    try {
      const promises = userIds.map(uid => getDoc(doc(db, 'users', uid)));
      const docs = await Promise.all(promises);
      const data = docs.map(d => ({ uid: d.id, ...d.data() }));
      setParticipantsData(data);
    } catch (e) {}
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!match || !user) return;
    if (match.listaParticipantes?.length >= match.plazas) return Alert.alert('Aviso', 'El partido ya está completo');
    try {
      await updateDoc(doc(db, 'matches', matchId), { listaParticipantes: arrayUnion(user.uid) });
      const others = (match.listaParticipantes || []).filter((id: string) => id !== user.uid);
      await sendCategorizedPushNotification(others, 'PÁDEL Sabardes', `${user.nombreApellidos} se ha unido al partido del ${match.fecha}.`, 'joins');
    } catch(e) {}
  };

  const handleLeave = async () => {
    if (!match || !user) return;
    try {
      await updateDoc(doc(db, 'matches', matchId), { listaParticipantes: arrayRemove(user.uid) });
      const others = (match.listaParticipantes || []).filter((id: string) => id !== user.uid);
      await sendCategorizedPushNotification(others, 'PÁDEL Sabardes', `${user.nombreApellidos} se ha dado de baja del partido del ${match.fecha}.`, 'leaves');
    } catch(e) {}
  };

  const executeKick = async () => {
    if (!match || !kickTarget) return;
    try {
      await updateDoc(doc(db, 'matches', matchId), { listaParticipantes: arrayRemove(kickTarget.uid) });
      await sendCategorizedPushNotification([kickTarget.uid], 'PÁDEL Sabardes', `El administrador te ha expulsado del partido del ${match.fecha}.`, 'leaves');
      setKickTarget(null);
    } catch(e) {}
  };

  const executeDelete = async () => {
      const parts = match?.listaParticipantes || [];
      const others = parts.filter((id: string) => id !== user?.uid);
      await deleteDoc(doc(db, 'matches', matchId));
      await sendCategorizedPushNotification(others, 'Partido Cancelado', `El administrador ha cancelado el partido del ${match.fecha}.`, 'cancellations');
      setDeleteModalVisible(false);
      navigation.goBack();
  };

  if (loading || !match) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={primaryColor} /></View>;

  const isParticipant = match.listaParticipantes?.includes(user?.uid);
  const max = match.plazas || 4;
  const half = Math.ceil(max / 2);

  const renderSlot = (index: number) => {
    const p = participantsData[index];
    if (p) {
        const isMe = p.uid === user?.uid;
        return (
          <View style={styles.slotPlayer} key={'slot'+index}>
            <View style={styles.avatarWrap}>
                {p.fotoURL ? (
                    <Image source={{uri: p.fotoURL}} style={styles.slotAvatar} />
                ) : (
                    <View style={styles.slotAvatarPlaceholder}>
                        <Text style={styles.slotInitials}>{p.nombreApellidos?.charAt(0)?.toUpperCase()}</Text>
                    </View>
                )}
                {(isMe || user?.role === 'admin') && (
                    <TouchableOpacity style={styles.leaveBadge} onPress={() => {
                        if (isMe) handleLeave();
                        else setKickTarget(p);
                    }}>
                        <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                )}
            </View>
            <Text style={styles.slotName} numberOfLines={1}>{p.nombreApellidos?.split(' ')[0]}</Text>
          </View>
        );
    } else {
        return (
          <View style={styles.slotPlayer} key={'slot'+index}>
            <TouchableOpacity 
                style={[styles.slotEmpty, { borderColor: primaryColor }]} 
                onPress={() => { 
                  if (user?.role === 'admin') {
                     if (allUsers.length === 0) {
                        getDocs(collection(db, 'users')).then(snap => {
                           setAllUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
                        });
                     }
                     setAdminUserModalVisible(true);
                  } else if(!isParticipant) {
                     handleJoin();
                  } 
                }} 
                disabled={isParticipant && user?.role !== 'admin'}
            >
                <Ionicons name="add" size={28} color={primaryColor} />
            </TouchableOpacity>
            {(!isParticipant || user?.role === 'admin') && <Text style={[styles.slotEmptyText, { color: primaryColor }]}>Pulsar</Text>}
          </View>
        );
    }
  };

  const slotsArray = Array.from({ length: max }, (_, i) => i);

  return (
    <View style={styles.mainWrapper}>
        <View style={[styles.courtHeader, { backgroundColor: primaryColor }]}>
            <View style={styles.courtLine1} />
            <View style={styles.courtLine2} />
            <SafeAreaView style={styles.topNav}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                {user?.role === 'admin' && (
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                        <TouchableOpacity style={[styles.trashBtn, { backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 }]} onPress={() => navigation.navigate('CreateEditMatch', { matchId })}>
                            <Ionicons name="pencil" size={20} color={primaryColor} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.trashBtn} onPress={() => setDeleteModalVisible(true)}>
                            <Ionicons name="trash" size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>
                )}
            </SafeAreaView>
        </View>

        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            <View style={styles.mainCard}>
                <View style={styles.cardHeader}>
                    <Ionicons name="tennisball-outline" size={28} color={colors.textDim} style={styles.cardIcon}/>
                    <View>
                        <Text style={styles.cardTitle}>PÁDEL</Text>
                        <Text style={styles.cardSubtitle}>{match.fecha} • {match.hora}</Text>
                    </View>
                </View>
                <View style={styles.infoGrid}>
                    <View style={styles.infoCol}>
                        <Text style={styles.infoLabel}>Ubicación</Text>
                        <Text style={styles.infoVal} numberOfLines={2}>{match.ubicacion}</Text>
                    </View>
                    <View style={styles.infoCol}>
                        <Text style={styles.infoLabel}>Plazas</Text>
                        <Text style={styles.infoVal}>{match.listaParticipantes?.length || 0}/{match.plazas}</Text>
                    </View>
                </View>
            </View>

            <View style={styles.playersSection}>
                <View style={styles.playersHeader}>
                    <Text style={styles.sectionTitle}>Jugadores</Text>
                </View>
                <View style={styles.teamContainer}>
                    {slotsArray.slice(0, half).map(renderSlot)}
                    <View style={styles.teamLetterAbsolute}><Text style={styles.teamLetterText}>A</Text></View>
                </View>
                <View style={styles.vsSeparator}>
                    <View style={styles.vsLine} />
                    <Text style={styles.vsText}>VS</Text>
                    <View style={styles.vsLine} />
                </View>
                <View style={styles.teamContainer}>
                    {slotsArray.slice(half, max).map(renderSlot)}
                    <View style={styles.teamLetterAbsolute}><Text style={styles.teamLetterText}>B</Text></View>
                </View>
            </View>
        </ScrollView>

        <Modal visible={deleteModalVisible} transparent animationType="fade">
            <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center'}}>
                <View style={{backgroundColor: colors.surface, padding: 24, borderRadius: 20, width: '80%', alignItems: 'center'}}>
                    <Ionicons name="warning" size={48} color={colors.danger} style={{marginBottom: 16}} />
                    <Text style={{fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 8}}>¿Borrar Partido?</Text>
                    <Text style={{fontSize: 14, color: colors.textDim, textAlign: 'center', marginBottom: 24}}>Esta acción no se puede deshacer y las plazas volarán.</Text>
                    <View style={{flexDirection: 'row', gap: 12}}>
                        <TouchableOpacity style={{padding: 16, backgroundColor: colors.background, borderRadius: 12, flex: 1, alignItems: 'center'}} onPress={() => setDeleteModalVisible(false)}>
                            <Text style={{color: colors.text, fontWeight: 'bold'}}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{padding: 16, backgroundColor: colors.danger, borderRadius: 12, flex: 1, alignItems: 'center'}} onPress={executeDelete}>
                            <Text style={{color: '#fff', fontWeight: 'bold'}}>Borrar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>

        <Modal visible={!!kickTarget} transparent animationType="fade">
            <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center'}}>
                <View style={{backgroundColor: colors.surface, padding: 24, borderRadius: 20, width: '80%', alignItems: 'center'}}>
                    <Ionicons name="person-remove" size={48} color={primaryColor} style={{marginBottom: 16}} />
                    <Text style={{fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 8, textAlign: 'center'}}>
                        ¿Expulsar a {kickTarget?.nombreApellidos}?
                    </Text>
                    <Text style={{fontSize: 14, color: colors.textDim, textAlign: 'center', marginBottom: 24}}>
                        Tendrá que volver a unirse manualmente si así lo deseas o si la plaza queda abierta.
                    </Text>
                    <View style={{flexDirection: 'row', gap: 12}}>
                        <TouchableOpacity style={{padding: 16, backgroundColor: colors.background, borderRadius: 12, flex: 1, alignItems: 'center'}} onPress={() => setKickTarget(null)}>
                            <Text style={{color: colors.text, fontWeight: 'bold'}}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{padding: 16, backgroundColor: primaryColor, borderRadius: 12, flex: 1, alignItems: 'center'}} onPress={executeKick}>
                            <Text style={{color: '#fff', fontWeight: 'bold'}}>Expulsar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>

        <Modal visible={adminUserModalVisible} transparent animationType="slide">
            <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'}}>
                <View style={{backgroundColor: colors.surface, padding: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '70%', elevation: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: {width:0,height:-5}}}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <Text style={{fontSize: 20, fontWeight: 'bold', color: colors.text}}>Añadir Jugador</Text>
                        <TouchableOpacity onPress={() => setAdminUserModalVisible(false)}>
                            <Ionicons name="close" size={28} color={colors.textDim} />
                        </TouchableOpacity>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {allUsers.filter(u => !(match.listaParticipantes || []).includes(u.uid)).map(u => (
                            <TouchableOpacity key={u.uid} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }} onPress={async () => {
                                try {
                                    setAdminUserModalVisible(false);
                                    await updateDoc(doc(db, 'matches', matchId), { listaParticipantes: arrayUnion(u.uid) });
                                    const others = (match.listaParticipantes || []).filter((id: string) => id !== u.uid);
                                    await sendCategorizedPushNotification(others, 'PÁDEL Sabardes', `El admin ha añadido a ${u.nombreApellidos} al partido del ${match.fecha}.`, 'joins');
                                } catch(e) {}
                            }}>
                                {u.fotoURL ? (
                                    <Image source={{uri: u.fotoURL}} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }} />
                                ) : (
                                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                                        <Text style={{ fontWeight: 'bold', color: colors.textDim }}>{u.nombreApellidos?.charAt(0)}</Text>
                                    </View>
                                )}
                                <Text style={{ fontSize: 16, color: colors.text, fontWeight: '500' }}>{u.nombreApellidos}</Text>
                            </TouchableOpacity>
                        ))}
                        {allUsers.length === 0 && <ActivityIndicator color={primaryColor} style={{ marginTop: 40 }} />}
                    </ScrollView>
                </View>
            </View>
        </Modal>

    </View>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  mainWrapper: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
  
  courtHeader: { height: 260, position: 'relative', overflow: 'hidden' },
  courtLine1: { position: 'absolute', width: '150%', height: 4, backgroundColor: 'rgba(255,255,255,0.3)', transform: [{ rotate: '-25deg' }], top: 120, left: -50, zIndex: 1 },
  courtLine2: { position: 'absolute', width: 4, height: '150%', backgroundColor: 'rgba(255,255,255,0.3)', transform: [{ rotate: '45deg' }], top: -50, left: '60%', zIndex: 1 },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, zIndex: 10, elevation: 10 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  trashBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(239,68,68,0.9)', justifyContent: 'center', alignItems: 'center' },
  
  scrollArea: { flex: 1, marginTop: -90 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },
  
  mainCard: { backgroundColor: colors.surface, borderRadius: 24, padding: 24, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.1, shadowRadius: 20, marginBottom: 24, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  cardIcon: { marginRight: 16 },
  cardTitle: { fontSize: 22, fontWeight: '900', color: colors.text, letterSpacing: 1 },
  cardSubtitle: { fontSize: 15, color: colors.textDim, marginTop: 4, fontWeight: '500' },
  infoGrid: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 20 },
  infoCol: { flex: 1 },
  infoLabel: { fontSize: 13, color: colors.textDim, marginBottom: 6, textTransform: 'uppercase', fontWeight: 'bold' },
  infoVal: { fontSize: 18, fontWeight: 'bold', color: colors.text },

  playersSection: { backgroundColor: colors.surface, borderRadius: 24, padding: 24, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 10, borderWidth: 1, borderColor: colors.border },
  playersHeader: { marginBottom: 24 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  
  teamContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', position: 'relative', paddingVertical: 16 },
  teamLetterAbsolute: { position: 'absolute', bottom: -12, left: 0, opacity: 0.05 },
  teamLetterText: { fontSize: 100, fontWeight: '900', color: colors.text },
  
  vsSeparator: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  vsLine: { flex: 1, height: 1, backgroundColor: colors.border },
  vsText: { marginHorizontal: 16, color: colors.textDim, fontWeight: '900', fontSize: 14, letterSpacing: 1 },

  slotPlayer: { alignItems: 'center', marginHorizontal: 12, marginBottom: 12, width: 70 },
  avatarWrap: { position: 'relative' },
  slotAvatar: { width: 68, height: 68, borderRadius: 34,borderWidth: 3, borderColor: colors.surface },
  slotAvatarPlaceholder: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: colors.surface },
  slotInitials: { fontSize: 26, fontWeight: '900', color: colors.textDim },
  leaveBadge: { position: 'absolute', top: -2, right: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.danger, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: colors.surface, elevation: 4 },
  slotName: { marginTop: 10, fontSize: 14, fontWeight: '700', color: colors.text },
  
  slotEmpty: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  slotEmptyText: { marginTop: 10, fontSize: 13, fontWeight: '700' }
});
