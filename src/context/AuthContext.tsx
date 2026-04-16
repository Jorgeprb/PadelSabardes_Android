import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { auth, db } from '../services/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';

export type UserRole = 'user' | 'admin';

import * as Notifications from 'expo-notifications';
import { registerPushTokenForUser } from '../services/PushService';

Notifications.setNotificationHandler({
  handleNotification: async () =>
    ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    } as any),
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
  const pushRegistrationAttemptedFor = useRef<string | null>(null);

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      unsubscribeSnapshot?.();
      unsubscribeSnapshot = null;

      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        
        unsubscribeSnapshot = onSnapshot(userDocRef, async (docSnapshot) => {
          if (docSnapshot.exists()) {
             const data = docSnapshot.data() as Omit<AppUser, 'uid'>;
             setUser({ uid: firebaseUser.uid, ...data });

             if (pushRegistrationAttemptedFor.current !== firebaseUser.uid) {
               pushRegistrationAttemptedFor.current = firebaseUser.uid;
               registerPushTokenForUser(firebaseUser.uid, data.pushToken).catch((e) => {
                 console.log('[PushToken] Error getting push token:', e);
               });
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
      } else {
        pushRegistrationAttemptedFor.current = null;
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeSnapshot?.();
      unsubscribeAuth();
    };
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
