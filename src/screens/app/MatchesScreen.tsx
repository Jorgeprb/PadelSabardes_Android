import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ScrollView } from 'react-native';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import WeatherIcon from '../../components/WeatherIcon';
import { useTranslation } from '../../context/LanguageContext';
import { useCourtWeather } from '../../hooks/useCourtWeather';
import { formatIsoDate, getHourlyFocusIndex, getHourlySliceAround, getWeatherForIsoDate, resolveMatchDateToIso } from '../../services/weather';

const shortDayNames = {
  es: ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'],
  gl: ['DOM', 'LUN', 'MAR', 'MER', 'XOV', 'VEN', 'SAB'],
} as const;

const longDayNames = {
  es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  gl: ['Domingo', 'Luns', 'Martes', 'Mércores', 'Xoves', 'Venres', 'Sábado'],
} as const;

const shortMonthNames = {
  es: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
  gl: ['Xan', 'Feb', 'Mar', 'Abr', 'Mai', 'Xuñ', 'Xul', 'Ago', 'Set', 'Out', 'Nov', 'Dec'],
} as const;

const longMonthNames = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  gl: ['xaneiro', 'febreiro', 'marzo', 'abril', 'maio', 'xuño', 'xullo', 'agosto', 'setembro', 'outubro', 'novembro', 'decembro'],
} as const;

const parseDateStr = (fStr: string, hStr: string) => {
  const [d, mo] = (fStr || '01/01').split('/');
  const [h, mi] = (hStr || '00:00').split(':');
  const dt = new Date();
  dt.setHours(parseInt(h || '0', 10));
  dt.setMinutes(parseInt(mi || '0', 10));
  const matchMonth = parseInt(mo || '1', 10) - 1;
  if (matchMonth < dt.getMonth() - 2) dt.setFullYear(dt.getFullYear() + 1);
  dt.setMonth(matchMonth);
  dt.setDate(parseInt(d || '1', 10));
  return dt.getTime();
};

const formatDDMM = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

export default function MatchesScreen({ navigation }: any) {
  const [matches, setMatches] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedWeather, setExpandedWeather] = useState<Record<string, boolean>>({});
  const { user } = useAuth();
  const { primaryColor, colors, isCalendarView, openMatchCreation } = useTheme();
  const { t, language } = useTranslation();
  const { forecast, loading: weatherLoading, error: weatherError } = useCourtWeather();

  const today = new Date();
  const [selectedDateFilter, setSelectedDateFilter] = useState(formatDDMM(today));
  const weekDays = useMemo(() => Array.from({ length: 14 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      format: formatDDMM(d),
      iso: formatIsoDate(d),
      dayName: shortDayNames[language][d.getDay()],
      dayNum: d.getDate(),
      monthName: shortMonthNames[language][d.getMonth()],
    };
  }), [language]);

  const styles = getStyles(colors, primaryColor);

  const formatVerboseDate = (fStr: string, hStr: string) => {
    const ts = parseDateStr(fStr, hStr);
    const d = new Date(ts);
    return `${longDayNames[language][d.getDay()]}, ${d.getDate()} de ${longMonthNames[language][d.getMonth()]} · ${hStr}`;
  };

  useEffect(() => {
    let unsubscribe = () => {};
    let isMounted = true;

    const initData = async () => {
      const usersSnap = await getDocs(collection(db, 'users'));
      if (!isMounted) return;
      setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const q = query(collection(db, 'matches'), orderBy('fecha', 'desc'));
      unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        const now = Date.now();
        const validData: any[] = [];
        data.forEach(m => {
          if (!m.fecha || !m.hora) return;
          if (now - parseDateStr(m.fecha, m.hora) > 3600000) {
            if (m.isTournament) {
              m.isPast = true;
              validData.push(m);
            } else {
              deleteDoc(doc(db, 'matches', m.id)).catch(() => {});
            }
          } else {
            validData.push(m);
          }
        });

        let filtered = validData;
        if (user?.role !== 'admin') {
          filtered = validData.filter(m =>
            m.listaParticipantes?.includes(user?.uid) || m.listaInvitados?.includes(user?.uid) || m.creadorId === user?.uid,
          );
        }

        filtered.sort((a, b) => {
          const aIn = a.listaParticipantes?.includes(user?.uid) ? 0 : 1;
          const bIn = b.listaParticipantes?.includes(user?.uid) ? 0 : 1;
          if (aIn !== bIn) return aIn - bIn;
          return parseDateStr(a.fecha, a.hora) - parseDateStr(b.fecha, b.hora);
        });

        setMatches(filtered);
        setLoading(false);
      });
    };

    initData().catch((error) => {
      console.log('Error loading matches:', error);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [user]);

  const toggleWeather = (matchId: string) => {
    setExpandedWeather((previous) => ({ ...previous, [matchId]: !previous[matchId] }));
  };

  const renderCard = (item: any) => {
    const isParticipant = item.listaParticipantes?.includes(user?.uid);
    const isTournament = !!item.isTournament;
    const accentColor = isTournament ? '#D4A017' : primaryColor;
    const participants = (item.listaParticipantes || [])
      .map((uid: string) => users.find(u => u.id === uid))
      .filter(Boolean);
    const isFull = participants.length >= 4;
    const freeSpots = 4 - participants.length;
    const teamA = participants.slice(0, 2);
    const teamB = participants.slice(2, 4);
    const weatherForMatch = getWeatherForIsoDate(forecast, resolveMatchDateToIso(item.fecha));
    const focusIndex = getHourlyFocusIndex(weatherForMatch.hourly, item.hora);
    const highlightedWeather = weatherForMatch.hourly[focusIndex] || weatherForMatch.daily;
    const highlightedTemperature = highlightedWeather
      ? ('temperature' in highlightedWeather ? highlightedWeather.temperature : highlightedWeather.tempMax)
      : null;
    const hourlySlice = getHourlySliceAround(weatherForMatch.hourly, item.hora, 3);
    const isExpanded = !!expandedWeather[item.id];

    const AvatarCircle = ({ p }: { p: any }) => {
      const isMe = p?.id === user?.uid;
      const shortName = isMe ? 'Yo' : p?.nombreApellidos?.split(' ')[0] || '?';
      return (
        <View style={styles.avatarWithName}>
          {p?.fotoURL ? (
            <Image source={{ uri: p.fotoURL }} style={[styles.participantAvatar, isMe && { borderWidth: 2.5, borderColor: accentColor }]} />
          ) : (
            <View style={[styles.participantAvatar, styles.participantAvatarPlaceholder, isMe && { borderWidth: 2.5, borderColor: accentColor }]}>
              <Text style={styles.participantInitial}>{p?.nombreApellidos?.charAt(0)?.toUpperCase() || '?'}</Text>
            </View>
          )}
          <Text style={[styles.playerName, isMe && { color: accentColor, fontWeight: '900' }]} numberOfLines={1}>{shortName}</Text>
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

    const renderTeam = (team: any[], slots: number) => (
      <View style={styles.teamGroup}>
        {Array.from({ length: slots }).map((_, i) =>
          team[i] ? <AvatarCircle key={i} p={team[i]} /> : <EmptySlot key={i} />,
        )}
      </View>
    );

    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.card,
          isParticipant && { borderColor: accentColor, borderWidth: 2 },
          isTournament && { borderColor: '#D4A017', borderWidth: 2, backgroundColor: '#D4A01708' },
        ]}
        onPress={() => navigation.navigate('MatchDetail', { matchId: item.id })}
        activeOpacity={0.92}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {isTournament && <Ionicons name="trophy" size={16} color="#D4A017" />}
              <Text style={[styles.cardTitle, isTournament && { color: '#D4A017' }]}>
                {isTournament ? 'TORNEO · Sabardes' : 'PÁDEL · Sabardes'}
              </Text>
            </View>
            <Text style={styles.cardDate}>{formatVerboseDate(item.fecha, item.hora)}</Text>
          </View>

          <View style={styles.cardMeta}>
            {isParticipant && (
              <View style={[styles.badge, { backgroundColor: `${accentColor}22`, borderColor: accentColor, borderWidth: 1 }]}>
                <Text style={[styles.badgeText, { color: accentColor }]}>{t('joined')}</Text>
              </View>
            )}
            {highlightedWeather && (
              <View style={[styles.weatherSummary, { borderColor: `${accentColor}33` }]}>
                <WeatherIcon kind={highlightedWeather.visualKind} isDay={'isDay' in highlightedWeather ? highlightedWeather.isDay : true} size={20} color={accentColor} />
                <View style={styles.weatherSummaryCopy}>
                  <Text style={styles.weatherSummaryTemp}>{highlightedTemperature ?? '--'}°C</Text>
                  <Text style={styles.weatherSummaryDesc}>{t(highlightedWeather.labelKey)}</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        <View style={styles.vsRow}>
          {renderTeam(teamA, 2)}
          <View style={styles.vsWrap}>
            <Text style={[styles.vsText, { color: primaryColor }]}>vs</Text>
          </View>
          {renderTeam(teamB, 2)}
        </View>

        <View style={styles.weatherShell}>
          <TouchableOpacity style={styles.weatherToggle} onPress={() => toggleWeather(item.id)} activeOpacity={0.85}>
            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={accentColor} />
            <Text style={styles.weatherToggleText}>{t('weather_hourly')}</Text>
            <Text style={styles.weatherToggleMeta}>{t('weather_match_hour')} · {item.hora}</Text>
          </TouchableOpacity>

          {isExpanded && (
            <View style={styles.weatherPanel}>
              {weatherLoading ? (
                <Text style={styles.weatherEmpty}>{t('weather_loading')}</Text>
              ) : weatherError ? (
                <Text style={styles.weatherEmpty}>{t('weather_error')}</Text>
              ) : hourlySlice.entries.length === 0 ? (
                <Text style={styles.weatherEmpty}>{t('weather_unavailable')}</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourlyScrollContent}>
                  {hourlySlice.entries.map((entry, index) => {
                    const isFocused = index === hourlySlice.selectedIndex;
                    return (
                      <View key={entry.isoTime} style={[styles.hourlyItem, isFocused && { borderColor: `${accentColor}88`, backgroundColor: `${accentColor}12` }]}>
                        <Text style={styles.hourlyTime}>{entry.hour}</Text>
                        <WeatherIcon kind={entry.visualKind} isDay={entry.isDay} size={22} color={isFocused ? accentColor : '#cbd5e1'} />
                        <Text style={styles.hourlyTemp}>{entry.temperature ?? '--'}°C</Text>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          )}
        </View>

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
        <Text style={styles.headerTitle}>{t('your_matches')}</Text>
      </View>

      {isCalendarView && (
        <View style={styles.calTopBar}>
          <View style={styles.calIconWrap}>
            <Ionicons name="tennisball-outline" size={28} color={colors.text} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calDaysScroll}>
            {weekDays.map((wd) => {
              const isSelected = selectedDateFilter === wd.format;
              const hasMatch = matches.some(m => (m.fecha || '').substring(0, 5) === wd.format);
              const dayWeather = getWeatherForIsoDate(forecast, wd.iso).daily;
              return (
                <TouchableOpacity key={wd.format} style={styles.calDayCol} onPress={() => setSelectedDateFilter(wd.format)} activeOpacity={0.88}>
                  <Text style={[styles.calDayName, isSelected && { color: primaryColor }]}>{wd.dayName}</Text>
                  <View style={[styles.calDayCard, isSelected && { borderColor: `${primaryColor}aa`, backgroundColor: '#111827' }]}>
                    {hasMatch && (
                      <View style={{ position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: primaryColor, borderWidth: 1, borderColor: colors.background }} />
                    )}
                    <View style={styles.calWeatherWrap}>
                      {dayWeather ? (
                        <WeatherIcon kind={dayWeather.visualKind} size={18} color={isSelected ? primaryColor : '#cbd5e1'} />
                      ) : (
                        <Text style={styles.calWeatherFallback}>{weatherLoading ? '…' : '—'}</Text>
                      )}
                    </View>
                    <Text style={styles.calDayNum}>{wd.dayNum}</Text>
                    <Text style={[styles.calMonthName, isSelected && { color: primaryColor }]}>{wd.monthName}</Text>
                    <Text style={styles.calTemps}>{dayWeather ? `${dayWeather.tempMax ?? '--'}°/${dayWeather.tempMin ?? '--'}°` : weatherLoading ? '...' : '--'}</Text>
                  </View>
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
            <Text style={styles.emptyText}>{t('no_matches')}</Text>
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
          ListEmptyComponent={<Text style={styles.emptyText}>{t('no_matches')}</Text>}
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

  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 },
  cardTitle: { fontSize: 16, fontWeight: '900', color: colors.text, letterSpacing: 1, textTransform: 'uppercase' },
  cardDate: { fontSize: 13, color: colors.textDim, marginTop: 4, fontWeight: '500' },
  cardMeta: { alignItems: 'flex-end', gap: 10, flexShrink: 0 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  badgeText: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },

  weatherSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 124,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  weatherSummaryCopy: { alignItems: 'flex-end' },
  weatherSummaryTemp: { color: colors.text, fontSize: 18, fontWeight: '900' },
  weatherSummaryDesc: { color: colors.textDim, fontSize: 12 },

  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  teamGroup: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  vsWrap: { paddingHorizontal: 16 },
  vsText: { fontSize: 22, fontWeight: '900', letterSpacing: 1 },

  participantAvatar: { width: 52, height: 52, borderRadius: 26 },
  avatarWithName: { alignItems: 'center', gap: 5 },
  playerName: { fontSize: 11, fontWeight: '600', color: colors.textDim, maxWidth: 56, textAlign: 'center' },
  participantAvatarPlaceholder: { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  participantInitial: { fontSize: 18, fontWeight: '900', color: colors.text },
  emptySlot: { backgroundColor: colors.background, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },

  weatherShell: { paddingBottom: 16 },
  weatherToggle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weatherToggleText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  weatherToggleMeta: { marginLeft: 'auto', color: colors.textDim, fontSize: 12, fontWeight: '700' },
  weatherPanel: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.8)',
    backgroundColor: 'rgba(15,23,42,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  weatherEmpty: { color: colors.textDim, fontSize: 13 },
  hourlyScrollContent: { gap: 10 },
  hourlyItem: {
    minWidth: 78,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.85)',
    backgroundColor: 'rgba(15,23,42,0.82)',
    alignItems: 'center',
    gap: 8,
  },
  hourlyTime: { color: colors.text, fontSize: 13, fontWeight: '800' },
  hourlyTemp: { color: '#cbd5e1', fontSize: 13, fontWeight: '800' },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  confirmedText: { fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  freeSpotsText: { fontSize: 14, fontWeight: '900' },
  waitingText: { fontSize: 14, fontWeight: '500', color: colors.textDim },

  calTopBar: { flexDirection: 'row', paddingVertical: 14, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: colors.border },
  calIconWrap: { paddingHorizontal: 16, justifyContent: 'center', borderRightWidth: 1, borderRightColor: colors.border, marginRight: 8 },
  calDaysScroll: { paddingHorizontal: 8, gap: 12 },
  calDayCol: { alignItems: 'center' },
  calDayName: { fontSize: 11, fontWeight: '800', color: colors.textDim, marginBottom: 8, letterSpacing: 0.7 },
  calDayCard: {
    position: 'relative',
    width: 88,
    minHeight: 126,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  calWeatherWrap: { minHeight: 22, justifyContent: 'center', alignItems: 'center' },
  calWeatherFallback: { color: colors.textDim, fontSize: 16 },
  calDayNum: { fontSize: 28, fontWeight: '900', color: colors.text, marginTop: 4 },
  calMonthName: { fontSize: 12, color: colors.textDim },
  calTemps: { fontSize: 12, color: '#cbd5e1', fontWeight: '700', marginTop: 6 },

  emptyText: { color: colors.textDim, textAlign: 'center', marginTop: 40, fontSize: 15, paddingHorizontal: 40, lineHeight: 24 },
  fab: { position: 'absolute', bottom: 32, right: 32, width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10 },
});
