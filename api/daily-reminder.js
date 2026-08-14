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
  // Verify the request is authorized
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const type = req.body?.type || 'morning';

  // Get all due tasks
  const { data: tasks } = await supabase.from('tasks').select('*').eq('active', true);
  if (!tasks) return res.status(500).json({ error: 'Failed to load tasks' });

  // Find due tasks
  const now = Date.now();
  const dueTasks = tasks.filter(t => {
    if (!t.last_completed) return true;
    const elapsed = Math.floor((now - new Date(t.last_completed)) / 86400000);
    return elapsed >= t.frequency_days;
  });

  // Get all push subscriptions
  const { data: subs } = await supabase.from('push_subscriptions').select('*');
  if (!subs || subs.length === 0) return res.status(200).json({ sent: 0, reason: 'no subscriptions' });

  // Build message based on time of day
  const dueCount = dueTasks.length;
  const topTasks = dueTasks
    .sort((a, b) => (b.priority === 'high' ? 1 : 0) - (a.priority === 'high' ? 1 : 0))
    .slice(0, 3)
    .map(t => t.name);

  let title, body;
  if (type === 'morning') {
    title = 'Good morning! \u2600\uFE0F';
    body = dueCount === 0
      ? 'Nothing due today. Enjoy your day!'
      : `${dueCount} tasks on your plate: ${topTasks.join(', ')}`;
  } else if (type === 'afternoon') {
    title = 'Afternoon check-in \u{1F44B}';
    body = dueCount === 0
      ? 'All clear! Nothing due.'
      : `${dueCount} task${dueCount > 1 ? 's' : ''} still need attention today`;
  } else {
    title = 'Evening wrap-up \u{1F31F}';
    body = dueCount === 0
      ? 'Everything done. Nice work today!'
      : `${dueCount} task${dueCount > 1 ? 's' : ''} still on the list. Quick win before bed?`;
  }

  const payload = JSON.stringify({ title, body });

  const results = await Promise.allSettled(
    subs.map(sub => webpush.sendNotification(JSON.parse(sub.subscription), payload))
  );

  // Clean up expired subscriptions
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected' && results[i].reason?.statusCode === 410) {
      await supabase.from('push_subscriptions').delete().eq('id', subs[i].id);
    }
  }

  return res.status(200).json({ sent: results.filter(r => r.status === 'fulfilled').length, type });
}
