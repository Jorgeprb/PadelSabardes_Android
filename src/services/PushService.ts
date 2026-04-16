import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';

export type NotifCategory = 'invitations' | 'joins' | 'leaves' | 'changes' | 'cancellations' | 'always';

const EAS_PROJECT_ID = 'a5193c00-3ce7-40f3-961f-d2548df2a1ca';
const DEFAULT_ANDROID_NOTIFICATION_CHANNEL_ID = 'default';

export interface PushRegistrationResult {
  finalStatus: 'granted' | 'denied' | 'undetermined';
  token: string | null;
  isPhysicalDevice: boolean;
}

const ensureAndroidNotificationChannel = async () => {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(DEFAULT_ANDROID_NOTIFICATION_CHANNEL_ID, {
    name: 'Notificaciones',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#ef4444',
    sound: 'default',
    enableLights: true,
    enableVibrate: true,
    showBadge: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
};

export const registerPushTokenForUser = async (
  uid: string,
  existingToken?: string
): Promise<PushRegistrationResult> => {
  await ensureAndroidNotificationChannel();

  if (!Device.isDevice) {
    console.log('[PushToken] Not a real device, skipping push token.');
    return {
      finalStatus: 'undetermined',
      token: null,
      isPhysicalDevice: false,
    };
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus as PushRegistrationResult['finalStatus'];

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status as PushRegistrationResult['finalStatus'];
  }

  console.log('[PushToken] Permission status:', finalStatus);

  if (finalStatus !== 'granted') {
    return {
      finalStatus,
      token: null,
      isPhysicalDevice: true,
    };
  }

  const tokenResult = await Notifications.getExpoPushTokenAsync({
    projectId: EAS_PROJECT_ID,
  });
  const token = tokenResult.data;

  console.log('[PushToken] Got token:', token);

  if (token && existingToken !== token) {
    await setDoc(doc(db, 'users', uid), { pushToken: token }, { merge: true });
    console.log('[PushToken] Saved to Firestore for uid:', uid);
  } else {
    console.log('[PushToken] Token unchanged, no update needed.');
  }

  return {
    finalStatus,
    token: token || null,
    isPhysicalDevice: true,
  };
};

export const sendCategorizedPushNotification = async (
  uids: string[],
  title: string,
  body: string,
  category: NotifCategory
) => {
  if (!uids || uids.length === 0) return;

  try {
    const uniqueUids = Array.from(new Set(uids));
    const tokenDocs = await Promise.all(uniqueUids.map(uid => getDoc(doc(db, 'users', uid))));
    
    const messages = tokenDocs
      .map(d => d.exists() ? d.data() : null)
      .filter(Boolean)
      .filter((u: any) => {
        // Must have a push token
        if (!u.pushToken) return false;
        
        // Master switch must not be explicitly disabled
        if (u.notifPrefs?.pushEnabled === false) return false;

        // Category switch must not be explicitly disabled
        if (category !== 'always' && u.notifPrefs?.[category] === false) return false;

        return true;
      })
      .filter((u: any) => typeof u.pushToken === 'string' && /Expo(nent)?PushToken\[.+\]/.test(u.pushToken))
      .map((u: any) => ({
        to: u.pushToken,
        channelId: DEFAULT_ANDROID_NOTIFICATION_CHANNEL_ID,
        sound: 'default',
        title: title,
        body: body,
        data: { source: 'padelsabardes', category },
      }));

    if (messages.length === 0) return;

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
      console.error('[PushService] Expo push request failed:', response.status, responseBody);
      return;
    }

    const ticketErrors = Array.isArray(responseBody?.data)
      ? responseBody.data.filter((ticket: any) => ticket?.status === 'error')
      : [];

    if (ticketErrors.length > 0) {
      console.error('[PushService] Expo push ticket errors:', ticketErrors);
    }
  } catch (e) {
    console.error('[PushService] Error sending categorize notifications:', e);
  }
};
