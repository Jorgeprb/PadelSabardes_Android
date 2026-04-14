import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../services/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';

export type UserRole = 'user' | 'admin';

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

// The EAS project ID — must match app.json extra.eas.projectId
const EAS_PROJECT_ID = 'a5193c00-3ce7-40f3-961f-d2548df2a1ca';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export interface AppUser {
  uid: string;
  email: string | null;
  nombreApellidos: string;
  role: UserRole;
  fotoURL?: string;
  pushToken?: string;
  grupos: string[];
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refreshUser: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        
        const unsubscribeSnapshot = onSnapshot(userDocRef, async (docSnapshot) => {
          if (docSnapshot.exists()) {
             const data = docSnapshot.data() as Omit<AppUser, 'uid'>;
             setUser({ uid: firebaseUser.uid, ...data });
             
             if (Device.isDevice) {
               try {
                 const { status: existingStatus } = await Notifications.getPermissionsAsync();
                 let finalStatus = existingStatus;
                 if (existingStatus !== 'granted') {
                   const { status } = await Notifications.requestPermissionsAsync();
                   finalStatus = status;
                 }
                 console.log('[PushToken] Permission status:', finalStatus);
                 if (finalStatus === 'granted') {
                   const tokenResult = await Notifications.getExpoPushTokenAsync({
                     projectId: EAS_PROJECT_ID,
                   });
                   const token = tokenResult.data;
                   console.log('[PushToken] Got token:', token);
                   if (token && data.pushToken !== token) {
                     await setDoc(userDocRef, { pushToken: token }, { merge: true });
                     console.log('[PushToken] Saved to Firestore for uid:', firebaseUser.uid);
                   } else {
                     console.log('[PushToken] Token unchanged, no update needed.');
                   }
                 }
               } catch (e) {
                 console.log('[PushToken] Error getting push token:', e);
               }
             } else {
               console.log('[PushToken] Not a real device, skipping push token.');
             }

             setLoading(false);
          } else {
             // Self-healing: if created via firebase console directly
             try {
               await setDoc(userDocRef, {
                 email: firebaseUser.email || '',
                 nombreApellidos: 'Usuario Externo',
                 role: 'user',
                 grupos: [],
                 fechaCreacion: new Date().toISOString()
               });
             } catch (e) {
               console.error('Error auto-creando perfil de Firestore:', e);
               setUser(null);
               setLoading(false);
             }
          }
        });

        return () => unsubscribeSnapshot();
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const refreshUser = async () => {
     if (user?.uid) {
        const userDocRef = doc(db, 'users', user.uid);
        const docSnapshot = await getDoc(userDocRef);
        if (docSnapshot.exists()) {
             const data = docSnapshot.data() as Omit<AppUser, 'uid'>;
             setUser({ uid: user.uid, ...data });
        }
     }
  };

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
