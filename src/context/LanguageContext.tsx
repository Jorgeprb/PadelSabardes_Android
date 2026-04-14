import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Language = 'es' | 'gl';

const translations = {
  es: {
    // Navigation
    nav_matches: 'Partidos', nav_tournament: 'Torneo', nav_users: 'Usuarios',
    nav_groups: 'Grupos', nav_settings: 'Ajustes',
    // Matches
    your_matches: 'Tus Partidos', no_matches: 'No tienes partidos programados ni invitaciones.',
    confirmed_participants: 'Participantes Confirmados', no_participants: 'Aún no hay inscritos',
    free_spots: 'Plazas Libres', joined: 'Apuntado',
    match_full: 'El partido ya está completo', party_status_open: 'abierto',
    create_match: 'Crear Partido', save_changes: 'Guardar Cambios',
    date: 'FECHA', time: 'HORA', players: 'Jugadores',
    invitations: 'Invitaciones', everyone_global: 'Todos (Global)',
    fast_groups: 'Grupos Rápidos', individuals: 'Individuales',
    assign_player: 'Asignar Jugador', cancel: 'Cancelar',
    success: 'Éxito', error: 'Error', match_created: 'Partido Creado',
    match_updated: 'Partido Actualizado', court_busy: 'Pista Ocupada ⏱️',
    court_busy_msg: 'No se puede crear el partido. La pista dispone de bloques de 1h 30min y ya existe una reserva que se solapa con este horario. Prueba con otro horario.',
    no_groups: 'No has creado grupos aún.',
    // Match Detail
    join: 'Unirse', leave: 'Salir', location: 'Ubicación',
    delete_match: 'Borrar Partido', edit_match: 'Editar',
    delete_match_confirm: '¿Borrar Partido?', delete_match_msg: 'Esta acción no se puede deshacer y las plazas volarán.',
    delete: 'Borrar', kick_player: '¿Expulsar a', kick_msg: 'Tendrá que volver a unirse manualmente.',
    kick: 'Expulsar',
    // Settings
    settings: 'Ajustes', appearance: 'Apariencia', dark_mode: 'Modo Oscuro',
    calendar_view: 'Vista Calendario', main_color: 'Color Principal',
    font_size: 'Tamaño de Letra', font_small: 'A', font_normal: 'A', font_large: 'A',
    profile: 'Mi Perfil', full_name: 'Nombre y Apellidos', email: 'Email',
    save_profile: 'Guardar Perfil', change_password: 'Cambiar Contraseña',
    current_password: 'Contraseña actual', new_password: 'Nueva contraseña',
    confirm_password: 'Confirmar nueva contraseña', update_password: 'Actualizar',
    passwords_no_match: 'Las contraseñas no coinciden',
    language: 'Idioma',
    admin_options: 'Admin — Torneos', auto_approve: 'Aprobación Automática',
    auto_approve_desc: 'Acepta solicitudes de pista de torneo sin revisión manual',
    open_match_creation: 'Cualquiera Puede Crear Partidos',
    open_match_creation_desc: 'Permite que todos los usuarios creen nuevos partidos',
    master_password: 'Contraseña Maestra',
    change_master_password: 'Cambiar Contraseña Maestra',
    new_master_password: 'Nueva contraseña maestra',
    admin_mode: 'Modo Admin', enter: 'Entrar',
    notifications: 'Notificaciones',
    notif_push: 'Notificaciones Push',
    notif_retry_perms: 'Reintentar Permisos',
    notif_invitations: 'Invitaciones a partidos',
    notif_joins: 'Cuando alguien se apunta',
    notif_leaves: 'Cuando alguien se desapunta',
    notif_changes: 'Cambios de fecha / horario',
    notif_cancellations: 'Cancelaciones',
    logout: 'Cerrar Sesión',
    // Groups
    groups: 'Grupos', no_groups_yet: 'No hay grupos creados.',
    members: 'miembros', group_name: 'Nombre del grupo',
    group_participants: 'Participantes', remove_member: 'Eliminar',
    save_group: 'Guardar Grupo', delete_group: 'Eliminar Grupo',
    delete_group_confirm: '¿Eliminar Grupo?', delete_group_msg: 'Se eliminará el grupo permanentemente.',
    // Tournament
    tournament: 'Torneo', coming_soon: 'En breves...',
    coming_soon_desc: 'El próximo torneo de Pádel Sabardes se anunciará próximamente. ¡Mantente atento!',
    phase1: 'Fase 1: Formación de Parejas', phase2: 'Fase 2: Clasificación',
    phase3: 'Fase 3: Cuadro Final', confirmed_pairs: 'Parejas Confirmadas',
    find_partner: 'Buscar Pareja', my_pair: 'Mi Pareja',
    invite_pending: 'Pendiente de aceptación...', pair_confirmed: 'Confirmada ✓',
    accept: 'Aceptar', decline: 'Rechazar', choose_partner: 'Elegir Compañero',
    start_phase1: 'Iniciar Fase 1', advance_phase2: 'Avanzar a Fase 2',
    advance_phase3: 'Avanzar a Fase 3', reset_tournament: 'Resetear Torneo',
    tournament_control: 'Panel de Control — Admin',
    standings: 'Tabla de Clasificación', my_matches: 'Mis Partidos',
    week: 'Semana', played: 'Jugado', scheduled: 'Previsto', pending: 'Por jugar',
    quarterfinals: 'Cuartos de Final', semifinals: 'Semifinales', final: 'Final',
    pending_results: 'Pendiente de resultados...',
    // Rules
    rules_title: 'Reglamento del Torneo', understood: 'Entendido',
    rule_1_title: 'Fase 1 — Formación de Parejas',
    rule_1_text: 'Cada jugador busca y solicita partner. El otro debe aceptar la invitación. Una vez formada la pareja, no se puede cambiar de fase sin aprobación del admin.',
    rule_2_title: 'Fase 2 — Clasificación (Round Robin)',
    rule_2_text: 'La app genera automáticamente el calendario: todas las parejas juegan contra todas. Cada semana hay un enfrentamiento obligatorio. La pareja solicita el día y hora; los admins aprueban la reserva de pista (o lo hacen automáticamente si está activado en Ajustes). El rival debe confirmar el resultado para que sea oficial.',
    rule_3_title: 'Fase 3 — Cuadro Final',
    rule_3_text: 'Las 8 mejores parejas de la clasificación pasan a las eliminatorias: Cuartos de Final → Semifinal → Final. Si hay empate en puntos, se juega un partido de desempate antes de avanzar.',
    rule_4_title: '⚡ Resultados',
    rule_4_text: 'El equipo ganador sube el marcador (ej. 6-2, 4-6, 7-5). El equipo perdedor debe confirmar el resultado. Hasta que ambas partes estén de acuerdo, el resultado queda como "pendiente de validación".',
    rule_5_title: '🏆 Sistema de Puntos',
    rule_5_text: 'Victoria: 1 punto | Derrota: 0 puntos. En caso de empate en puntos, se usará el "average" de sets ganados/perdidos como desempate.',
    // Scheduling & Slots
    manage_tournament_slots: 'Gestionar Horarios Torneo',
    add_slot: 'Añadir Franja',
    day_l: 'Lunes', day_m: 'Martes', day_x: 'Miércoles', day_j: 'Jueves', day_v: 'Viernes', day_s: 'Sábado', day_d: 'Domingo',
    propose_slots: 'Proponer Horarios',
    select_5_slots: 'Seleccionad 5 franjas (prioridad 1 a 5)',
    overlap_found: '¡Coincidencia encontrada!',
    match_scheduled: 'Partido programado para el',
    no_overlap: 'Esperando propuesta del rival...',
    confirm_manual_override: 'Confirmar resultado manual',
    // Users
    registered_users: 'Usuarios Registrados',
    delete_user_confirm: '¿Borrar Usuario?',
    delete_user_msg: 'Se eliminará permanentemente de todos los partidos, equipos y la base de datos.',
    delete_all: 'Borrar Todo',
  },
  gl: {
    // Navigation
    nav_matches: 'Partidos', nav_tournament: 'Torneo', nav_users: 'Usuarios',
    nav_groups: 'Grupos', nav_settings: 'Axustes',
    // Matches
    your_matches: 'Os Teus Partidos', no_matches: 'Non tes partidos programados nin invitacións.',
    confirmed_participants: 'Participantes Confirmados', no_participants: 'Aínda non hai inscritos',
    free_spots: 'Prazas Libres', joined: 'Apuntado',
    match_full: 'O partido xa está completo', party_status_open: 'aberto',
    create_match: 'Crear Partido', save_changes: 'Gardar Cambios',
    date: 'DATA', time: 'HORA', players: 'Xogadores',
    invitations: 'Invitacións', everyone_global: 'Todos (Global)',
    fast_groups: 'Grupos Rápidos', individuals: 'Individuais',
    assign_player: 'Asignar Xogador', cancel: 'Cancelar',
    success: 'Éxito', error: 'Erro', match_created: 'Partido Creado',
    match_updated: 'Partido Actualizado', court_busy: 'Pista Ocupada ⏱️',
    court_busy_msg: 'Non se pode crear o partido. A pista dispón de bloques de 1h 30min e xa existe unha reserva que se solapa con este horario. Proba con outro horario.',
    no_groups: 'Aínda non creaches grupos.',
    // Match Detail
    join: 'Unirse', leave: 'Saír', location: 'Localización',
    delete_match: 'Borrar Partido', edit_match: 'Editar',
    delete_match_confirm: '¿Borrar Partido?', delete_match_msg: 'Esta acción non se pode desfacer e as prazas desaparecerán.',
    delete: 'Borrar', kick_player: '¿Expulsar a', kick_msg: 'Terá que volver a unirse manualmente.',
    kick: 'Expulsar',
    // Settings
    settings: 'Axustes', appearance: 'Aparencia', dark_mode: 'Modo Escuro',
    calendar_view: 'Vista Calendario', main_color: 'Cor Principal',
    font_size: 'Tamaño de Letra', font_small: 'A', font_normal: 'A', font_large: 'A',
    profile: 'O Meu Perfil', full_name: 'Nome e Apelidos', email: 'Correo',
    save_profile: 'Gardar Perfil', change_password: 'Cambiar Contrasinal',
    current_password: 'Contrasinal actual', new_password: 'Novo contrasinal',
    confirm_password: 'Confirmar novo contrasinal', update_password: 'Actualizar',
    passwords_no_match: 'Os contrasinais non coinciden',
    language: 'Idioma',
    admin_options: 'Admin — Torneos', auto_approve: 'Aprobación Automática',
    auto_approve_desc: 'Acepta solicitudes de pista de torneo sen revisión manual',
    open_match_creation: 'Calquera Pode Crear Partidos',
    open_match_creation_desc: 'Permite que todos os usuarios creen novos partidos',
    master_password: 'Contrasinal Mestra',
    change_master_password: 'Cambiar Contrasinal Mestra',
    new_master_password: 'Nova contrasinal mestra',
    admin_mode: 'Modo Admin', enter: 'Entrar',
    notifications: 'Notificacións',
    notif_push: 'Notificacións Push',
    notif_retry_perms: 'Reintentar Permisos',
    notif_invitations: 'Invitacións a partidos',
    notif_joins: 'Cando alguén se apunta',
    notif_leaves: 'Cando alguén se desapunta',
    notif_changes: 'Cambios de data / horario',
    notif_cancellations: 'Cancelacións',
    logout: 'Pechar Sesión',
    // Groups
    groups: 'Grupos', no_groups_yet: 'Non hai grupos creados.',
    members: 'membros', group_name: 'Nome do grupo',
    group_participants: 'Participantes', remove_member: 'Eliminar',
    save_group: 'Gardar Grupo', delete_group: 'Eliminar Grupo',
    delete_group_confirm: '¿Eliminar Grupo?', delete_group_msg: 'Eliminarase o grupo permanentemente.',
    // Tournament
    tournament: 'Torneo', coming_soon: 'En breves...',
    coming_soon_desc: 'O próximo torneo do Pádel Sabardes anunciarase proximamente. ¡Mantente atento!',
    phase1: 'Fase 1: Formación de Parellas', phase2: 'Fase 2: Clasificación',
    phase3: 'Fase 3: Cadro Final', confirmed_pairs: 'Parellas Confirmadas',
    find_partner: 'Buscar Parella', my_pair: 'A Miña Parella',
    invite_pending: 'Pendente de aceptación...', pair_confirmed: 'Confirmada ✓',
    accept: 'Aceptar', decline: 'Rexeitar', choose_partner: 'Escoller Compañeiro',
    start_phase1: 'Iniciar Fase 1', advance_phase2: 'Avanzar á Fase 2',
    advance_phase3: 'Avanzar á Fase 3', reset_tournament: 'Resetear Torneo',
    tournament_control: 'Panel de Control — Admin',
    standings: 'Táboa de Clasificación', my_matches: 'Os Meus Partidos',
    week: 'Semana', played: 'Xogado', scheduled: 'Previsto', pending: 'Por xogar',
    quarterfinals: 'Cuartos de Final', semifinals: 'Semifinais', final: 'Final',
    pending_results: 'Pendente de resultados...',
    // Rules
    rules_title: 'Regulamento do Torneo', understood: 'Entendido',
    rule_1_title: 'Fase 1 — Formación de Parellas',
    rule_1_text: 'Cada xogador busca e solicita partner. O outro debe aceptar a invitación. Unha vez formada a parella, non se pode cambiar de fase sen aprobación do admin.',
    rule_2_title: 'Fase 2 — Clasificación (Round Robin)',
    rule_2_text: 'A app xera automaticamente o calendario: todas as parellas xogan contra todas. Cada semana hai un enfrontamento obrigatorio. A parella solicita o día e hora; os admins aproban a reserva de pista (ou o fan automaticamente se está activado en Axustes). O rival debe confirmar o resultado para que sexa oficial.',
    rule_3_title: 'Fase 3 — Cadro Final',
    rule_3_text: 'As 8 mellores parellas da clasificación pasan ás eliminatorias: Cuartos de Final → Semifinal → Final. Se hai empate en puntos, xógase un partido de desempate antes de avanzar.',
    rule_4_title: '⚡ Resultados',
    rule_4_text: 'O equipo gañador sube o marcador (ex. 6-2, 4-6, 7-5). O equipo perdedor debe confirmar o resultado. Ata que ambas partes estean de acordo, o resultado queda como "pendente de validación".',
    rule_5_title: '🏆 Sistema de Puntos',
    rule_5_text: 'Vitoria: 1 punto | Derrota: 0 puntos. En caso de empate en puntos, usarase o "average" de sets gañados/perdidos como desempate.',
    // Scheduling & Slots
    manage_tournament_slots: 'Xestionar Horarios Torneo',
    add_slot: 'Engadir Franxa',
    day_l: 'Luns', day_m: 'Martes', day_x: 'Mércores', day_j: 'Xoves', day_v: 'Venres', day_s: 'Sábado', day_d: 'Domingo',
    propose_slots: 'Propoñer Horarios',
    select_5_slots: 'Seleccionade 5 franxas (prioridade 1 a 5)',
    overlap_found: '¡Coincidencia atopada!',
    match_scheduled: 'Partido programado para o',
    no_overlap: 'Agardando proposta do rival...',
    confirm_manual_override: 'Confirmar resultado manual',
    // Users
    registered_users: 'Usuarios Rexistrados',
    delete_user_confirm: '¿Borrar Usuario?',
    delete_user_msg: 'Eliminarase permanentemente de todos os partidos, equipos e a base de datos.',
    delete_all: 'Borrar Todo',
  }
};

type TranslationKey = keyof typeof translations.es;

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextType>({
  language: 'es',
  setLanguage: () => {},
  t: (key) => key,
});

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [language, setLanguageState] = useState<Language>('es');

  useEffect(() => {
    AsyncStorage.getItem('appLanguage').then(saved => {
      if (saved === 'es' || saved === 'gl') setLanguageState(saved);
    });
  }, []);

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    await AsyncStorage.setItem('appLanguage', lang);
  };

  const t = (key: TranslationKey): string => {
    return translations[language][key] || translations.es[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => useContext(LanguageContext);
