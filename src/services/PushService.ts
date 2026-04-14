import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { db } from './firebaseConfig';

export type NotifCategory = 'invitations' | 'joins' | 'leaves' | 'changes' | 'cancellations' | 'always';

export const sendCategorizedPushNotification = async (
  uids: string[],
  title: string,
  body: string,
  category: NotifCategory
) => {
  if (!uids || uids.length === 0) return;

  try {
    // Fetch user docs from Firestore to get current pushTokens and notifPrefs
    const tokenDocs = await Promise.all(uids.map(uid => getDoc(doc(db, 'users', uid))));
    
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
      .map((u: any) => ({
        to: u.pushToken,
        sound: 'default',
        title: title,
        body: body,
        data: { source: 'padelsabardes', category },
      }));

    if (messages.length === 0) return;

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    console.error('[PushService] Error sending categorize notifications:', e);
  }
};
