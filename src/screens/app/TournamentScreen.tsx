import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal,
  ActivityIndicator, Alert, FlatList, Image, TextInput, Switch, Keyboard
} from 'react-native';
import { db } from '../../services/firebaseConfig';
import {
  collection, doc, onSnapshot, getDoc, getDocs, addDoc,
  updateDoc, deleteDoc, setDoc, query, where
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { sendCategorizedPushNotification } from '../../services/PushService';

const TOURNAMENT_DOC = 'currentTournament';

async function sendPushNotification(expoPushToken: string, title: string, body: string) {
  const message = {
    to: expoPushToken,
    sound: 'default',
    title,
    body,
  };

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
}

const getNextDayDate = (dayName: string) => {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const target = days.indexOf(dayName);
  const now = new Date();
  const current = now.getDay();
  let diff = target - current;
  if (diff <= 0) diff += 7;
  const next = new Date(now.getTime() + diff * 24 * 60 * 60 * 1000);
  return `${String(next.getDate()).padStart(2, '0')}/${String(next.getMonth() + 1).padStart(2, '0')}`;
};

// --- Rules Modal Content ---
// The rules are now handled via i18n in LanguageContext.tsx

export default function TournamentScreen({ navigation }: any) {
  const { user } = useAuth();
  const { primaryColor, colors, autoApproveTournament } = useTheme();
  const { t } = useTranslation();
  const styles = getStyles(colors, primaryColor);

  const RULES = [
    { icon: '1️⃣', title: t('rule_1_title'), text: t('rule_1_text') },
    { icon: '2️⃣', title: t('rule_2_title'), text: t('rule_2_text') },
    { icon: '3️⃣', title: t('rule_3_title'), text: t('rule_3_text') },
    { icon: '⚡', title: t('rule_4_title'), text: t('rule_4_text') },
    { icon: '🏆', title: t('rule_5_title'), text: t('rule_5_text') },
  ];

  const [tournament, setTournament] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rulesVisible, setRulesVisible] = useState(false);
  const [partnerModalVisible, setPartnerModalVisible] = useState(false);
  const [myTeam, setMyTeam] = useState<any>(null);
  const [pendingInvite, setPendingInvite] = useState<any>(null);

  // Admin Manual Pairing
  const [adminPairingVisible, setAdminPairingVisible] = useState(false);
  const [p1, setP1] = useState<any>(null);
  const [p2, setP2] = useState<any>(null);
  const [selectingPlayer, setSelectingPlayer] = useState<'p1' | 'p2'>('p1');

  // Admin result override
  const [overrideModalVisible, setOverrideModalVisible] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<any>(null);
  const [matchSets, setMatchSets] = useState([{ t1: '', t2: '' }, { t1: '', t2: '' }, { t1: '', t2: '' }]);

  // Team name editing (admin + members)
  const [editTeamModalVisible, setEditTeamModalVisible] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [editTeamName, setEditTeamName] = useState('');
  const [savingTeam, setSavingTeam] = useState(false);

  // User rename own team
  const [renameMyTeamVisible, setRenameMyTeamVisible] = useState(false);
  const [myTeamNewName, setMyTeamNewName] = useState('');

  // Calendar Available Picker State
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [matchesPerWeek, setMatchesPerWeek] = useState(1);
  const [submittingProposals, setSubmittingProposals] = useState(false);
  const [includePartner, setIncludePartner] = useState(false);
  const [myProposedSlots, setMyProposedSlots] = useState<string[]>([]);
  const [myVetoedSlots, setMyVetoedSlots] = useState<string[]>([]);
  const [slotActionVisible, setSlotActionVisible] = useState<{ visible: boolean, dateStr: string }>({ visible: false, dateStr: '' });
  const [globalMatches, setGlobalMatches] = useState<any[]>([]);


  // Custom Confirm Modal
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmText: string;
    confirmColor?: string;
    onConfirm: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
    confirmText: '',
    onConfirm: () => {}
  });

  const [startPhaseModalVisible, setStartPhaseModalVisible] = useState(false);
  const [startPhaseDate, setStartPhaseDate] = useState(new Date());
  const [showStartPhasePicker, setShowStartPhasePicker] = useState(false);

  // Legacy picker state (kept for phase start picker)
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
  const [myVetoes, setMyVetoes] = useState<string[]>([]);
  const [pickerMode, setPickerMode] = useState<'propose' | 'veto'>('propose');

  const [adminMatchOptionsVisible, setAdminMatchOptionsVisible] = useState(false);

  useEffect(() => {
    const unsub1 = onSnapshot(doc(db, 'tournament', TOURNAMENT_DOC), snap => {
      setTournament(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    });
    const unsub2 = onSnapshot(collection(db, 'tournamentTeams'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTeams(data);
      const mine = data.find(t => t.player1Id === user?.uid || t.player2Id === user?.uid);
      setMyTeam(mine || null);
      const invite = data.find(t => t.player2Id === user?.uid && t.status === 'pending');
      setPendingInvite(invite || null);
    });
    const unsub3 = onSnapshot(doc(db, 'config', 'tournamentSlots'), snap => {
      if (snap.exists()) {
        setAvailableSlots(snap.data().slots || []);
        if (snap.data().matchesPerWeek) setMatchesPerWeek(snap.data().matchesPerWeek);
      }
    });
    const unsub4 = onSnapshot(collection(db, 'matches'), snap => {
      setGlobalMatches(snap.docs.map(d => d.data()));
    });
    getDocs(collection(db, 'users')).then(snap => {
      setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [user?.uid]);

  // Admin: phase management
  const startPhase2 = async () => {
    setStartPhaseModalVisible(false);
    await setDoc(doc(db, 'tournament', TOURNAMENT_DOC), { phase: 'phase2', startedAt: startPhaseDate.toISOString() }, { merge: true });
    await generateRoundRobinSchedule();
  };

  const setPhase = async (phase: string) => {
    if (phase === 'phase2') {
      setStartPhaseModalVisible(true);
      return;
    }
    await setDoc(doc(db, 'tournament', TOURNAMENT_DOC), { phase, startedAt: new Date().toISOString() }, { merge: true });
    if (phase === 'phase3') await generateBracket();
  };

  const goBackPhase = () => {
    const phases: string[] = ['pending', 'phase1', 'phase2', 'phase3'];
    const currentPhase = tournament?.phase;
    const currentIdx = phases.indexOf(currentPhase);
    if (!currentPhase || currentIdx < 1) {
      Alert.alert('Sin cambios', `Fase: "${currentPhase || 'desconocida'}". No se puede retroceder.`);
      return;
    }
    const prevPhase = phases[currentIdx - 1];
    
    setConfirmModalConfig({
      visible: true,
      title: 'Retroceder Fase',
      message: `¿Seguro que quieres volver de "${currentPhase}" a "${prevPhase}"?`,
      confirmText: 'Retroceder',
      confirmColor: colors.danger,
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, 'tournament', TOURNAMENT_DOC), { phase: prevPhase });
        } catch (e: any) { Alert.alert('Error', e.message); }
      }
    });
  };

  const resetTournament = () => {
    setConfirmModalConfig({
      visible: true,
      title: 'Resetear Torneo',
      message: '¿Seguro que quieres borrar TODOS los datos del torneo, incluyendo equipos inscritos, calendario y resultados? ¡Esta acción es irreversible!',
      confirmText: 'Sí, Resetear',
      confirmColor: colors.danger,
      onConfirm: async () => {
        try {
          const teamsSnap = await getDocs(collection(db, 'tournamentTeams'));
          await Promise.all(teamsSnap.docs.map(d => deleteDoc(doc(db, 'tournamentTeams', d.id))));

          // Buscamos y cerramos/borramos todos los partidos que son del torneo
          const matchesSnap = await getDocs(collection(db, 'matches'));
          const tournamentMatchesToDelete = matchesSnap.docs.filter(d => Boolean(d.data().isTournament) || Boolean(d.data().tournamentMatchId));
          await Promise.all(tournamentMatchesToDelete.map(d => deleteDoc(doc(db, 'matches', d.id))));

          await setDoc(doc(db, 'tournament', TOURNAMENT_DOC), { phase: 'pending', startedAt: null, schedule: [], bracket: {} });
          Alert.alert('Torneo Reseteado', 'Se ha vaciado el torneo por completo y cancelado todos los cruces abiertos.');
        } catch (e: any) { Alert.alert('Error', e.message); }
      }
    });
  };

  const generateRoundRobinSchedule = async () => {
    const confirmedTeams = teams.filter(t => t.status === 'confirmed');
    if (confirmedTeams.length < 2) return;

    // Fetch current matchesPerWeek from config (use local state as fallback)
    let mpw = matchesPerWeek;
    try {
      const cfgSnap = await getDoc(doc(db, 'config', 'tournamentSlots'));
      if (cfgSnap.exists() && cfgSnap.data().matchesPerWeek) mpw = cfgSnap.data().matchesPerWeek;
    } catch (_) {}

    const existing = tournament?.schedule || [];

    // Comprobamos si la lista de equipos inscritos encaja exactamente con la del horario actual
    if (existing.length > 0) {
      const teamsInSchedule = new Set<string>();
      existing.forEach((m: any) => {
        teamsInSchedule.add(m.team1Id);
        teamsInSchedule.add(m.team2Id);
      });
      teamsInSchedule.delete('dummy');
      
      const isSameComposition = confirmedTeams.every(t => teamsInSchedule.has(t.id)) && confirmedTeams.length === teamsInSchedule.size;
      
      // Si a pesar de retroceder, el admin no añadió ni borró ningún equipo, se preservan los horarios y cruces intactos.
      if (isSameComposition) {
        return;
      }
    }

    const newMatchups: any[] = [];
    const teamRefs = [...confirmedTeams];
    
    // Añadimos equipo "Descanso" si es impar para simular el algoritmo Round-Robin a la perfección
    if (teamRefs.length % 2 !== 0) {
       teamRefs.push({ id: 'dummy', name: 'Descanso', status: 'dummy' });
    }

    const n = teamRefs.length;
    const roundGroups = [];

    // Algoritmo Round-Robin (Método del Círculo)
    for (let round = 0; round < n - 1; round++) {
       const roundMatches = [];
       for (let i = 0; i < n / 2; i++) {
          const tA = teamRefs[i];
          const tB = teamRefs[n - 1 - i];
          if (tA.id !== 'dummy' && tB.id !== 'dummy') {
             roundMatches.push({ tA, tB });
          }
       }
       roundGroups.push(roundMatches);
       
       // Rotamos el arreglo: el primero se queda fijo, el resto rota
       const last = teamRefs.pop();
       if (last) teamRefs.splice(1, 0, last);
    }

    // Convertimos las rondas en semanas según matchesPerWeek
    roundGroups.forEach((roundMatches, roundIdx) => {
       const weekNum = Math.floor(roundIdx / mpw) + 1;
       
       roundMatches.forEach(({tA, tB}) => {
          const idStr = `${tA.id}_${tB.id}`;
          newMatchups.push({
             id: idStr,
             team1Id: tA.id, team1Name: tA.name,
             team2Id: tB.id, team2Name: tB.name,
             status: 'pending', result: null,
             week: weekNum,
          });
       });
    });

    await setDoc(doc(db, 'tournament', TOURNAMENT_DOC), { schedule: newMatchups }, { merge: true });
  };

  const generateBracket = async () => {
    if (tournament?.bracket?.quarterfinals?.length > 0) return;

    const standings = getStandings();
    const top8 = standings.slice(0, 8);

    // Sanitize: Firestore rejects undefined; use null for missing seeds
    const seed = (i: number) => top8[i] ?? null;

    const bracket = {
      quarterfinals: [
        { id: 'qf1', teamA: seed(0), teamB: seed(7) },
        { id: 'qf2', teamA: seed(1), teamB: seed(6) },
        { id: 'qf3', teamA: seed(2), teamB: seed(5) },
        { id: 'qf4', teamA: seed(3), teamB: seed(4) },
      ],
      semifinals: [],
      final: {}
    };
    await setDoc(doc(db, 'tournament', TOURNAMENT_DOC), { bracket }, { merge: true });
  };

  const overrideResult = async () => {
    if (!selectedMatch) return;
    const smId1 = selectedMatch.team1Id || selectedMatch.teamA?.id;
    const smId2 = selectedMatch.team2Id || selectedMatch.teamB?.id;
    const isImplicatedTeam = myTeam?.id && (smId1 === myTeam.id || smId2 === myTeam.id);
    if (user?.role !== 'admin' && !isImplicatedTeam) return;
    
    // Process valid sets (only those where both scores are filled)
    const validSets = matchSets.filter(s => s.t1 !== '' && s.t2 !== '');
    if (validSets.length === 0) {
      Alert.alert('Error', 'Debes introducir al menos un set válido.');
      return;
    }

    let t1SetsWon = 0;
    let t2SetsWon = 0;
    validSets.forEach(s => {
      const s1 = parseInt(s.t1);
      const s2 = parseInt(s.t2);
      if (s1 > s2) t1SetsWon++;
      else if (s2 > s1) t2SetsWon++;
    });

    const id1 = selectedMatch.team1Id || selectedMatch.teamA?.id;
    const id2 = selectedMatch.team2Id || selectedMatch.teamB?.id;
    
    let winnerId = null;
    if (t1SetsWon > t2SetsWon) winnerId = id1;
    else if (t2SetsWon > t1SetsWon) winnerId = id2;

    try {
      if (selectedMatch.phase === 'bracket') {
         const bracketObj = { ...tournament.bracket };
         const [roundStr, index] = selectedMatch.bracketPath;

         let newMatch;
         if (roundStr === 'final') {
            newMatch = { ...bracketObj.final };
         } else {
            newMatch = { ...bracketObj[roundStr][index] };
         }

         newMatch.status = 'confirmed';
         newMatch.sets = validSets.map(s => ({ team1: parseInt(s.t1), team2: parseInt(s.t2) }));
         newMatch.winnerId = winnerId;
         
         if (roundStr === 'final') bracketObj.final = newMatch;
         else bracketObj[roundStr][index] = newMatch;

         // Bracket Auto-Progression
         const t1A = newMatch.teamA || teams.find(t => t.id === newMatch.team1Id);
         const t2B = newMatch.teamB || teams.find(t => t.id === newMatch.team2Id);
         const winnerTeam = winnerId === (t1A?.id || newMatch?.team1Id) ? t1A : t2B;
         
         if (roundStr === 'quarterfinals' && winnerTeam) {
             const allQfs = bracketObj.quarterfinals || [];
             const finishedCount = allQfs.filter((qf: any) => qf.winnerId || (qf.id === newMatch.id && winnerId)).length;
             
             if (finishedCount === 4 && (!bracketObj.semifinals || bracketObj.semifinals.length === 0)) {
                 const winners = allQfs.map((qf: any) => {
                     const wId = qf.id === newMatch.id ? winnerId : qf.winnerId;
                     const teamA = qf.teamA || teams.find(t => t.id === qf.team1Id);
                     const teamB = qf.teamB || teams.find(t => t.id === qf.team2Id);
                     return wId === (teamA?.id || qf.team1Id) ? teamA : teamB;
                 });
                 winners.sort(() => Math.random() - 0.5);
                 bracketObj.semifinals = [
                     { id: 'sf1', teamA: winners[0], teamB: winners[1] },
                     { id: 'sf2', teamA: winners[2], teamB: winners[3] }
                 ];
             }
         } else if (roundStr === 'semifinals' && winnerTeam) {
             const isTeamA = index === 0;
             if (!bracketObj.final) bracketObj.final = {id: 'final'};
             if (isTeamA) bracketObj.final.teamA = winnerTeam;
             else bracketObj.final.teamB = winnerTeam;
         }
         
         await updateDoc(doc(db, 'tournament', TOURNAMENT_DOC), { bracket: bracketObj });

      } else {
        const updatedSchedule = tournament.schedule.map((m: any) => {
          if (m.id === selectedMatch.id) {
            return { 
              ...m, 
              status: 'confirmed', 
              sets: validSets.map(s => ({ team1: parseInt(s.t1), team2: parseInt(s.t2) })), 
              winnerId 
            };
          }
          return m;
        });
        await updateDoc(doc(db, 'tournament', TOURNAMENT_DOC), { schedule: updatedSchedule });
      }

      try {
        const qMatches = query(collection(db, 'matches'), where('tournamentMatchId', '==', selectedMatch.id));
        const snapMatches = await getDocs(qMatches);
        snapMatches.forEach(docSnap => {
          deleteDoc(doc(db, 'matches', docSnap.id)).catch(() => {});
        });
      } catch(e) {}

      setOverrideModalVisible(false);
      setSelectedMatch(null);
      setMatchSets([{ t1: '', t2: '' }, { t1: '', t2: '' }, { t1: '', t2: '' }]);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const getStandings = () => {
    const confirmedTeams = teams.filter(t => t.status === 'confirmed');
    const schedule = tournament?.schedule || [];
    return confirmedTeams.map(team => {
      const matches = schedule.filter((m: any) =>
        m.status === 'confirmed' && (m.team1Id === team.id || m.team2Id === team.id)
      );
      const wins = matches.filter((m: any) =>
        (m.team1Id === team.id && m.winnerId === team.id) ||
        (m.team2Id === team.id && m.winnerId === team.id)
      ).length;
      return { ...team, pts: wins * 1, wins, played: matches.length };
    }).sort((a, b) => b.pts - a.pts || b.wins - a.wins);
  };

  // Phase 1: Request a partner
  const requestPartner = async (partnerId: string) => {
    try {
      const partner = allUsers.find(u => u.id === partnerId);
      await addDoc(collection(db, 'tournamentTeams'), {
        player1Id: user?.uid,
        player1Name: user?.nombreApellidos,
        player1Photo: user?.fotoURL || null,
        player2Id: partnerId,
        player2Name: partner?.nombreApellidos,
        player2Photo: partner?.fotoURL || null,
        name: `${user?.nombreApellidos?.split(' ')[0]} / ${partner?.nombreApellidos?.split(' ')[0]}`,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      setPartnerModalVisible(false);
      Alert.alert('Solicitud Enviada', `Se ha notificado a ${partner?.nombreApellidos} para que acepte la pareja.`);

      // Enviar notificación Push real
      if (partner?.uid) {
        await sendCategorizedPushNotification(
          [partner.uid], 
          '¡Nueva Invitación al Torneo!', 
          `${user?.nombreApellidos?.split(' ')[0]} te ha invitado a jugar el torneo como su pareja.`,
          'invitations'
        );
      }
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const acceptInvite = async () => {
    if (!pendingInvite) return;
    await updateDoc(doc(db, 'tournamentTeams', pendingInvite.id), { status: 'confirmed' });
    setPendingInvite(null);
  };

  const declineInvite = async () => {
    if (!pendingInvite) return;
    await deleteDoc(doc(db, 'tournamentTeams', pendingInvite.id));
    setPendingInvite(null);
  };

  const adminCreatePair = async () => {
    if (!p1 || !p2) return;
    try {
      await addDoc(collection(db, 'tournamentTeams'), {
        player1Id: p1.id, player1Name: p1.nombreApellidos, player1Photo: p1.fotoURL || null,
        player2Id: p2.id, player2Name: p2.nombreApellidos, player2Photo: p2.fotoURL || null,
        name: `${p1.nombreApellidos?.split(' ')[0]} / ${p2.nombreApellidos?.split(' ')[0]}`,
        status: 'confirmed', createdAt: new Date().toISOString()
      });
      setAdminPairingVisible(false); setP1(null); setP2(null);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const deleteTeam = (teamId: string, teamName: string) => {
    if (!teamId) { Alert.alert('Error', 'ID no encontrado'); return; }
    
    setConfirmModalConfig({
      visible: true,
      title: 'Eliminar Pareja',
      message: `¿Quieres borrar la pareja "${teamName}" del torneo?`,
      confirmText: 'Eliminar',
      confirmColor: colors.danger,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'tournamentTeams', teamId));
        } catch (e: any) { Alert.alert('Error al eliminar', e.message); }
      }
    });
  };

  const renameMyTeam = async () => {
    if (!myTeam || !myTeamNewName.trim()) return;
    try {
      await updateDoc(doc(db, 'tournamentTeams', myTeam.id), { name: myTeamNewName.trim() });
      setRenameMyTeamVisible(false);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  // Allows a participant to un-schedule a match so both teams can re-negotiate
  const resetScheduledMatch = async (match: any) => {
    if (!myTeam && user?.role !== 'admin') return;
    setConfirmModalConfig({
      visible: true,
      title: 'Cambiar Horario',
      message: '¿Seguro que quieres cancelar la fecha acordada? Se abrirá de nuevo la negociación con el rival.',
      confirmText: 'Sí, cambiar',
      confirmColor: colors.danger,
      onConfirm: async () => {
        try {
          const isBracket = match.phase === 'bracket';
          if (!isBracket) {
            const schedule = [...(tournament.schedule || [])];
            const idx = schedule.findIndex(m => m.id === match.id);
            if (idx === -1) return;
            schedule[idx] = { ...schedule[idx], status: 'pending', date: null };
            await updateDoc(doc(db, 'tournament', TOURNAMENT_DOC), { schedule });
          } else {
            const bracketObj = { ...tournament.bracket };
            const [rStr, iIdx] = match.bracketPath;
            const m = rStr === 'final' ? { ...bracketObj.final } : { ...bracketObj[rStr][iIdx] };
            m.status = 'pending'; m.date = null;
            if (rStr === 'final') bracketObj.final = m; else bracketObj[rStr][iIdx] = m;
            await updateDoc(doc(db, 'tournament', TOURNAMENT_DOC), { bracket: bracketObj });
          }
          // Delete associated match from global matches collection
          try {
            const qMatches = query(collection(db, 'matches'), where('tournamentMatchId', '==', match.id));
            const snapMatches = await getDocs(qMatches);
            snapMatches.forEach(docSnap => {
              deleteDoc(doc(db, 'matches', docSnap.id)).catch(() => {});
            });
          } catch(e) {}
        } catch (e: any) { Alert.alert('Error', e.message); }
      }
    });
  };

  // Admin: reset a played match back to pending
  const resetPlayedMatch = async (match: any) => {
    if (user?.role !== 'admin') return;
    setConfirmModalConfig({
      visible: true,
      title: 'Resetear Partido',
      message: '¿Seguro que quieres anular el resultado de este partido? Volverá a estado "por disputar". Si tiene consecuencias en fases posteriores, se limpiarán.',
      confirmText: 'Sí, resetear',
      confirmColor: colors.danger,
      onConfirm: async () => {
        try {
          const isBracket = match.phase === 'bracket';
          if (!isBracket) {
            // Phase 2 match
            const schedule = [...(tournament.schedule || [])];
            const idx = schedule.findIndex((m: any) => m.id === match.id);
            if (idx === -1) return;
            const resetted = { ...schedule[idx] };
            delete resetted.status; delete resetted.sets; delete resetted.winnerId;
            resetted.status = 'pending';
            schedule[idx] = resetted;
            await updateDoc(doc(db, 'tournament', TOURNAMENT_DOC), { schedule });
          } else {
            const bracketObj = { ...tournament.bracket };
            const [roundStr, index] = match.bracketPath;
            let resetted;
            if (roundStr === 'final') {
              resetted = { ...bracketObj.final };
            } else {
              resetted = { ...bracketObj[roundStr][index] };
            }
            delete resetted.sets; delete resetted.winnerId;
            resetted.status = 'pending';

            if (roundStr === 'final') {
              bracketObj.final = resetted;
            } else {
              bracketObj[roundStr][index] = resetted;
            }

            // Clean downstream: quarterfinals reset => clear semis+final; semifinals reset => clear final positions
            if (roundStr === 'quarterfinals') {
              bracketObj.semifinals = [];
              bracketObj.final = {};
            } else if (roundStr === 'semifinals') {
              // Remove the winner's position from the final
              if (bracketObj.final && bracketObj.final.id) {
                const oldWinnerId = match.winnerId;
                if (oldWinnerId) {
                  if (bracketObj.final.teamA?.id === oldWinnerId) delete bracketObj.final.teamA;
                  if (bracketObj.final.teamB?.id === oldWinnerId) delete bracketObj.final.teamB;
                }
                // If final has no teams left, reset it
                if (!bracketObj.final.teamA && !bracketObj.final.teamB) {
                  bracketObj.final = {};
                }
              }
            }

            await updateDoc(doc(db, 'tournament', TOURNAMENT_DOC), { bracket: bracketObj });
          }
          // Delete associated match from global matches collection
          try {
            const qMatches = query(collection(db, 'matches'), where('tournamentMatchId', '==', match.id));
            const snapMatches = await getDocs(qMatches);
            snapMatches.forEach(docSnap => {
              deleteDoc(doc(db, 'matches', docSnap.id)).catch(() => {});
            });
          } catch(e) {}
        } catch (e: any) { Alert.alert('Error', e.message); }
      }
    });
  };

  const notifyAdminOnOverlap = async (matchDesc: string, overlapStr: string) => {
    try {
      const adminDocs = await getDocs(collection(db, 'users'));
      const adminUids = adminDocs.docs
        .map(d => ({uid: d.id, ...d.data()}))
        .filter((u: any) => u.role === 'admin' && !!u.pushToken)
        .map((u: any) => u.uid);

      if (adminUids.length > 0) {
        await sendCategorizedPushNotification(
          adminUids,
          '⚡ Coincidencia de torneo',
          `Los 4 jugadores de ${matchDesc} pueden jugar el ${overlapStr}. ¡Apuébalo!`,
          'always'
        );
      }
    } catch (e) {
      console.error('[AdminPush] Error sending push to admins', e);
    }
  };

  const submitProposals = async () => {
    if (!myTeam || !selectedMatch || !user?.uid) return;
    setSubmittingProposals(true);
    try {
      const isBracket = selectedMatch.phase === 'bracket';
      const schedule = [...(tournament.schedule || [])];
      let match;
      let matchIdx = -1;

      if (!isBracket) {
        matchIdx = schedule.findIndex(m => m.id === selectedMatch.id);
        if (matchIdx === -1) return;
        match = { ...schedule[matchIdx] };
      } else {
        const [rStr, iIdx] = selectedMatch.bracketPath;
        if (rStr === 'final') match = { ...(tournament.bracket?.final || {}) };
        else match = { ...tournament.bracket[rStr][iIdx] };
      }

      // 1. Prepare player availability object
      const pa = { ...(match.playerAvailability || {}) };
      
      pa[user.uid] = {
        proposed: myProposedSlots,
        vetoed: myVetoedSlots
      };

      // Apply to partner if requested
      if (includePartner) {
        const partnerId = myTeam.player1Id === user.uid ? myTeam.player2Id : myTeam.player1Id;
        if (partnerId) {
          pa[partnerId] = {
            proposed: myProposedSlots,
            vetoed: myVetoedSlots
          };
        }
      }

      match.playerAvailability = pa;

      // 2. Extrapolate all 4 player IDs who need to answer
      const pIdList = [];
      const t1 = teams.find(t => t.id === match.team1Id || t.id === match.teamA?.id);
      const t2 = teams.find(t => t.id === match.team2Id || t.id === match.teamB?.id);
      
      if (t1) { pIdList.push(t1.player1Id); if (t1.player2Id) pIdList.push(t1.player2Id); }
      if (t2) { pIdList.push(t2.player1Id); if (t2.player2Id) pIdList.push(t2.player2Id); }

      // 3. Find Overlap
      let overlap: string | null = null;
      
      // Get all unique proposed slots among these 4 players
      const allProps = new Set<string>();
      pIdList.forEach(id => {
        if (pa[id] && pa[id].proposed) {
          pa[id].proposed.forEach((s: string) => allProps.add(s));
        }
      });

      // A slot is an overlap if present in EVERY player's 'proposed' array
      for (const slot of Array.from(allProps)) {
        let isConsensus = true;
        for (const id of pIdList) {
           const pData = pa[id];
           if (!pData || !pData.proposed.includes(slot)) {
               isConsensus = false;
               break;
           }
        }
        if (isConsensus) {
           overlap = slot;
           break;
        }
      }

      // Check if some veto conflicts exist (just as safety, consensus overrides)
      // Actually if it's in consensus, it can't be vetoed unless UX allows contradictory arrays
      
      if (overlap) {
         const [matchDate, matchTime] = overlap.split(' ');
         match.status = 'scheduled';
         match.date = overlap;

         if (autoApproveTournament) {
           if (t1 && t2) {
              await addDoc(collection(db, 'matches'), {
                fecha: matchDate.substring(0, 5),
                hora: matchTime,
                creadorId: 'admin',
                creadorNombre: 'Torneo',
                listaParticipantes: [t1.player1Id, t1.player2Id, t2.player1Id, t2.player2Id].filter(id => !!id),
                listaInvitados: [],
                isTournament: true,
                tournamentMatchId: match.id,
                createdAt: new Date().toISOString()
              });
           }
           Alert.alert(t('overlap_found'), `${t('match_scheduled')} ${matchDate} ${matchTime}`);
         } else {
           const matchDesc = `${t1?.name || '?'} vs ${t2?.name || '?'}`;
           await notifyAdminOnOverlap(matchDesc, overlap);
           Alert.alert('⚡ ¡Coincidencia!', `Se ha encontrado coincidencia el ${overlap}. Se notificará al administrador para que lo apruebe.`);
         }
      }

      // 4. Save updates
      if (!isBracket) {
         schedule[matchIdx] = match;
         await updateDoc(doc(db, 'tournament', TOURNAMENT_DOC), { schedule });
      } else {
         const bracketObj = { ...tournament.bracket };
         const [rStr, iIdx] = selectedMatch.bracketPath;
         if (rStr === 'final') bracketObj.final = match;
         else bracketObj[rStr][iIdx] = match;
         await updateDoc(doc(db, 'tournament', TOURNAMENT_DOC), { bracket: bracketObj });
      }

      setCalendarModalVisible(false);
      setMyProposedSlots([]);
      setMyVetoedSlots([]);
      setIncludePartner(false);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSubmittingProposals(false); }
  };

  const forceAdminSchedule = async (forcedDateStr: string) => {
    if (!selectedMatch || !user?.uid) return;
    setSubmittingProposals(true);
    try {
      const isBracket = selectedMatch.phase === 'bracket';
      const schedule = [...(tournament?.schedule || [])];
      let match; let matchIdx = -1;

      if (!isBracket) {
        matchIdx = schedule.findIndex((m: any) => m.id === selectedMatch.id);
        if (matchIdx === -1) return;
        match = { ...schedule[matchIdx] };
      } else {
        const [rStr, iIdx] = selectedMatch.bracketPath;
        if (rStr === 'final') match = { ...(tournament.bracket?.final || {}) };
        else match = { ...tournament.bracket[rStr][iIdx] };
      }

      const [matchDate, matchTime] = forcedDateStr.split(' ');
      match.status = 'scheduled';
      match.date = forcedDateStr;

      const t1 = match.teamA || teams.find(t => t.id === match.team1Id);
      const t2 = match.teamB || teams.find(t => t.id === match.team2Id);

      if (t1 && t2) {
         await addDoc(collection(db, 'matches'), {
           fecha: matchDate.substring(0, 5),
           hora: matchTime,
           creadorId: 'admin',
           creadorNombre: 'Torneo',
           listaParticipantes: [t1.player1Id, t1.player2Id, t2.player1Id, t2.player2Id].filter(id => !!id),
           listaInvitados: [],
           isTournament: true,
           tournamentMatchId: match.id,
           createdAt: new Date().toISOString()
         });
      }

      if (!isBracket) {
         schedule[matchIdx] = match;
         await updateDoc(doc(db, 'tournament', TOURNAMENT_DOC), { schedule });
      } else {
         const bracketObj = { ...tournament.bracket };
         const [rStr, iIdx] = selectedMatch.bracketPath;
         if (rStr === 'final') bracketObj.final = match;
         else bracketObj[rStr][iIdx] = match;
         await updateDoc(doc(db, 'tournament', TOURNAMENT_DOC), { bracket: bracketObj });
      }

      Alert.alert('Horario Fijado', `Se ha forzado el partido para el ${forcedDateStr}`);
      setSlotActionVisible({ visible: false, dateStr: '' });
      setCalendarModalVisible(false);
      setMyProposedSlots([]);
      setMyVetoedSlots([]);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSubmittingProposals(false); }
  };

  const updateTeam = async () => {
    if (!editingTeam) return;
    setSavingTeam(true);
    try {
      await updateDoc(doc(db, 'tournamentTeams', editingTeam.id), {
        name: editTeamName.trim() || editingTeam.name,
        player1Id: p1?.id || editingTeam.player1Id,
        player1Name: p1?.nombreApellidos || editingTeam.player1Name,
        player1Photo: p1?.fotoURL || editingTeam.player1Photo || null,
        player2Id: p2?.id || editingTeam.player2Id,
        player2Name: p2?.nombreApellidos || editingTeam.player2Name,
        player2Photo: p2?.fotoURL || editingTeam.player2Photo || null,
      });
      setEditTeamModalVisible(false);
      setEditingTeam(null); setP1(null); setP2(null);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSavingTeam(false); }
  };

  const getUserName = (uid: string) => allUsers.find(u => u.id === uid)?.nombreApellidos || uid;
  const getUserPhoto = (uid: string) => allUsers.find(u => u.id === uid)?.fotoURL;

  const renderPhaseContent = () => {
    if (!tournament || tournament.phase === 'pending') {
      return (
        <View style={styles.pendingWrap}>
          <Text style={styles.pendingEmoji}>🏆</Text>
          <Text style={styles.pendingTitle}>En breves...</Text>
          <Text style={styles.pendingSubtitle}>El próximo torneo de Pádel Sabardes se anunciará próximamente. ¡Mantente atento!</Text>
        </View>
      );
    }
    if (tournament.phase === 'phase1') return renderPhase1();
    if (tournament.phase === 'phase2') return renderPhase2();
    if (tournament.phase === 'phase3') return renderPhase3();
    return null;
  };

  const renderPhase1 = () => {
    const confirmedTeams = teams.filter(t => t.status === 'confirmed');
    const availablePartners = allUsers.filter(u =>
      u.id !== user?.uid && !teams.some(t => t.player1Id === u.id || t.player2Id === u.id)
    );

    return (
      <View>
        <Text style={styles.phaseTitle}>Fase 1: Formación de Parejas</Text>

        {/* Pending invite for me */}
        {pendingInvite && (
          <View style={[styles.inviteCard, { borderColor: primaryColor }]}>
            <Text style={styles.inviteText}>
              <Text style={{fontWeight:'900', color: colors.text}}>{pendingInvite.player1Name}</Text> te ha invitado a formar pareja 🎾
            </Text>
            <View style={styles.inviteActions}>
              <TouchableOpacity style={[styles.inviteBtn, { backgroundColor: primaryColor }]} onPress={acceptInvite}>
                <Text style={styles.inviteBtnText}>Aceptar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.inviteBtn, { backgroundColor: colors.danger }]} onPress={declineInvite}>
                <Text style={styles.inviteBtnText}>Rechazar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* My team */}
        {myTeam ? (
          <View style={[styles.myTeamCard, { borderColor: primaryColor }]}>
            <Ionicons name="people-circle" size={36} color={primaryColor} />
            <View style={{flex:1, marginLeft: 12}}>
              <Text style={styles.myTeamLabel}>Mi Pareja</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.myTeamName}>{myTeam.name}</Text>
                {myTeam.status === 'confirmed' && (
                  <TouchableOpacity onPress={() => { setMyTeamNewName(myTeam.name); setRenameMyTeamVisible(true); }}>
                    <Ionicons name="pencil" size={16} color={primaryColor} />
                  </TouchableOpacity>
                )}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: myTeam.status === 'confirmed' ? primaryColor : colors.border }]}>
                <Text style={styles.statusText}>{myTeam.status === 'confirmed' ? 'Confirmada ✓' : 'Pendiente de aceptación...'}</Text>
              </View>
            </View>
          </View>
        ) : (
          !pendingInvite && (
            <TouchableOpacity style={[styles.joinBtn, { backgroundColor: primaryColor }]} onPress={() => setPartnerModalVisible(true)}>
              <Ionicons name="person-add" size={20} color="#fff" />
              <Text style={styles.joinBtnText}>Buscar Pareja</Text>
            </TouchableOpacity>
          )
        )}

        {/* Confirmed teams list */}
        <Text style={styles.sectionLabel}>Parejas Confirmadas ({confirmedTeams.length})</Text>
        {confirmedTeams.map((team, idx) => (
          <View key={team.id} style={styles.teamRow}>
            <Text style={[styles.teamNumber, { color: primaryColor }]}>#{idx + 1}</Text>
            <View style={styles.teamAvatarGroup}>
              {[team.player1Photo, team.player2Photo].map((photo, pi) =>
                photo ? (
                  <Image key={pi} source={{ uri: photo }} style={[styles.teamAvatar, { marginLeft: pi > 0 ? -8 : 0 }]} />
                ) : (
                  <View key={pi} style={[styles.teamAvatar, styles.teamAvatarPlaceholder, { marginLeft: pi > 0 ? -8 : 0 }]}>
                    <Text style={{ color: colors.text, fontWeight: '900', fontSize: 10 }}>
                      {(pi === 0 ? team.player1Name : team.player2Name)?.charAt(0)}
                    </Text>
                  </View>
                )
              )}
            </View>
            <Text style={styles.teamName}>{team.name}</Text>
            {user?.role === 'admin' && (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={() => {
                  setEditingTeam(team);
                  setEditTeamName(team.name);
                  setP1(allUsers.find(u => u.id === team.player1Id));
                  setP2(allUsers.find(u => u.id === team.player2Id));
                  setEditTeamModalVisible(true);
                }}>
                  <Ionicons name="create-outline" size={20} color={primaryColor} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteTeam(team.id, team.name)}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}

        {/* Partner modal */}
        <Modal visible={partnerModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Elegir Compañero</Text>
              <FlatList
                data={availablePartners}
                keyExtractor={u => u.id}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.partnerRow} onPress={() => requestPartner(item.id)}>
                    {item.fotoURL ? (
                      <Image source={{ uri: item.fotoURL }} style={styles.partnerAvatar} />
                    ) : (
                      <View style={[styles.partnerAvatar, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
                        <Text style={{ color: colors.text, fontWeight: '900' }}>{item.nombreApellidos?.charAt(0)}</Text>
                      </View>
                    )}
                    <Text style={styles.partnerName}>{item.nombreApellidos}</Text>
                    <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={{ color: colors.textDim, textAlign: 'center', margin: 20 }}>No hay jugadores disponibles.</Text>}
              />
              <TouchableOpacity style={[styles.closeModalBtn, { backgroundColor: colors.danger }]} onPress={() => setPartnerModalVisible(false)}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  };

  const renderMatchCard = (match: any, isPlayed: boolean, specialLabel?: string) => {
    const confirmedTeams = teams.filter(t => t.status === 'confirmed');
    const t1 = teams.find(t => t.id === match.team1Id || t.id === match.teamA?.id);
    const t2 = teams.find(t => t.id === match.team2Id || t.id === match.teamB?.id);
    
    // In Phase 3, matches might not have both teams decided yet.
    if (!t1 && !t2 && match.phase === 'bracket') {
        return (
           <View style={[styles.proMatchCard, { opacity: 0.5 }]}>
              {specialLabel && <Text style={[styles.bracketLabel, { marginBottom: 8, width: '100%', color: primaryColor }]}>{specialLabel}</Text>}
              <Text style={{ color: colors.textDim, fontStyle: 'italic', padding: 8 }}>Pendiente oponentes...</Text>
           </View>
        );
    }

    const id1 = t1?.id || match.team1Id || match.teamA?.id;
    const id2 = t2?.id || match.team2Id || match.teamB?.id;

    let isDelayed = false;
    if (!isPlayed && tournament?.startedAt && match.week) {
      const start = new Date(tournament.startedAt);
      const today = new Date();
      start.setHours(0,0,0,0); today.setHours(0,0,0,0);
      const weeksSinceStart = Math.floor((today.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
      if (match.week < weeksSinceStart) {
        isDelayed = true;
      }
    }

    const t1Idx = confirmedTeams.findIndex(t => t.id === id1);
    const t2Idx = confirmedTeams.findIndex(t => t.id === id2);
    const t1Tag = t1Idx >= 0 ? `#${t1Idx + 1} ` : '';
    const t2Tag = t2Idx >= 0 ? `#${t2Idx + 1} ` : '';

    const isT1Winner = match.winnerId === id1;
    const isT2Winner = match.winnerId === id2;

    const renderAvatar = (photo: string | null, name: string) => {
      if (photo) return <Image source={{uri: photo}} style={styles.proMatchAvatar} />;
      return (
        <View style={styles.proMatchAvatarPlaceholder}>
          <Text style={{fontWeight: '900', color: colors.text, fontSize: 13}}>{name?.charAt(0) || '?'}</Text>
        </View>
      );
    };

    return (
      <TouchableOpacity 
        style={[styles.proMatchCard, isDelayed && { borderWidth: 1, borderColor: colors.danger }]} 
        activeOpacity={0.7}
        disabled={
          user?.role !== 'admin' && 
          (!myTeam?.id || (id1 !== myTeam?.id && id2 !== myTeam?.id))
        }
        onPress={() => {
          setSelectedMatch(match);
          const isMyMatch = myTeam?.id && (id1 === myTeam.id || id2 === myTeam.id);
          if (user?.role === 'admin') {
            if (!isPlayed) {
               setAdminMatchOptionsVisible(true);
            } else {
               setMatchSets([{ t1: '', t2: '' }, { t1: '', t2: '' }, { t1: '', t2: '' }]);
               setOverrideModalVisible(true);
            }
          }
          else if (isMyMatch) {
            if (!isPlayed) {
              const pa = match.playerAvailability || {};
              const teamProposed = new Set<string>();
              const teamVetoed = new Set<string>();
              if (myTeam?.player1Id && pa[myTeam.player1Id]) {
                  pa[myTeam.player1Id].proposed?.forEach((s:string) => teamProposed.add(s));
                  pa[myTeam.player1Id].vetoed?.forEach((s:string) => teamVetoed.add(s));
              }
              if (myTeam?.player2Id && pa[myTeam.player2Id]) {
                  pa[myTeam.player2Id].proposed?.forEach((s:string) => teamProposed.add(s));
                  pa[myTeam.player2Id].vetoed?.forEach((s:string) => teamVetoed.add(s));
              }
              setMyProposedSlots(Array.from(teamProposed));
              setMyVetoedSlots(Array.from(teamVetoed));
              setCalendarModalVisible(true);
            } else {
              // User can correct result on played matches they're in
              setMatchSets([{ t1: '', t2: '' }, { t1: '', t2: '' }, { t1: '', t2: '' }]);
              setOverrideModalVisible(true);
            }
          }
        }}
      >
        <View style={styles.proMatchLeft}>
          {specialLabel && <Text style={[styles.bracketLabel, { marginBottom: 8, color: primaryColor, opacity: 0.8 }]}>{specialLabel}</Text>}
          <View style={styles.proMatchTeamRow}>
            <View style={styles.proMatchAvatarGroup}>
              {renderAvatar(t1?.player1Photo || null, t1?.player1Name || match.team1Name || match.teamA?.name)}
              <View style={{marginLeft: -10}}>
                {renderAvatar(t1?.player2Photo || null, t1?.player2Name || '')}
              </View>
            </View>
            <View style={styles.proMatchNames}>
              <Text style={[styles.proMatchNameText, isPlayed && isT1Winner && { color: primaryColor, fontWeight: '900' }]} numberOfLines={1}>{!isPlayed && t1?.player1Id ? (match.playerAvailability?.[t1.player1Id]?.proposed?.length > 0 ? '✅ ' : '⏳ ') : ''}{t1Tag}{t1?.player1Name?.split(' ')[0] || match.team1Name || match.teamA?.name || '?'}</Text>
              {t1?.player2Name && <Text style={[styles.proMatchNameText, isPlayed && isT1Winner && { color: primaryColor, fontWeight: '900' }]} numberOfLines={1}>{!isPlayed && t1?.player2Id ? (match.playerAvailability?.[t1.player2Id]?.proposed?.length > 0 ? '   ✅ ' : '   ⏳ ') : '     '}{t1?.player2Name?.split(' ')[0]}</Text>}
            </View>
          </View>
          
          <View style={styles.proMatchDivider} />

          <View style={styles.proMatchTeamRow}>
            <View style={styles.proMatchAvatarGroup}>
              {renderAvatar(t2?.player1Photo || null, t2?.player1Name || match.team2Name || match.teamB?.name)}
              <View style={{marginLeft: -10}}>
                {renderAvatar(t2?.player2Photo || null, t2?.player2Name || '')}
              </View>
            </View>
            <View style={styles.proMatchNames}>
              <Text style={[styles.proMatchNameText, isPlayed && isT2Winner && { color: primaryColor, fontWeight: '900' }]} numberOfLines={1}>{!isPlayed && t2?.player1Id ? (match.playerAvailability?.[t2.player1Id]?.proposed?.length > 0 ? '✅ ' : '⏳ ') : ''}{t2Tag}{t2?.player1Name?.split(' ')[0] || match.team2Name || match.teamB?.name || '?'}</Text>
              {t2?.player2Name && <Text style={[styles.proMatchNameText, isPlayed && isT2Winner && { color: primaryColor, fontWeight: '900' }]} numberOfLines={1}>{!isPlayed && t2?.player2Id ? (match.playerAvailability?.[t2.player2Id]?.proposed?.length > 0 ? '   ✅ ' : '   ⏳ ') : '     '}{t2?.player2Name?.split(' ')[0]}</Text>}
            </View>
          </View>
        </View>

        <View style={styles.proMatchRight}>
          {match.date ? <Text style={styles.proMatchDate}>{match.date}</Text> : <Text style={styles.proMatchDate}>Semana {match.week || '-'}</Text>}
          {!isPlayed && isDelayed && <Text style={{ color: colors.danger, fontWeight: '900', fontSize: 11, marginTop: 4, textAlign: 'right' }}>(Retrasado)</Text>}
          
          {isPlayed ? (
            <View style={styles.proMatchScoresArea}>
              <View style={styles.proMatchScoreRow}>
                <View style={styles.proMatchTrophyHolder}>{match.winnerId === id1 && <Text style={styles.proMatchTrophy}>🏆</Text>}</View>
                {match.sets?.map((s:any, i:number) => <Text key={i} style={[styles.proMatchScoreText, parseInt(s.team1) > parseInt(s.team2) && styles.proMatchScoreWon]}>{s.team1}</Text>)}
                {!match.sets && match.result && <Text style={styles.proMatchScoreText}>{match.result.split('-')[0]}</Text>}
              </View>
              <View style={styles.proMatchScoreRow}>
                <View style={styles.proMatchTrophyHolder}>{match.winnerId === id2 && <Text style={styles.proMatchTrophy}>🏆</Text>}</View>
                {match.sets?.map((s:any, i:number) => <Text key={i} style={[styles.proMatchScoreText, parseInt(s.team2) > parseInt(s.team1) && styles.proMatchScoreWon]}>{s.team2}</Text>)}
                {!match.sets && match.result && <Text style={styles.proMatchScoreText}>{match.result.split('-')[1]}</Text>}
              </View>
              {user?.role === 'admin' && (
                <TouchableOpacity style={{ marginTop: 6, padding: 4, borderRadius: 6, backgroundColor: colors.danger + '18' }} onPress={(e) => { e.stopPropagation?.(); resetPlayedMatch(match); }}>
                  <Text style={{ color: colors.danger, fontSize: 9, fontWeight: '900', textAlign: 'center' }}>↩️ Resetear</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : match.status === 'scheduled' && myTeam?.id && (id1 === myTeam.id || id2 === myTeam.id) ? (
            <View style={styles.proMatchScoresArea}>
              <Text style={[styles.proMatchPendingText, { color: primaryColor }]}>📅 Agendado</Text>
              <TouchableOpacity 
                style={{ marginTop: 8, padding: 6, borderRadius: 8, backgroundColor: colors.danger + '22', borderWidth: 1, borderColor: colors.danger }}
                onPress={(e) => { e.stopPropagation?.(); resetScheduledMatch(match); }}
              >
                <Text style={{ color: colors.danger, fontSize: 10, fontWeight: '900' }}>Cambiar Horario</Text>
              </TouchableOpacity>
            </View>
          ) : (() => {
               let customText = 'por jugar';
               let pillStyle = {};

               // Proposal indicators per team
               const pa = match.playerAvailability || {};

               if (!isPlayed && myTeam?.id && (id1 === myTeam.id || id2 === myTeam.id)) {
                  let propsCount = 0;
                  if (user?.uid && pa[user.uid]?.proposed) {
                      propsCount = pa[user.uid].proposed.length;
                  }
                  if (propsCount > 0) {
                      customText = `🗓️ ${propsCount} opciones`;
                      pillStyle = { color: primaryColor, backgroundColor: primaryColor + '22', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' as const };
                  }
               }
               
               const isFinal = match.phase === 'bracket' && match.bracketPath?.[0] === 'final';
               return (
                 <View style={styles.proMatchScoresArea}>
                    <Text style={[styles.proMatchPendingText, pillStyle]}>{customText}</Text>
                    {user?.role === 'admin' && isFinal && (
                       <TouchableOpacity style={{ marginTop: 8, padding: 6, borderRadius: 8, backgroundColor: primaryColor + '22', borderWidth: 1, borderColor: primaryColor }} onPress={(e) => { e.stopPropagation(); setSelectedMatch(match); setAdminMatchOptionsVisible(true); }}>
                           <Text style={{ color: primaryColor, fontSize: 10, fontWeight: '900', textAlign: 'center' }}>Fijar Horario</Text>
                       </TouchableOpacity>
                    )}
                 </View>
               );
          })()}
        </View>
      </TouchableOpacity>
    );
  };

  const renderPhase2 = () => {
    const standings = getStandings();
    const schedule = tournament?.schedule || [];
    const sourceSchedule = schedule; // Todos ven todos los partidos

    const playedMatches = sourceSchedule.filter((m: any) => m.status === 'confirmed');
    const pendingMatches = sourceSchedule.filter((m: any) => m.status !== 'confirmed').sort((a: any, b: any) => {
       const myId = myTeam?.id;
       if (!myId) return 0;
       const aMine = a.team1Id === myId || a.team2Id === myId;
       const bMine = b.team1Id === myId || b.team2Id === myId;
       if (aMine && !bMine) return -1;
       if (!aMine && bMine) return 1;
       
       // Secundariamente ordenado por semana
       return (a.week || 0) - (b.week || 0);
    });

    return (
      <View>
        <Text style={styles.phaseTitle}>Fase 2: Clasificación</Text>

        <Text style={styles.sectionLabel}>Tabla de Clasificación</Text>
        {standings.map((team, idx) => (
          <View key={team.id} style={styles.standingRow}>
            <Text style={[styles.standingPos, { color: idx < 8 ? primaryColor : colors.textDim }]}>#{idx + 1}</Text>
            <Text style={styles.standingName}>{team.name}</Text>
            <Text style={styles.standingPts}>{team.pts} pts</Text>
          </View>
        ))}

        {pendingMatches.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Partidos por disputar</Text>
            {pendingMatches.map((match: any, idx: number) => (
              <React.Fragment key={`pend-${idx}`}>
                {renderMatchCard(match, false)}
              </React.Fragment>
            ))}
          </>
        )}

        {playedMatches.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Partidos disputados</Text>
            {playedMatches.map((match: any, idx: number) => (
              <React.Fragment key={`play-${idx}`}>
                {renderMatchCard(match, true)}
              </React.Fragment>
            ))}
          </>
        )}
      </View>
    );
  };

  const renderPhase3 = () => {
    const bracket = tournament?.bracket;
    if (!bracket) return <Text style={{ color: colors.textDim, margin: 20 }}>Generando bracket...</Text>;

    const qf: any[] = (bracket.quarterfinals || []).map((m: any, i: number) => ({ ...m, phase: 'bracket', bracketPath: ['quarterfinals', i] }));
    const sf: any[] = (bracket.semifinals || []).map((m: any, i: number) => ({ ...m, phase: 'bracket', bracketPath: ['semifinals', i] }));
    const fi: any[] = bracket.final?.teamA ? [{ ...bracket.final, phase: 'bracket', bracketPath: ['final'] }] : [];

    const isConfirmed = (m: any) => m.status === 'confirmed' || m.winner || m.winnerId;

    // Auto-generate: Show Semis only once ALL QF with both teams are played
    const allQFReady = qf.length > 0 && qf.every(m => m.teamA && m.teamB && isConfirmed(m));
    const allSFReady = sf.length > 0 && sf.every(m => m.teamA && m.teamB && isConfirmed(m));

    const renderSection = (title: string, matches: any[], emoji: string) => {
      const played = matches.filter(isConfirmed);
      const pending = matches.filter(m => !isConfirmed(m));
      return (
        <View key={title}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 4 }}>
            <Text style={{ fontSize: 18 }}>{emoji}</Text>
            <Text style={styles.phaseTitle}>{title}</Text>
          </View>
          {pending.map((match: any, idx: number) => (
            <React.Fragment key={`pend-${title}-${idx}`}>
              {renderMatchCard(match, false)}
            </React.Fragment>
          ))}
          {played.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Finalizados</Text>
              {played.map((match: any, idx: number) => (
                <React.Fragment key={`play-${title}-${idx}`}>
                  {renderMatchCard(match, true)}
                </React.Fragment>
              ))}
            </>
          )}
          {pending.length === 0 && played.length === 0 && (
            <Text style={[styles.pendingSubtitle, { marginTop: 8, marginBottom: 16 }]}>Pendiente de resultados anteriores...</Text>
          )}
        </View>
      );
    };

    return (
      <View>
        <Text style={[styles.phaseTitle, { fontSize: 26 }]}>Fase 3: Cuadro Final</Text>
        {(allSFReady || fi.length > 0) && renderSection('Gran Final', fi, '🏆')}
        {(allQFReady || sf.length > 0) && renderSection('Semifinales', sf, '🔥')}
        {renderSection('Cuartos de Final', qf, '⚔️')}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Torneo</Text>
        <TouchableOpacity style={styles.infoBtn} onPress={() => setRulesVisible(true)}>
          <Ionicons name="information-circle" size={32} color={primaryColor} />
        </TouchableOpacity>
      </View>

      {/* Admin Controls */}
      {user?.role === 'admin' && (
        <View style={styles.adminPanel}>
          <Text style={styles.adminPanelTitle}>{t('tournament_control')}</Text>
          <View style={styles.adminActions}>
            {tournament?.phase && tournament?.phase !== 'pending' && (
              <TouchableOpacity style={[styles.phaseBtn, { backgroundColor: colors.textDim }]} onPress={goBackPhase}>
                <Ionicons name="arrow-back" size={16} color="#fff" style={{marginRight:4}} />
                <Text style={styles.phaseBtnText}>Retroceder</Text>
              </TouchableOpacity>
            )}
            {tournament?.phase === 'phase1' && (
              <TouchableOpacity style={[styles.phaseBtn, { backgroundColor: primaryColor }]} onPress={() => { setAdminPairingVisible(true); setSelectingPlayer('p1'); }}>
                <Ionicons name="people-outline" size={16} color="#fff" style={{marginRight:4}} />
                <Text style={styles.phaseBtnText}>Crear Pareja</Text>
              </TouchableOpacity>
            )}
            {(!tournament || tournament?.phase === 'pending') && (
              <TouchableOpacity style={[styles.phaseBtn, { backgroundColor: primaryColor }]} onPress={() => setPhase('phase1')}>
                <Text style={styles.phaseBtnText}>{t('start_phase1')}</Text>
              </TouchableOpacity>
            )}
            {tournament?.phase === 'phase1' && (
              <TouchableOpacity style={[styles.phaseBtn, { backgroundColor: primaryColor }]} onPress={() => setPhase('phase2')}>
                <Text style={styles.phaseBtnText}>{t('advance_phase2')}</Text>
              </TouchableOpacity>
            )}
            {tournament?.phase === 'phase2' && (
              <TouchableOpacity style={[styles.phaseBtn, { backgroundColor: primaryColor }]} onPress={() => setPhase('phase3')}>
                <Text style={styles.phaseBtnText}>{t('advance_phase3')}</Text>
              </TouchableOpacity>
            )}
            {tournament?.phase && tournament?.phase !== 'pending' && (
              <TouchableOpacity style={[styles.phaseBtn, { backgroundColor: colors.danger }]} onPress={resetTournament}>
                <Text style={styles.phaseBtnText}>{t('reset_tournament')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
        {loading ? <ActivityIndicator size="large" color={primaryColor} style={{ marginTop: 50 }} /> : renderPhaseContent()}
      </ScrollView>

      {/* --- Custom Confirm Modal --- */}
      <Modal visible={confirmModalConfig.visible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 24, width: '100%', maxWidth: 400 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: colors.text, marginBottom: 12 }}>
              {confirmModalConfig.title}
            </Text>
            <Text style={{ fontSize: 15, color: colors.textDim, marginBottom: 24, lineHeight: 22 }}>
              {confirmModalConfig.message}
            </Text>
            
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity 
                style={[styles.modalBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]} 
                onPress={() => setConfirmModalConfig({ ...confirmModalConfig, visible: false })}
              >
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, { backgroundColor: confirmModalConfig.confirmColor || primaryColor }]} 
                onPress={() => {
                  setConfirmModalConfig({ ...confirmModalConfig, visible: false });
                  confirmModalConfig.onConfirm();
                }}
              >
                <Text style={styles.modalBtnText}>{confirmModalConfig.confirmText}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Start Phase Modal */}
      <Modal visible={startPhaseModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Fecha de Inicio del Torneo</Text>
            <Text style={styles.pendingSubtitle}>Selecciona el día (ej. Lunes) en que comenzará a contar la "Semana 1" para calcular los partidos retrasados.</Text>

            <TouchableOpacity 
              style={{ borderColor: primaryColor, backgroundColor: colors.background, borderWidth: 1, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 }} 
              onPress={() => setShowStartPhasePicker(true)}
            >
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold' }}>
                {startPhaseDate.getDate().toString().padStart(2, '0')}/{(startPhaseDate.getMonth() + 1).toString().padStart(2, '0')}/{startPhaseDate.getFullYear()}
              </Text>
            </TouchableOpacity>

            {showStartPhasePicker && (
              <DateTimePicker
                value={startPhaseDate}
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowStartPhasePicker(false);
                  if (selectedDate) setStartPhaseDate(selectedDate);
                }}
              />
            )}

            <View style={[styles.modalActions, { marginTop: 30 }]}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.background }]} onPress={() => setStartPhaseModalVisible(false)}>
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: primaryColor }]} onPress={startPhase2}>
                <Text style={styles.modalBtnText}>Arrancar Fase 2</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Admin Manual Pairing Modal */}
      <Modal visible={adminPairingVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { minHeight: '60%' }]}>
            <Text style={styles.modalTitle}>Crear Pareja Manual</Text>
            
            <View style={styles.adminPairSelected}>
              <View style={styles.playerPickBox}>
                <Text style={styles.playerPickLabel}>Jugador 1</Text>
                <Text style={[styles.playerPickName, !p1 && {color: colors.textDim}]}>{p1?.nombreApellidos || 'Seleccionar...'}</Text>
              </View>
              <Ionicons name="link" size={24} color={primaryColor} />
              <View style={styles.playerPickBox}>
                <Text style={styles.playerPickLabel}>Jugador 2</Text>
                <Text style={[styles.playerPickName, !p2 && {color: colors.textDim}]}>{p2?.nombreApellidos || 'Seleccionar...'}</Text>
              </View>
            </View>

            <View style={styles.pickStepRow}>
              <TouchableOpacity 
                style={[styles.pickStepBtn, selectingPlayer === 'p1' && { backgroundColor: primaryColor }]}
                onPress={() => setSelectingPlayer('p1')}
              >
                <Text style={[styles.pickStepText, selectingPlayer === 'p1' && {color: '#fff'}]}>Seleccionando P1</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.pickStepBtn, selectingPlayer === 'p2' && { backgroundColor: primaryColor }]}
                onPress={() => setSelectingPlayer('p2')}
              >
                <Text style={[styles.pickStepText, selectingPlayer === 'p2' && {color: '#fff'}]}>Seleccionando P2</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={allUsers.filter(u => u.id !== (selectingPlayer === 'p1' ? p2?.id : p1?.id))}
              keyExtractor={u => u.id}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={[styles.partnerRow, (p1?.id === item.id || p2?.id === item.id) && {backgroundColor: colors.background}]} 
                  onPress={() => {
                    if (selectingPlayer === 'p1') { setP1(item); setSelectingPlayer('p2'); }
                    else { setP2(item); }
                  }}
                >
                  <Text style={styles.partnerName}>{item.nombreApellidos}</Text>
                  {(p1?.id === item.id || p2?.id === item.id) && <Ionicons name="checkmark-circle" size={20} color={primaryColor} />}
                </TouchableOpacity>
              )}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.background }]} onPress={() => { setAdminPairingVisible(false); setP1(null); setP2(null); }}>
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, { backgroundColor: primaryColor }, (!p1 || !p2) && { opacity: 0.5 }]} 
                onPress={adminCreatePair} 
                disabled={!p1 || !p2}
              >
                <Text style={styles.modalBtnText}>Confirmar Pareja</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    {/* Nuevo Modal de Calendario de Disponibilidad */}
    <Modal visible={calendarModalVisible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalBox, { minHeight: '85%', maxHeight: '90%' }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Horarios Disp.</Text>
          <Text style={styles.pendingSubtitle}>Toca una franja. Para jugar, todos los jugadores deben coincidir. ✅ = Propuesto, 🚫 = Vetado, ❌ = Imposible (rivales)</Text>

          {/* Toggle Partner */}
          {myTeam?.player2Id && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 12, backgroundColor: colors.surface, padding: 12, borderRadius: 12 }}>
              <Switch value={includePartner} onValueChange={setIncludePartner} trackColor={{ true: primaryColor, false: colors.border }} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: 'bold' }}>Marcar para los dos</Text>
                <Text style={{ color: colors.textDim, fontSize: 12 }}>Guarda la misma disponibilidad a tu pareja, sobreescribiendo si ya tenía.</Text>
              </View>
            </View>
          )}

          {(() => {
            const pa = selectedMatch?.playerAvailability || {};
            const oppProps = new Set<string>();
            const oppVets = new Set<string>();
            const partnerId = myTeam?.player1Id === user?.uid ? myTeam?.player2Id : myTeam?.player1Id;
            const oppTeamId = selectedMatch?.team1Id === myTeam?.id ? selectedMatch?.team2Id : selectedMatch?.team1Id;
            const oppTeam = teams.find((t:any) => t.id === oppTeamId);

            if (oppTeam) {
               [oppTeam.player1Id, oppTeam.player2Id].forEach(id => {
                 if (pa[id]) {
                   if (pa[id].proposed) pa[id].proposed.forEach((s:string) => oppProps.add(s));
                   if (pa[id].vetoed) pa[id].vetoed.forEach((s:string) => oppVets.add(s));
                 }
               });
            }

            const partnerProps = pa[partnerId]?.proposed || [];
            const partnerVets = pa[partnerId]?.vetoed || [];

            const DAYS_ES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
            const next14 = Array.from({ length: 14 }).map((_, i) => {
              const d = new Date(); d.setDate(d.getDate() + i); d.setHours(0,0,0,0); return d;
            });
            const validDates = next14.filter(d => availableSlots.some(s => s.day === DAYS_ES[d.getDay()]));

            const dd = (d: Date) => `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;

            const checkTimeOverlap = (d1: string, t1: string, d2: string, t2: string) => {
              // Validamos días independientemente del /YYYY, ya que los partidos normales se guardan como DD/MM
              const d1Base = d1.substring(0, 5);
              const d2Base = d2.length > 5 ? d2.substring(0, 5) : d2;
              if (d1Base !== d2Base) return false;
              
              const parseTime = (st: string) => { const [h, m] = st.split(':').map(Number); return h * 60 + m; };
              const min1 = parseTime(t1);
              const min2 = parseTime(t2);
              return Math.max(min1, min2) < Math.min(min1 + 90, min2 + 90);
            };

            const isSlotBlocked = (dateStr: string, timeStr: string) => {
              // Verificamos "matches" globales de todo el club (1h30min padding)
              for (const gm of globalMatches) {
                if (checkTimeOverlap(dateStr, timeStr, gm.fecha, gm.hora)) return true;
              }
              // Verificamos cruces de la fase 2 confirmados/agendados
              for (const tm of (tournament?.schedule || [])) {
                if ((tm.status === 'scheduled' || tm.status === 'confirmed') && tm.date) {
                  const [mD, mT] = tm.date.split(' ');
                  if (checkTimeOverlap(dateStr, timeStr, mD, mT)) return true;
                }
              }
              // Verificamos el cuadro final (fase 3)
              if (tournament?.bracket) {
                const checkLayer = (layer: any[]) => {
                  for (const match of (layer || [])) {
                    if ((match.status === 'scheduled' || match.status === 'confirmed') && match.date) {
                      const [mD, mT] = match.date.split(' ');
                      if (checkTimeOverlap(dateStr, timeStr, mD, mT)) return true;
                    }
                  }
                };
                checkLayer(tournament.bracket.quarterfinals);
                checkLayer(tournament.bracket.semifinals);
                if (tournament.bracket.final) checkLayer([tournament.bracket.final]);
              }
              return false;
            };

            return (
              <ScrollView style={{ flex: 1, width: '100%' }}>
                {validDates.map((d, dIdx) => {
                  const dateStr = dd(d);
                  const dayName = DAYS_ES[d.getDay()];
                  const slotsForDate = availableSlots.filter(s => s.day === dayName);

                  return (
                    <View key={dateStr} style={{ marginBottom: 20 }}>
                      <Text style={[styles.sectionLabel, { color: primaryColor }]}>{dayName} {dateStr.substring(0, 5)}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                        {slotsForDate.map(slot => {
                          const str = `${dateStr} ${slot.start}`;
                          
                          let bg = colors.surface;
                          let border = colors.border;
                          let icon = '';
                          let textColor = colors.text;

                          const isBlocked = isSlotBlocked(dateStr, slot.start);
                          
                          if (isBlocked) {
                             bg = '#f5f5f5'; border = '#dddddd'; icon = '🔒'; textColor = '#aaaaaa';
                          } else if (myProposedSlots.includes(str)) {
                             bg = primaryColor + '22'; border = primaryColor; icon = '✅'; textColor = primaryColor;
                          } else if (myVetoedSlots.includes(str)) {
                             bg = colors.danger + '22'; border = colors.danger; icon = '🚫'; textColor = colors.danger;
                          } else if (oppVets.has(str)) {
                             bg = colors.background; border = colors.border; icon = '❌'; textColor = colors.textDim;
                          } else if (partnerProps.includes(str) && !includePartner) {
                             bg = primaryColor + '08'; border = primaryColor + '44'; icon = '🧑‍🤝‍🧑';
                          }

                          return (
                            <TouchableOpacity
                              key={slot.id}
                              style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: border, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}
                              onPress={() => {
                                 if (isBlocked) {
                                   Alert.alert('Horario Ocupado', 'Este horario ya está ocupado por otro partido del torneo o una reserva global a esa misma hora (o que se solapa).');
                                   return;
                                 }
                                 if (oppVets.has(str)) {
                                   Alert.alert('Imposible', 'Los rivales han vetado este horario por lo que no es posible jugar. Elige otro.');
                                   return;
                                 }
                                 setSlotActionVisible({ visible: true, dateStr: str });
                              }}
                            >
                              <Text style={{ color: textColor, fontWeight: '500' }}>{slot.start} {icon}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            );
          })()}

          <View style={[styles.modalActions, { marginTop: 16 }]}>
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.background }]} onPress={() => setCalendarModalVisible(false)}>
              <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modalBtn, { backgroundColor: primaryColor }]}
              onPress={submitProposals}
              disabled={submittingProposals}
            >
              {submittingProposals ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>Guardar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* Custom Slot Action Modal for Universal Support (Web & Native) */}
    <Modal visible={slotActionVisible.visible} transparent animationType="fade">
      <View style={[styles.modalOverlay, { justifyContent: 'center' }]}>
        <View style={[styles.modalBox, { marginHorizontal: 30, padding: 24, minHeight: 0 }]}>
          <Text style={[styles.modalTitle, { fontSize: 18, marginBottom: 8 }]}>{slotActionVisible.dateStr}</Text>
          <Text style={{ color: colors.textDim, marginBottom: 24 }}>¿Qué quieres marcar para este horario?</Text>
          
          <View style={{ gap: 12 }}>
            {user?.role === 'admin' && (
              <TouchableOpacity 
                style={{ backgroundColor: primaryColor, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: primaryColor, alignItems: 'center', marginBottom: 8 }}
                onPress={() => forceAdminSchedule(slotActionVisible.dateStr)}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Fijar Horario Oficial (Admin) 🏆</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={{ backgroundColor: primaryColor + '22', paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: primaryColor, alignItems: 'center' }}
              onPress={() => {
                const s = slotActionVisible.dateStr;
                setMyProposedSlots(p => [...p.filter(x => x !== s), s]);
                setMyVetoedSlots(v => v.filter(x => x !== s));
                setSlotActionVisible({ visible: false, dateStr: '' });
              }}>
              <Text style={{ color: primaryColor, fontWeight: 'bold' }}>Añadir a Propuestos ✅</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={{ backgroundColor: colors.danger + '22', paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.danger, alignItems: 'center' }}
              onPress={() => {
                const s = slotActionVisible.dateStr;
                setMyVetoedSlots(v => [...v.filter(x => x !== s), s]);
                setMyProposedSlots(p => p.filter(x => x !== s));
                setSlotActionVisible({ visible: false, dateStr: '' });
              }}>
              <Text style={{ color: colors.danger, fontWeight: 'bold' }}>Marcar como Vetado 🚫</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={{ paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
              onPress={() => {
                const s = slotActionVisible.dateStr;
                setMyProposedSlots(p => p.filter(x => x !== s));
                setMyVetoedSlots(v => v.filter(x => x !== s));
                setSlotActionVisible({ visible: false, dateStr: '' });
              }}>
              <Text style={{ color: colors.textDim, fontWeight: '600' }}>Limpiar Casilla ✕</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={{ paddingVertical: 14, alignItems: 'center', marginTop: 8 }}
              onPress={() => setSlotActionVisible({ visible: false, dateStr: '' })}>
              <Text style={{ color: colors.textDim, fontWeight: 'bold' }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

      {/* Admin Edit Team Modal */}
      <Modal visible={editTeamModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { minHeight: '75%' }]}>
            {/* Handle */}
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Editar Pareja</Text>

            {/* Name */}
            <Text style={styles.editSectionLabel}>Nombre del equipo</Text>
            <TextInput
              style={styles.modalInput}
              value={editTeamName}
              onChangeText={setEditTeamName}
              placeholder="Nombre del equipo"
              placeholderTextColor={colors.textDim}
            />

            {/* Player selector tabs */}
            <Text style={styles.editSectionLabel}>Jugadores</Text>
            <View style={styles.pickStepRow}>
              <TouchableOpacity
                style={[styles.pickStepBtn, selectingPlayer === 'p1' && { backgroundColor: primaryColor, borderColor: primaryColor }]}
                onPress={() => setSelectingPlayer('p1')}
              >
                <Text style={[styles.pickStepText, selectingPlayer === 'p1' && { color: '#fff' }]} numberOfLines={1}>
                  {p1?.nombreApellidos?.split(' ')[0] || 'Jugador 1'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickStepBtn, selectingPlayer === 'p2' && { backgroundColor: primaryColor, borderColor: primaryColor }]}
                onPress={() => setSelectingPlayer('p2')}
              >
                <Text style={[styles.pickStepText, selectingPlayer === 'p2' && { color: '#fff' }]} numberOfLines={1}>
                  {p2?.nombreApellidos?.split(' ')[0] || 'Jugador 2'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* User list */}
            <FlatList
              data={allUsers}
              keyExtractor={u => u.id}
              style={{ maxHeight: 220 }}
              renderItem={({ item }) => {
                const isP1 = p1?.id === item.id;
                const isP2 = p2?.id === item.id;
                const isSelected = isP1 || isP2;
                return (
                  <TouchableOpacity
                    style={[styles.partnerRow, isSelected && { backgroundColor: primaryColor + '18' }]}
                    onPress={() => {
                      if (selectingPlayer === 'p1') { setP1(item); setSelectingPlayer('p2'); }
                      else setP2(item);
                    }}
                  >
                    {item.fotoURL ? (
                      <Image source={{ uri: item.fotoURL }} style={styles.partnerAvatar} />
                    ) : (
                      <View style={[styles.partnerAvatar, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
                        <Text style={{ color: colors.text, fontWeight: '900', fontSize: 16 }}>{item.nombreApellidos?.charAt(0)}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.partnerName, isSelected && { color: primaryColor }]}>{item.nombreApellidos}</Text>
                      {isP1 && <Text style={[styles.playerTagText, { color: primaryColor }]}>Jugador 1</Text>}
                      {isP2 && <Text style={[styles.playerTagText, { color: primaryColor }]}>Jugador 2</Text>}
                    </View>
                    {isSelected && <Ionicons name="checkmark-circle" size={22} color={primaryColor} />}
                  </TouchableOpacity>
                );
              }}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]} onPress={() => { setEditTeamModalVisible(false); setP1(null); setP2(null); }}>
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: primaryColor }]} onPress={updateTeam} disabled={savingTeam}>
                {savingTeam ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalBtnText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename My Team Modal */}
      <Modal visible={renameMyTeamVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Nombre de la Pareja</Text>
            <TextInput
              style={styles.modalInput}
              value={myTeamNewName}
              onChangeText={setMyTeamNewName}
              placeholder="Ej: Los Cañones"
              placeholderTextColor={colors.textDim}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]} onPress={() => setRenameMyTeamVisible(false)}>
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: primaryColor }]} onPress={renameMyTeam}>
                <Text style={styles.modalBtnText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Admin Result Override Modal */}
      <Modal visible={overrideModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { minHeight: '50%' }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Resultado a 3 Sets</Text>
            {selectedMatch && (
              <>
                <Text style={styles.adminOverrideMatchup}>{selectedMatch.team1Name || selectedMatch.teamA?.name} vs {selectedMatch.team2Name || selectedMatch.teamB?.name}</Text>
                
                {/* 3 Sets Input UI */}
                {matchSets.map((s, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12, gap: 16 }}>
                    <Text style={{ width: 50, fontWeight: '900', color: colors.textDim }}>Set {idx + 1}</Text>
                    <TextInput 
                      style={[styles.scoreInput, {flex: 1, textAlign: 'center'}]} 
                      keyboardType="numeric" 
                      value={s.t1} 
                      onChangeText={(val) => {
                        const newSets = [...matchSets];
                        newSets[idx].t1 = val;
                        setMatchSets(newSets);
                        if (val.length > 0) Keyboard.dismiss();
                      }} 
                      placeholder="T1" 
                    />
                    <Text style={{ fontSize: 24, color: colors.textDim }}>-</Text>
                    <TextInput 
                      style={[styles.scoreInput, {flex: 1, textAlign: 'center'}]} 
                      keyboardType="numeric" 
                      value={s.t2} 
                      onChangeText={(val) => {
                        const newSets = [...matchSets];
                        newSets[idx].t2 = val;
                        setMatchSets(newSets);
                        if (val.length > 0) Keyboard.dismiss();
                      }} 
                      placeholder="T2" 
                    />
                  </View>
                ))}

                <View style={[styles.modalActions, { marginTop: 16 }]}>
                  <TouchableOpacity 
                    style={[styles.modalBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]} 
                    onPress={() => { 
                      setMatchSets([{ t1: '', t2: '' }, { t1: '', t2: '' }, { t1: '', t2: '' }]); 
                      setSelectedMatch(null); 
                      setOverrideModalVisible(false); 
                    }}
                  >
                    <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalBtn, { backgroundColor: primaryColor }]} onPress={overrideResult}>
                    <Text style={styles.modalBtnText}>Guardar Resultado</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Admin Match Options Modal */}
      <Modal visible={adminMatchOptionsVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { minHeight: '30%' }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Opciones de Partido</Text>
            <Text style={styles.pendingSubtitle}>
              {myTeam?.id && selectedMatch && (selectedMatch.team1Id === myTeam.id || selectedMatch.team2Id === myTeam.id) 
                ? 'Como administrador estás apuntado en este partido. ¿Qué deseas hacer?' 
                : '¿Qué gestión quieres realizar como administrador?'}
            </Text>
            
            <View style={{ marginTop: 24, width: '100%', gap: 12 }}>
              <TouchableOpacity 
                style={[styles.modalBtn, { backgroundColor: primaryColor, width: '100%', paddingVertical: 14 }]} 
                onPress={() => {
                  setAdminMatchOptionsVisible(false);
                  const pa = selectedMatch?.playerAvailability || {};
                  const teamProposed = new Set<string>();
                  const teamVetoed = new Set<string>();
                  if (myTeam?.player1Id && pa[myTeam.player1Id]) {
                      pa[myTeam.player1Id].proposed?.forEach((s:string) => teamProposed.add(s));
                      pa[myTeam.player1Id].vetoed?.forEach((s:string) => teamVetoed.add(s));
                  }
                  if (myTeam?.player2Id && pa[myTeam.player2Id]) {
                      pa[myTeam.player2Id].proposed?.forEach((s:string) => teamProposed.add(s));
                      pa[myTeam.player2Id].vetoed?.forEach((s:string) => teamVetoed.add(s));
                  }
                  setMyProposedSlots(Array.from(teamProposed));
                  setMyVetoedSlots(Array.from(teamVetoed));
                  setCalendarModalVisible(true);
                }}
              >
                <Text style={[styles.modalBtnText, { color: '#ffffff', fontWeight: 'bold' }]}>
                  {myTeam?.id && selectedMatch && (selectedMatch.team1Id === myTeam.id || selectedMatch.team2Id === myTeam.id) 
                    ? 'Proponer Horarios (Jugador)' 
                    : 'Ver Horarios y Vetos (Lectura)'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, { backgroundColor: colors.danger, width: '100%', paddingVertical: 14 }]} 
                onPress={() => {
                  setAdminMatchOptionsVisible(false);
                  setMatchSets([{ t1: '', t2: '' }, { t1: '', t2: '' }, { t1: '', t2: '' }]);
                  setOverrideModalVisible(true);
                }}
              >
                <Text style={[styles.modalBtnText, { color: '#ffffff', fontWeight: 'bold' }]}>Escribir Resultado (Admin)</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={{ marginTop: 20, padding: 10, alignSelf: 'center' }} onPress={() => setAdminMatchOptionsVisible(false)}>
              <Text style={{ color: colors.textDim, fontWeight: 'bold' }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Rules Modal */}
      <Modal visible={rulesVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '90%' }]}>
            <View style={styles.rulesHeader}>
              <Ionicons name="information-circle" size={28} color={primaryColor} />
              <Text style={styles.rulesTitle}>Reglamento del Torneo</Text>
            </View>
            <ScrollView>
              {RULES.map((rule, i) => (
                <View key={i} style={styles.ruleCard}>
                  <Text style={styles.ruleEmoji}>{rule.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ruleTitle}>{rule.title}</Text>
                    <Text style={styles.ruleText}>{rule.text}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.closeModalBtn, { backgroundColor: primaryColor }]} onPress={() => setRulesVisible(false)}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors, primaryColor: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingBottom: 8 },
  headerTitle: { fontSize: 32, fontWeight: '900', color: colors.text },
  infoBtn: { padding: 4 },

  adminPanel: { backgroundColor: colors.surface, margin: 16, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  adminPanelTitle: { fontSize: 12, fontWeight: '900', color: colors.textDim, textTransform: 'uppercase', marginBottom: 12, letterSpacing: 1 },
  adminActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  phaseBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center' },
  phaseBtnText: { color: '#fff', fontWeight: '900', fontSize: 13 },

  pendingWrap: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  pendingEmoji: { fontSize: 64, marginBottom: 20 },
  pendingTitle: { fontSize: 28, fontWeight: '900', color: colors.text, marginBottom: 12 },
  pendingSubtitle: { fontSize: 15, color: colors.textDim, textAlign: 'center', lineHeight: 22 },

  phaseTitle: { fontSize: 22, fontWeight: '900', color: colors.text, marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '900', color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginTop: 8 },

  inviteCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 2 },
  inviteText: { color: colors.textDim, fontSize: 15, marginBottom: 12 },
  inviteActions: { flexDirection: 'row', gap: 10 },
  inviteBtn: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  inviteBtnText: { color: '#fff', fontWeight: '900' },

  myTeamCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 2 },
  myTeamLabel: { fontSize: 11, fontWeight: '900', color: colors.textDim, textTransform: 'uppercase' },
  myTeamName: { fontSize: 18, fontWeight: '900', color: colors.text, marginVertical: 4 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  joinBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, padding: 18, marginBottom: 20 },
  joinBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 },

  teamRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  teamNumber: { fontSize: 16, fontWeight: '900', width: 32 },
  teamAvatarGroup: { flexDirection: 'row', marginRight: 12 },
  teamAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.background },
  teamAvatarPlaceholder: { backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  teamName: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },

  standingRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  standingPos: { fontSize: 14, fontWeight: '900', width: 32 },
  standingName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  standingPts: { fontSize: 14, fontWeight: '900', color: colors.text, marginRight: 12 },
  standingWins: { fontSize: 13, color: colors.textDim, fontWeight: '700' },

  scheduleCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  scheduleMatchup: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 },
  scheduleWeek: { fontSize: 12, color: colors.textDim },
  scheduleStatus: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },

  bracketMatch: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  bracketLabel: { fontSize: 11, fontWeight: '900', color: colors.textDim, textTransform: 'uppercase', marginBottom: 8 },
  bracketTeamRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bracketTeam: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  bracketVs: { fontWeight: '900', color: colors.textDim },
  bracketWinner: { marginTop: 8, fontWeight: '900', fontSize: 14 },

  // --- Pro Match Card UI ---
  proMatchCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  proMatchLeft: {
    flex: 1.3,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingRight: 12,
  },
  proMatchTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  proMatchDivider: {
    height: 1,
    backgroundColor: colors.border,
    width: '80%',
    marginVertical: 8,
  },
  proMatchAvatarGroup: {
    flexDirection: 'row',
    marginRight: 12,
    alignItems: 'center',
  },
  proMatchAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.background,
  },
  proMatchAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  proMatchNames: {
    flex: 1,
  },
  proMatchNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  proMatchRight: {
    flex: 1,
    paddingLeft: 12,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  proMatchDate: {
    fontSize: 12,
    color: colors.textDim,
    marginBottom: 12,
    fontWeight: '600',
  },
  proMatchScoresArea: {
    alignItems: 'flex-end',
    width: '100%',
  },
  proMatchScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 32,
    marginVertical: 4,
  },
  proMatchTrophyHolder: {
    width: 24,
    alignItems: 'center',
    marginRight: 8,
  },
  proMatchTrophy: {
    fontSize: 16,
  },
  proMatchScoreText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#9CA3AF',
    width: 28,
    textAlign: 'center',
    marginLeft: 8,
  },
  proMatchScoreWon: {
    color: colors.text,
  },
  proMatchPendingText: {
    fontSize: 14,
    color: colors.textDim,
    fontStyle: 'italic',
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: colors.text, marginBottom: 16 },
  modalInput: { backgroundColor: colors.background, color: colors.text, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, fontSize: 15, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  editSectionLabel: { fontSize: 11, fontWeight: '900', color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  playerTagText: { fontSize: 11, fontWeight: '700', marginTop: 2 },

  partnerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  partnerAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 14 },
  partnerName: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },

  closeModalBtn: { padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 16 },

  rulesHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  rulesTitle: { fontSize: 22, fontWeight: '900', color: colors.text },
  ruleCard: { flexDirection: 'row', gap: 12, marginBottom: 16, backgroundColor: colors.background, borderRadius: 14, padding: 14 },
  ruleEmoji: { fontSize: 24 },
  ruleTitle: { fontSize: 15, fontWeight: '900', color: colors.text, marginBottom: 4 },
  ruleText: { fontSize: 13, color: colors.textDim, lineHeight: 20 },

  // Admin select styles
  adminPairSelected: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', padding: 20, backgroundColor: colors.background, borderRadius: 16, marginBottom: 20 },
  playerPickBox: { alignItems: 'center', width: '40%' },
  playerPickLabel: { fontSize: 10, fontWeight: '900', color: colors.textDim, textTransform: 'uppercase', marginBottom: 4 },
  playerPickName: { fontSize: 13, fontWeight: '700', color: colors.text, textAlign: 'center' },
  pickStepRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  pickStepBtn: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  pickStepText: { fontSize: 12, fontWeight: '700', color: colors.textDim },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  modalBtnText: { color: '#fff', fontWeight: '900' },

  // Override styles
  adminOverrideMatchup: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 20 },
  scoreRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 24 },
  scoreInputGroup: { alignItems: 'center' },
  scoreLabel: { fontSize: 11, fontWeight: '900', color: colors.textDim, textTransform: 'uppercase', marginBottom: 6 },
  scoreInput: { backgroundColor: colors.background, width: 60, height: 60, borderRadius: 12, textAlign: 'center', fontSize: 24, fontWeight: '900', color: colors.text, borderWidth: 1, borderColor: colors.border },
  scheduleResult: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  scheduleDate: { fontSize: 12, fontWeight: '900', marginTop: 4 },
  orderBadge: { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
});
