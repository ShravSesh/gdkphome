import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ktqrfgrfksfsoepiclnt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0cXJmZ3Jma3Nmc29lcGljbG50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2OTM0NTQsImV4cCI6MjEwMjI2OTQ1NH0.F1xgcqISyHue_RIm08pg-IkVmuGNhQz6wblUzsw2v7I'
);

webpush.setVapidDetails(
  'mailto:homebase@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { completedBy, taskName } = req.body;
  if (!completedBy || !taskName) return res.status(400).json({ error: 'Missing fields' });

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .neq('user_name', completedBy);

  const payload = JSON.stringify({
    title: 'Home Base',
    body: `${completedBy} finished ${taskName} \u2713`,
  });

  const results = await Promise.allSettled(
    (subs || []).map(sub =>
      webpush.sendNotification(JSON.parse(sub.subscription), payload)
    )
  );

  // Remove expired subscriptions
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected' && results[i].reason?.statusCode === 410) {
      await supabase.from('push_subscriptions').delete().eq('id', subs[i].id);
    }
  }

  return res.status(200).json({ sent: results.filter(r => r.status === 'fulfilled').length });
}
