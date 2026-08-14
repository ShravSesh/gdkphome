import { supabase } from './supabase.js';

const VAPID_PUBLIC = 'BH4B8pNWkxkta7_aWLmU58UYN59ZbSiE4pa8jRsVqxxqdES_ZqfA43ElERxcmQEGl2ifjFTABlNoa3ZkjQbsQJU';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export async function setupNotifications(userName) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }

  // Save to Supabase (upsert by user)
  const subJson = JSON.stringify(subscription);
  
  // Delete old subscriptions for this user
  await supabase.from('push_subscriptions').delete().eq('user_name', userName);
  
  // Insert new
  await supabase.from('push_subscriptions').insert({
    user_name: userName,
    subscription: subJson,
  });

  return 'granted';
}

export async function notifyCompletion(completedBy, taskName) {
  try {
    await fetch('/api/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completedBy, taskName }),
    });
  } catch (e) {
    console.error('Notification send failed:', e);
  }
}

export function getNotificationStatus() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}
