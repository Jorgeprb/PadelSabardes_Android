import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Modal, FlatList, Image, Platform } from 'react-native';
import { db } from '../../services/firebaseConfig';
import { collection, addDoc, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { ThemeColors, useTheme } from '../../context/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import WeatherIcon from '../../components/WeatherIcon';
import { useTranslation } from '../../context/LanguageContext';
import { useCourtWeather } from '../../hooks/useCourtWeather';
import { formatIsoDate, getHourlyFocusIndex, getWeatherForIsoDate } from '../../services/weather';
import { sendCategorizedPushNotification } from '../../services/PushService';

const dayNames = {
  es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  gl: ['Domingo', 'Luns', 'Martes', 'Mércores', 'Xoves', 'Venres', 'Sábado'],
} as const;

export default function CreateEditMatchScreen({ route, navigation }: any) {
  const { matchId, initialDateStr } = route?.params || {};
  const { user } = useAuth();
  const { primaryColor, colors } = useTheme();
  const { t, language } = useTranslation();
  const { forecast, loading: weatherLoading, error: weatherError } = useCourtWeather();
  const styles = getStyles(colors, primaryColor);

  const [dateObj, setDateObj] = useState(() => {
    if (initialDateStr) {
      const [d, mo] = initialDateStr.split('/');
      const parsedDate = new Date();
      parsedDate.setDate(parseInt(d, 10));
      parsedDate.setMonth(parseInt(mo, 10) - 1);
      return parsedDate;
    }
    return new Date();
  });
  const [timeObj, setTimeObj] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [loading, setLoading] = useState(false);

  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [inviteAll, setInviteAll] = useState(true);

  const [preParticipantes, setPreParticipantes] = useState<any[]>([null, null, null, null]);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [existingMatchMeta, setExistingMatchMeta] = useState<{
    creadorId?: string;
    creadorNombre?: string;
    fechaCreacion?: string;
  } | null>(null);

  const hourlyScrollRef = useRef<ScrollView | null>(null);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const initData = async () => {
      try {
        const uSnap = await getDocs(collection(db, 'users'));
        const fetchedUsers = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setUsers(fetchedUsers);
        if (isAdmin) {
          const gSnap = await getDocs(collection(db, 'groups'));
          setGroups(gSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }

        if (matchId) {
          const mSnap = await getDoc(doc(db, 'matches', matchId));
          if (mSnap.exists()) {
            const matchData = mSnap.data();
            setExistingMatchMeta({
              creadorId: matchData.creadorId,
              creadorNombre: matchData.creadorNombre,
              fechaCreacion: matchData.fechaCreacion,
            });

            if (!isAdmin && matchData.creadorId !== user?.uid) {
              Alert.alert('Aviso', 'Solo el creador del partido o un administrador pueden editarlo.', [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
              return;
            }

            const [d, mo] = matchData.fecha.split('/');
            const [h, mi] = matchData.hora.split(':');
            const parsedDate = new Date();
            parsedDate.setDate(parseInt(d, 10));
            parsedDate.setMonth(parseInt(mo, 10) - 1);
            const parsedTime = new Date();
            parsedTime.setHours(parseInt(h, 10));
            parsedTime.setMinutes(parseInt(mi, 10));
            setDateObj(parsedDate);
            setTimeObj(parsedTime);

            if (matchData.listaInvitados.length === fetchedUsers.length) setInviteAll(true);
            else {
              setInviteAll(false);
              setSelectedUserIds(new Set(matchData.listaInvitados));
            }

            const newPre: Array<any | null> = [null, null, null, null];
            (matchData.listaParticipantes || []).forEach((uid: string, i: number) => {
              if (i < 4) newPre[i] = fetchedUsers.find(u => u.id === uid) || null;
            });
            setPreParticipantes(newPre);
          }
        }
      } catch (e) {
        console.log('Error initializing match editor:', e);
      }
    };
    initData();
  }, [isAdmin, matchId, navigation, user?.uid]);

  const formatDDMM = (d: Date) => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  };

  const formatHHMM = (d: Date) => {
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const selectedIsoDate = useMemo(() => formatIsoDate(dateObj), [dateObj]);
  const selectedTime = useMemo(() => formatHHMM(timeObj), [timeObj]);
  const weatherForSelectedDay = useMemo(() => getWeatherForIsoDate(forecast, selectedIsoDate), [forecast, selectedIsoDate]);
  const selectedHourlyIndex = useMemo(
    () => getHourlyFocusIndex(weatherForSelectedDay.hourly, selectedTime),
    [weatherForSelectedDay.hourly, selectedTime],
  );
  const highlightedHour = weatherForSelectedDay.hourly[selectedHourlyIndex] || null;

  useEffect(() => {
    if (!weatherForSelectedDay.hourly.length) return;
    const timeout = setTimeout(() => {
      const estimatedX = Math.max(0, selectedHourlyIndex * 104 - 104);
      hourlyScrollRef.current?.scrollTo({ x: estimatedX, animated: true });
    }, 80);

    return () => clearTimeout(timeout);
  }, [selectedHourlyIndex, weatherForSelectedDay.hourly.length, selectedIsoDate, selectedTime]);

  const handleSave = async () => {
    if (!user) return;

    if (matchId && !isAdmin && existingMatchMeta?.creadorId !== user.uid) {
      Alert.alert('Aviso', 'Solo el creador del partido o un administrador pueden editarlo.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
      return;
    }

    const finalFecha = formatDDMM(dateObj);
    const finalHora = formatHHMM(timeObj);

    const finalInvitados = new Set<string>();
    if (inviteAll) {
      users.forEach(u => finalInvitados.add(u.id));
    } else {
      selectedUserIds.forEach(id => finalInvitados.add(id));
      Array.from(selectedGroupIds).forEach(gid => {
        const grp = groups.find(g => g.id === gid);
        if (grp && grp.userIds) grp.userIds.forEach((uid: string) => finalInvitados.add(uid));
      });
    }

    const fisicosParticipantes = preParticipantes.filter(p => p !== null).map(p => p.id);

    try {
      setLoading(true);

      const qMatches = await getDocs(collection(db, 'matches'));
      let hasCollision = false;
      const getMinutes = (hStr: string) => {
        const [h, m] = hStr.split(':');
        return parseInt(h, 10) * 60 + parseInt(m, 10);
      };
      const newStartMin = getMinutes(finalHora);
      const newEndMin = newStartMin + 90;

      qMatches.docs.forEach(docSnap => {
        const m = { id: docSnap.id, ...docSnap.data() } as any;
        if (m.fecha === finalFecha) {
          if (matchId && m.id === matchId) return;
          const eStartMin = getMinutes(m.hora);
          const eEndMin = eStartMin + 90;
          if (newStartMin < eEndMin && newEndMin > eStartMin) {
            hasCollision = true;
          }
        }
      });

      if (!hasCollision) {
        const tDoc = await getDoc(doc(db, 'tournament', 'currentTournament'));
        if (tDoc.exists()) {
          const tData = tDoc.data();
          const checkTMatch = (m: any) => {
            if ((m.status === 'scheduled' || m.status === 'confirmed') && m.date) {
              const [mStr, tStr] = m.date.split(' ');
              const mBase = mStr.substring(0, 5);
              if (mBase === finalFecha) {
                const eStartMin = getMinutes(tStr);
                const eEndMin = eStartMin + 90;
                if (newStartMin < eEndMin && newEndMin > eStartMin) {
                  hasCollision = true;
                }
              }
            }
          };
          (tData.schedule || []).forEach(checkTMatch);
          if (tData.bracket) {
            (tData.bracket.quarterfinals || []).forEach(checkTMatch);
            (tData.bracket.semifinals || []).forEach(checkTMatch);
            if (tData.bracket.final) checkTMatch(tData.bracket.final);
          }
        }
      }

      if (hasCollision) {
        setLoading(false);
        return Alert.alert(t('court_busy'), t('court_busy_msg'));
      }

      const payload = {
        titulo: 'PÁDEL',
        fecha: finalFecha,
        hora: finalHora,
        ubicacion: 'Sabardes',
        plazas: 4,
        creadorId: existingMatchMeta?.creadorId || user.uid,
        creadorNombre: existingMatchMeta?.creadorNombre || user.nombreApellidos,
        listaParticipantes: fisicosParticipantes,
        listaInvitados: Array.from(finalInvitados),
        estado: 'abierto',
      };

      if (matchId) {
        await updateDoc(doc(db, 'matches', matchId), {
          ...payload,
          ...(existingMatchMeta?.fechaCreacion ? { fechaCreacion: existingMatchMeta.fechaCreacion } : {}),
        });
      } else {
        await addDoc(collection(db, 'matches'), { ...payload, fechaCreacion: new Date().toISOString() });
      }

      const usersToNotify = new Set([...Array.from(finalInvitados), ...fisicosParticipantes]);
      usersToNotify.delete(user?.uid || '');

      if (matchId) {
        await sendCategorizedPushNotification(Array.from(usersToNotify), 'Cambios en tu partido', `El partido del ${finalFecha} a las ${finalHora} ha sido actualizado.`, 'changes');
      } else {
        await sendCategorizedPushNotification(Array.from(usersToNotify), '🎾 ¡Nuevo Partido Disponible!', `Has sido invitado a jugar el ${finalFecha} a las ${finalHora}.`, 'invitations');
      }

      Alert.alert(t('success'), matchId ? t('match_updated') : t('match_created'));
      navigation.goBack();
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
      setLoading(false);
    }
  };

  const openUserModal = (slotIndex: number) => {
    if (preParticipantes[slotIndex] !== null) {
      const newPre = [...preParticipantes];
      newPre[slotIndex] = null;
      setPreParticipantes(newPre);
    } else {
      setActiveSlot(slotIndex);
      setModalVisible(true);
    }
  };

  const selectUserForSlot = (selectedUser: any) => {
    if (activeSlot === null) return;
    const newPre = [...preParticipantes];
    newPre[activeSlot] = selectedUser;
    setPreParticipantes(newPre);
    setModalVisible(false);
  };

  const renderSlots = () => {
    const half = 2;
    return (
      <View style={styles.playersSection}>
        <Text style={styles.sectionTitle}>{t('players')}</Text>
        <View style={styles.teamRow}>
          <View style={styles.teamLetterAbsolute} pointerEvents="none">
            <Text style={styles.teamLetterText}>A</Text>
          </View>
          <View style={[styles.teamLetterAbsolute, { left: 'auto', right: 0 }]} pointerEvents="none">
            <Text style={styles.teamLetterText}>B</Text>
          </View>

          {preParticipantes.slice(0, half).map((p, index) => renderSingleSlot(p, index))}

          <View style={styles.verticalDivider} />

          {preParticipantes.slice(half, 4).map((p, i) => renderSingleSlot(p, half + i))}
        </View>
      </View>
    );
  };

  const renderSingleSlot = (p: any, absoluteIndex: number) => {
    if (p) {
      return (
        <View style={styles.slotPlayer} key={`slot-${absoluteIndex}`}>
          <TouchableOpacity style={styles.avatarWrap} onPress={() => openUserModal(absoluteIndex)}>
            {p.fotoURL ? (
              <Image source={{ uri: p.fotoURL }} style={styles.slotAvatar} />
            ) : (
              <View style={styles.slotAvatarPlaceholder}>
                <Text style={styles.slotInitials}>{p.nombreApellidos?.charAt(0)?.toUpperCase()}</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.slotName} numberOfLines={1}>{p.nombreApellidos?.split(' ')[0]}</Text>
        </View>
      );
    }

    return (
      <View style={styles.slotPlayer} key={`slot-${absoluteIndex}`}>
        <TouchableOpacity style={[styles.slotEmpty, { borderColor: primaryColor }]} onPress={() => openUserModal(absoluteIndex)}>
          <Ionicons name="add" size={28} color={primaryColor} />
        </TouchableOpacity>
        <Text style={[styles.slotEmptyText, { color: primaryColor }]}></Text>
      </View>
    );
  };

  const toggleSelection = (id: string, isGroup: boolean) => {
    if (inviteAll) setInviteAll(false);
    if (isGroup) {
      const next = new Set(selectedGroupIds);
      next.has(id) ? next.delete(id) : next.add(id);
      setSelectedGroupIds(next);
    } else {
      const next = new Set(selectedUserIds);
      next.has(id) ? next.delete(id) : next.add(id);
      setSelectedUserIds(next);
    }
  };

  const toggleAll = () => {
    setInviteAll(!inviteAll);
    if (!inviteAll) {
      setSelectedUserIds(new Set());
      setSelectedGroupIds(new Set());
    }
  };

  const renderSelectionItem = (item: any, isGroup: boolean) => {
    const isSelected = isGroup ? selectedGroupIds.has(item.id) : selectedUserIds.has(item.id);
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.selectionCard, isSelected && !inviteAll && { borderColor: primaryColor, borderWidth: 2 }]}
        onPress={() => toggleSelection(item.id, isGroup)}
      >
        <View style={styles.cardInfo}>
          <View style={[styles.iconWrap, { backgroundColor: colors.background }]}>
            <Ionicons name={isGroup ? 'people' : 'person'} size={20} color={colors.textDim} />
          </View>
          <Text style={styles.userName}>{isGroup ? item.name : item.nombreApellidos}</Text>
        </View>
        <Ionicons name={isSelected && !inviteAll ? 'checkmark-circle' : 'ellipse-outline'} size={28} color={isSelected && !inviteAll ? primaryColor : colors.border} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: primaryColor }]} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{matchId ? t('save_changes') : t('create_match')}</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.form}>
        <View style={styles.row}>
          <View style={styles.halfInput}>
            <Text style={styles.label}>{t('date')}</Text>
            <TouchableOpacity style={styles.pickerBox} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.pickerText}>{formatDDMM(dateObj)}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={dateObj}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (date) setDateObj(date);
                }}
              />
            )}
          </View>
          <View style={styles.halfInput}>
            <Text style={styles.label}>{t('time')}</Text>
            <TouchableOpacity style={styles.pickerBox} onPress={() => setShowTimePicker(true)}>
              <Text style={[styles.pickerText, { color: primaryColor }]}>{selectedTime}</Text>
            </TouchableOpacity>
            {showTimePicker && (
              <DateTimePicker
                value={timeObj}
                mode="time"
                display="spinner"
                onChange={(event, date) => {
                  setShowTimePicker(Platform.OS === 'ios');
                  if (date) setTimeObj(date);
                }}
              />
            )}
          </View>
        </View>

        <View style={styles.weatherSection}>
          <View style={styles.weatherHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>{t('weather_forecast')}</Text>
              <Text style={styles.weatherCaption}>{t('weather_match_hour')} · {selectedTime}</Text>
            </View>
            {highlightedHour && (
              <View style={[styles.weatherSummary, { borderColor: `${primaryColor}33` }]}>
                <WeatherIcon kind={highlightedHour.visualKind} isDay={highlightedHour.isDay} size={24} color={primaryColor} />
                <View style={styles.weatherSummaryCopy}>
                  <Text style={styles.weatherSummaryTemp}>{highlightedHour.temperature ?? '--'}°C</Text>
                  <Text style={styles.weatherSummaryDesc}>{t(highlightedHour.labelKey)}</Text>
                </View>
              </View>
            )}
          </View>

          {weatherLoading ? (
            <Text style={styles.weatherEmpty}>{t('weather_loading')}</Text>
          ) : weatherError ? (
            <Text style={styles.weatherEmpty}>{t('weather_error')}</Text>
          ) : weatherForSelectedDay.hourly.length === 0 ? (
            <Text style={styles.weatherEmpty}>{t('weather_unavailable')}</Text>
          ) : (
            <ScrollView
              ref={hourlyScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hourlyScrollContent}
            >
              {weatherForSelectedDay.hourly.map((entry, index) => {
                const isSelected = index === selectedHourlyIndex;
                return (
                  <View key={entry.isoTime} style={[styles.hourlyCard, isSelected && { borderColor: `${primaryColor}aa`, backgroundColor: `${primaryColor}12` }]}>
                    <Text style={styles.hourlyTime}>{entry.hour}</Text>
                    <WeatherIcon kind={entry.visualKind} isDay={entry.isDay} size={28} color={isSelected ? primaryColor : '#cbd5e1'} />
                    <Text style={styles.hourlyTemp}>{entry.temperature ?? '--'}°C</Text>
                    {isSelected && <Text style={styles.hourlyTag}>{t('weather_selected_hour')}</Text>}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>

        {renderSlots()}

        <View style={styles.sectionBox}>
          <Text style={styles.sectionHeader}>{t('invitations')}</Text>

          <TouchableOpacity style={[styles.selectionCard, inviteAll && { borderColor: primaryColor, borderWidth: 2 }]} onPress={toggleAll}>
            <View style={styles.cardInfo}>
              <View style={[styles.iconWrap, { backgroundColor: colors.background }]}>
                <Ionicons name="globe" size={20} color={colors.textDim} />
              </View>
              <Text style={styles.userName}>{t('everyone_global')}</Text>
            </View>
            <Ionicons name={inviteAll ? 'checkmark-circle' : 'ellipse-outline'} size={28} color={inviteAll ? primaryColor : colors.border} />
          </TouchableOpacity>

          {isAdmin && (
            <>
              <Text style={[styles.groupLabel, { marginTop: 16 }]}>{t('fast_groups')}</Text>
              {groups.length === 0 && <Text style={styles.emptyText}>{t('no_groups')}</Text>}
              {groups.map(g => renderSelectionItem(g, true))}
            </>
          )}

          <Text style={[styles.groupLabel, { marginTop: 24 }]}>{t('individuals')}</Text>
          {users.map(u => renderSelectionItem(u, false))}
        </View>

        <Text style={styles.previewNote}>{dayNames[language][dateObj.getDay()]} {formatDDMM(dateObj)} · {selectedTime}</Text>
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('assign_player')}</Text>
            <FlatList
              data={users}
              keyExtractor={(u) => u.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalUserCard} onPress={() => selectUserForSlot(item)}>
                  {item.fotoURL ? (
                    <Image source={{ uri: item.fotoURL }} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }} />
                  ) : (
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                      <Text style={{ color: colors.text, fontWeight: 'bold' }}>{item.nombreApellidos?.charAt(0)}</Text>
                    </View>
                  )}
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold' }}>{item.nombreApellidos}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setModalVisible(false)}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors, primaryColor: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  saveBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, shadowColor: primaryColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  saveText: { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  form: { padding: 16, paddingBottom: 60 },

  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  halfInput: { flex: 0.48 },
  label: { color: colors.textDim, marginBottom: 8, fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 },
  pickerBox: { backgroundColor: colors.surface, padding: 20, borderRadius: 24, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, alignItems: 'center' },
  pickerText: { color: colors.text, fontSize: 32, fontWeight: '900', letterSpacing: 2 },

  weatherSection: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  weatherHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  weatherCaption: { color: colors.textDim, fontSize: 13, fontWeight: '700' },
  weatherSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 130,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  weatherSummaryCopy: { alignItems: 'flex-end' },
  weatherSummaryTemp: { color: colors.text, fontSize: 20, fontWeight: '900' },
  weatherSummaryDesc: { color: colors.textDim, fontSize: 12 },
  weatherEmpty: { color: colors.textDim, fontSize: 14 },
  hourlyScrollContent: { gap: 12 },
  hourlyCard: {
    minWidth: 92,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.85)',
    backgroundColor: 'rgba(15,23,42,0.82)',
    alignItems: 'center',
    gap: 10,
  },
  hourlyTime: { color: colors.text, fontSize: 14, fontWeight: '900' },
  hourlyTemp: { color: '#dbeafe', fontSize: 16, fontWeight: '900' },
  hourlyTag: { color: primaryColor, fontSize: 11, fontWeight: '800', textAlign: 'center' },

  playersSection: { backgroundColor: colors.surface, borderRadius: 24, padding: 20, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 24 },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: colors.text, marginBottom: 16 },
  teamRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  teamLetterAbsolute: { position: 'absolute', bottom: -8, left: -8, opacity: 0.06, zIndex: 0, pointerEvents: 'none' },
  teamLetterText: { fontSize: 90, fontWeight: '900', color: colors.text },
  verticalDivider: { width: 1, height: 80, backgroundColor: colors.border, marginHorizontal: 20, zIndex: 1 },

  slotPlayer: { alignItems: 'center', width: 66, marginHorizontal: 4 },
  avatarWrap: { position: 'relative' },
  slotAvatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: colors.border },
  slotAvatarPlaceholder: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  slotInitials: { fontSize: 24, fontWeight: '900', color: colors.textDim },
  slotName: { marginTop: 8, fontSize: 12, fontWeight: '700', color: colors.text },
  slotEmpty: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  slotEmptyText: { marginTop: 8, fontSize: 12, fontWeight: '700' },

  sectionBox: { backgroundColor: colors.surface, padding: 20, borderRadius: 24, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, borderWidth: 1, borderColor: colors.border },
  sectionHeader: { fontSize: 20, fontWeight: '900', color: colors.text, marginBottom: 20 },
  groupLabel: { color: colors.textDim, fontWeight: 'bold', marginBottom: 12, fontSize: 13, textTransform: 'uppercase' },
  emptyText: { color: colors.textDim, fontStyle: 'italic', marginBottom: 8 },
  selectionCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.background, padding: 14, borderRadius: 16, marginBottom: 10, borderWidth: 2, borderColor: 'transparent' },
  cardInfo: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: colors.border },
  userName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  previewNote: { color: colors.textDim, textAlign: 'center', fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, height: '80%' },
  modalTitle: { fontSize: 24, fontWeight: '900', color: colors.text, marginBottom: 20 },
  modalUserCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalCloseBtn: { backgroundColor: colors.danger, padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 16 },
});
