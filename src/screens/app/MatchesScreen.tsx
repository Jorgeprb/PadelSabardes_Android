import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ScrollView, Dimensions } from 'react-native';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const parseDateStr = (fStr: string, hStr: string) => {
    const [d, mo] = (fStr || '01/01').split('/');
    const [h, mi] = (hStr || '00:00').split(':');
    const dt = new Date();
    dt.setHours(parseInt(h || '0')); dt.setMinutes(parseInt(mi || '0'));
    const matchMonth = parseInt(mo || '1') - 1;
    if (matchMonth < dt.getMonth() - 2) dt.setFullYear(dt.getFullYear() + 1);
    dt.setMonth(matchMonth); dt.setDate(parseInt(d || '1'));
    return dt.getTime();
};

const formatDDMM = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

const daysString = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const daysVerbose = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const monthsString = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const monthsVerbose = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const formatVerboseDate = (fStr: string, hStr: string) => {
    const ts = parseDateStr(fStr, hStr);
    const d = new Date(ts);
    return `${daysVerbose[d.getDay()]}, ${d.getDate()} de ${monthsVerbose[d.getMonth()]} · ${hStr}`;
};

export default function MatchesScreen({ navigation }: any) {
  const [matches, setMatches] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { primaryColor, colors, isCalendarView, openMatchCreation } = useTheme();

  const today = new Date();
  const [selectedDateFilter, setSelectedDateFilter] = useState(formatDDMM(today));
  const weekDays = Array.from({ length: 14 }).map((_, i) => {
     const d = new Date(); d.setDate(d.getDate() + i);
     return { format: formatDDMM(d), dayName: daysString[d.getDay()], dayNum: d.getDate(), monthName: monthsString[d.getMonth()] };
  });

  const styles = getStyles(colors, primaryColor);

  useEffect(() => {
    getDocs(collection(db, 'users')).then(snap => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).then(() => {
      const q = query(collection(db, 'matches'), orderBy('fecha', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const now = Date.now();
        let validData: any[] = [];
        data.forEach(m => {
          if (!m.fecha || !m.hora) return;
          if (now - parseDateStr(m.fecha, m.hora) > 3600000) {
            if (m.isTournament) {
              m.isPast = true;
              validData.push(m);
            } else {
              deleteDoc(doc(db, 'matches', m.id)).catch(() => {});
            }
          } else validData.push(m);
        });

        let filtered = validData;
        if (user?.role !== 'admin') {
          filtered = validData.filter(m =>
            m.listaParticipantes?.includes(user?.uid) || m.listaInvitados?.includes(user?.uid)
          );
        }

        // Sort: matches I'm in → chronological
        filtered.sort((a, b) => {
          const aIn = a.listaParticipantes?.includes(user?.uid) ? 0 : 1;
          const bIn = b.listaParticipantes?.includes(user?.uid) ? 0 : 1;
          if (aIn !== bIn) return aIn - bIn;
          return parseDateStr(a.fecha, a.hora) - parseDateStr(b.fecha, b.hora);
        });

        setMatches(filtered);
        setLoading(false);
      });
      return () => unsubscribe();
    });
  }, [user]);

  const renderCard = (item: any) => {
    const isParticipant = item.listaParticipantes?.includes(user?.uid);
    const isTournament = !!item.isTournament;
    const participants = (item.listaParticipantes || [])
      .map((uid: string) => users.find(u => u.id === uid))
      .filter(Boolean);
    const isFull = participants.length >= 4;
    const freeSpots = 4 - participants.length;

    const teamA = participants.slice(0, 2);
    const teamB = participants.slice(2, 4);

    const AvatarCircle = ({ p }: { p: any }) => {
      const isMe = p?.id === user?.uid;
      const shortName = isMe ? 'Yo' : p?.nombreApellidos?.split(' ')[0] || '?';
      return (
        <View style={styles.avatarWithName}>
          {p?.fotoURL ? (
            <Image source={{ uri: p.fotoURL }} style={[styles.participantAvatar, isMe && { borderWidth: 2.5, borderColor: isTournament ? '#D4A017' : primaryColor }]} />
          ) : (
            <View style={[styles.participantAvatar, styles.participantAvatarPlaceholder, isMe && { borderWidth: 2.5, borderColor: isTournament ? '#D4A017' : primaryColor }]}>
              <Text style={styles.participantInitial}>{p?.nombreApellidos?.charAt(0)?.toUpperCase() || '?'}</Text>
            </View>
          )}
          <Text style={[styles.playerName, isMe && { color: isTournament ? '#D4A017' : primaryColor, fontWeight: '900' }]} numberOfLines={1}>{shortName}</Text>
        </View>
      );
    };

    const EmptySlot = () => (
      <View style={styles.avatarWithName}>
        <View style={[styles.participantAvatar, styles.emptySlot]}>
          <Ionicons name="add" size={18} color={colors.textDim} />
        </View>
        <Text style={styles.playerName}>–</Text>
      </View>
    );

    // Fill teams to 2 slots each
    const renderTeam = (team: any[], slots: number) => (
      <View style={styles.teamGroup}>
        {Array.from({ length: slots }).map((_, i) =>
          team[i] ? <AvatarCircle key={i} p={team[i]} /> : <EmptySlot key={i} />
        )}
      </View>
    );

    const accentColor = isTournament ? '#D4A017' : primaryColor;

    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.card, 
          isParticipant && { borderColor: accentColor, borderWidth: 2 },
          isTournament && { borderColor: '#D4A017', borderWidth: 2, backgroundColor: '#D4A01708' }
        ]}
        onPress={() => navigation.navigate('MatchDetail', { matchId: item.id })}
      >
        {/* Header: Date + Badge */}
        <View style={styles.cardHeader}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {isTournament && <Ionicons name="trophy" size={16} color="#D4A017" />}
              <Text style={[styles.cardTitle, isTournament && { color: '#D4A017' }]}>
                {isTournament ? 'TORNEO · Sabardes' : 'PÁDEL · Sabardes'}
              </Text>
            </View>
            <Text style={styles.cardDate}>{formatVerboseDate(item.fecha, item.hora)}</Text>
          </View>
          {isParticipant && (
            <View style={[styles.badge, { backgroundColor: accentColor + '22', borderColor: accentColor, borderWidth: 1 }]}>
              <Text style={[styles.badgeText, { color: accentColor }]}>Apuntado</Text>
            </View>
          )}
        </View>

        {/* Players: A vs B */}
        <View style={styles.vsRow}>
          {renderTeam(teamA, 2)}
          <View style={styles.vsWrap}>
            <Text style={[styles.vsText, { color: primaryColor }]}>vs</Text>
          </View>
          {renderTeam(teamB, 2)}
        </View>

        {/* Footer */}
        <View style={styles.cardFooter}>
          {item.isPast ? (
            <Text style={[styles.waitingText, { color: colors.textDim }]}>Partido finalizado sin resultado</Text>
          ) : isFull ? (
            <Text style={[styles.confirmedText, { color: accentColor }]}>¡PARTIDO CONFIRMADO!</Text>
          ) : isParticipant ? (
            <Text style={styles.waitingText}>{freeSpots} plaza{freeSpots !== 1 ? 's' : ''} por cubrir</Text>
          ) : (
            <Text style={[styles.freeSpotsText, { color: accentColor }]}>{freeSpots} plaza{freeSpots !== 1 ? 's' : ''} libre{freeSpots !== 1 ? 's' : ''}</Text>
          )}
          <Ionicons name={isTournament ? 'trophy' : 'chevron-forward-circle'} size={26} color={item.isPast ? colors.textDim : accentColor} />
        </View>
      </TouchableOpacity>
    );
  };

  const dailyMatches = matches.filter(m => (m.fecha || '').substring(0, 5) === selectedDateFilter);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tus Partidos</Text>
      </View>

      {isCalendarView && (
        <View style={styles.calTopBar}>
          <View style={styles.calIconWrap}>
            <Ionicons name="tennisball-outline" size={28} color={colors.text} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calDaysScroll}>
            {weekDays.map((wd, i) => {
              const isSelected = selectedDateFilter === wd.format;
              const hasMatch = matches.some(m => (m.fecha || '').substring(0, 5) === wd.format);
              return (
                <TouchableOpacity key={i} style={styles.calDayCol} onPress={() => setSelectedDateFilter(wd.format)}>
                  <Text style={[styles.calDayName, isSelected && { color: primaryColor, fontWeight: '900' }]}>{wd.dayName}</Text>
                  <View style={[styles.calDayCircle, isSelected && { backgroundColor: '#111827' }]}>
                    <Text style={[styles.calDayNum, isSelected && { color: '#fff' }]}>{wd.dayNum}</Text>
                    {hasMatch && (
                      <View style={{ position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: primaryColor, borderWidth: 1, borderColor: colors.background }} />
                    )}
                  </View>
                  <Text style={[styles.calMonthName, isSelected && { color: primaryColor }]}>{wd.monthName}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={primaryColor} style={{ marginTop: 60 }} />
      ) : isCalendarView ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          {dailyMatches.length === 0 ? (
            <Text style={styles.emptyText}>Día despejado. No hay partidos programados para {selectedDateFilter}.</Text>
          ) : (
            dailyMatches.map(item => renderCard(item))
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={matches}
          renderItem={({ item }) => renderCard(item)}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No tienes partidos programados ni invitaciones.</Text>}
        />
      )}

      {(user?.role === 'admin' || openMatchCreation) && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: primaryColor }]}
          onPress={() => navigation.navigate('CreateEditMatch', { initialDateStr: selectedDateFilter })}
        >
          <Ionicons name="add" size={32} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors, primaryColor: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: 24, paddingBottom: 8 },
  headerTitle: { fontSize: 32, fontWeight: '900', color: colors.text, letterSpacing: 0.5 },

  // Card
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  cardTitle: { fontSize: 16, fontWeight: '900', color: colors.text, letterSpacing: 1, textTransform: 'uppercase' },
  cardDate: { fontSize: 13, color: colors.textDim, marginTop: 4, fontWeight: '500' },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  badgeText: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },

  // VS row
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  teamGroup: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  vsWrap: { paddingHorizontal: 16 },
  vsText: { fontSize: 22, fontWeight: '900', letterSpacing: 1 },

  // Participant avatars
  participantAvatar: { width: 52, height: 52, borderRadius: 26 },
  avatarWithName: { alignItems: 'center', gap: 5 },
  playerName: { fontSize: 11, fontWeight: '600', color: colors.textDim, maxWidth: 56, textAlign: 'center' },
  participantAvatarPlaceholder: { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  participantInitial: { fontSize: 18, fontWeight: '900', color: colors.text },
  emptySlot: { backgroundColor: colors.background, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },

  // Footer
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  confirmedText: { fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  freeSpotsText: { fontSize: 14, fontWeight: '900' },
  waitingText: { fontSize: 14, fontWeight: '500', color: colors.textDim },

  // Calendar
  calTopBar: { flexDirection: 'row', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  calIconWrap: { paddingHorizontal: 16, justifyContent: 'center', borderRightWidth: 1, borderRightColor: colors.border, marginRight: 8 },
  calDaysScroll: { paddingHorizontal: 8 },
  calDayCol: { alignItems: 'center', marginRight: 20 },
  calDayName: { fontSize: 11, fontWeight: '700', color: colors.textDim, marginBottom: 6 },
  calDayCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginBottom: 6, elevation: 2, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  calDayNum: { fontSize: 17, fontWeight: '900', color: colors.text },
  calMonthName: { fontSize: 11, color: colors.textDim },

  emptyText: { color: colors.textDim, textAlign: 'center', marginTop: 40, fontSize: 15, paddingHorizontal: 40, lineHeight: 24 },
  fab: { position: 'absolute', bottom: 32, right: 32, width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10 },
});
