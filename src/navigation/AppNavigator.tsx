import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';

// Main Screens
import MatchesScreen from '../screens/app/MatchesScreen';
import MatchDetailScreen from '../screens/app/MatchDetailScreen';
import SettingsScreen from '../screens/app/SettingsScreen';
import TournamentScreen from '../screens/app/TournamentScreen';
import UsersListScreen from '../screens/admin/UsersListScreen';
import GroupsScreen from '../screens/admin/GroupsScreen';
import CreateEditMatchScreen from '../screens/admin/CreateEditMatchScreen';
import CreateEditGroupScreen from '../screens/admin/CreateEditGroupScreen';
import GroupDetailScreen from '../screens/admin/GroupDetailScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
  </Stack.Navigator>
);

const HomeTabs = () => {
  const { user } = useAuth();
  const { primaryColor, colors } = useTheme();
  
  return (
    <Tab.Navigator
       screenOptions={({ route }) => ({
         headerShown: false,
         tabBarStyle: { 
           backgroundColor: colors.surface, 
           borderTopWidth: 1,
           borderTopColor: colors.border,
           elevation: 0,
           shadowOpacity: 0
         },
         tabBarActiveTintColor: primaryColor,
         tabBarInactiveTintColor: colors.textDim,
         tabBarIcon: ({ focused, color, size }) => {
           let iconName: any = 'tennisball';

           if (route.name === 'Partidos') {
             iconName = focused ? 'tennisball' : 'tennisball-outline';
           } else if (route.name === 'Torneo') {
             iconName = focused ? 'trophy' : 'trophy-outline';
           } else if (route.name === 'Usuarios') {
             iconName = focused ? 'people' : 'people-outline';
           } else if (route.name === 'Grupos') {
             iconName = focused ? 'file-tray-stacked' : 'file-tray-stacked-outline';
           } else if (route.name === 'Ajustes') {
             iconName = focused ? 'settings' : 'settings-outline';
           }

           return <Ionicons name={iconName} size={size} color={color} />;
         },
       })}
    >
      <Tab.Screen name="Partidos" component={MatchesScreen} />
      <Tab.Screen name="Torneo" component={TournamentScreen} />
      {user?.role === 'admin' && (
         <>
           <Tab.Screen name="Usuarios" component={UsersListScreen} />
           <Tab.Screen name="Grupos" component={GroupsScreen} />
         </>
      )}
      <Tab.Screen name="Ajustes" component={SettingsScreen} />
    </Tab.Navigator>
  );
};

export const AppNavigator = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <Stack.Screen name="Auth" component={AuthStack} />
      ) : (
        <>
          <Stack.Screen name="HomeTabs" component={HomeTabs} />
          <Stack.Screen name="MatchDetail" component={MatchDetailScreen} />
          <Stack.Screen name="CreateEditMatch" component={CreateEditMatchScreen} />
          <Stack.Screen name="CreateEditGroup" component={CreateEditGroupScreen} />
          <Stack.Screen name="GroupDetail" component={GroupDetailScreen} />
        </>
      )}
    </Stack.Navigator>
  );
};
