import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyD-QROuJVLdkF6g4mxdbB4a8KsF0oyNxMY",
  authDomain: "studio-3178011448-9d904.firebaseapp.com",
  projectId: "studio-3178011448-9d904",
  storageBucket: "studio-3178011448-9d904.firebasestorage.app",
  messagingSenderId: "687039821493",
  appId: "1:687039821493:web:62effc866af43ea803b0fc"
};

let app: any, auth: any, db: any, storage: any;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  
  // Evitar error en Web donde getReactNativePersistence no existe
  if (Platform.OS === 'web') {
    auth = getAuth(app);
  } else {
    const firebaseAuth = require('firebase/auth');
    auth = initializeAuth(app, {
      persistence: firebaseAuth.getReactNativePersistence(AsyncStorage)
    });
  }
} else {
  app = getApp();
  auth = getAuth(app);
}

db = getFirestore(app);
storage = getStorage(app);

export { app, auth, db, storage };
