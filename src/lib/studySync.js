import { supabase } from './supabase.js';
import {
  cacheBravoWallet,
  finishStudySessionSync,
  getCachedBravoWallet,
  getStudyDocument,
  listStudyDocumentsForSync,
  listPendingStudySessions,
} from './studyStore.js';

function metadataFor(document, userId) {
  return {
    id: document.id,
    user_id: userId,
    title: document.title,
    file_name: document.file_name,
    file_type: document.file_type,
    size_bytes: document.size_bytes,
    last_opened_at: document.last_opened_at,
    created_at: document.created_at,
    updated_at: document.updated_at,
    deleted_at: document.deleted_at,
  };
}

export async function syncStudyDocument(document, userId) {
  if (!supabase || !userId) return { status: 'unavailable' };
  if (!navigator.onLine) return { status: 'offline' };
  if (!['pdf', 'ppt', 'pptx'].includes(document.file_type)) {
    return { status: 'local_only' };
  }

  const { error } = await supabase
    .from('study_documents_metadata')
    .upsert(metadataFor(document, userId), { onConflict: 'id' });

  if (error) throw error;
  return { status: 'synced' };
}

export async function syncStudyDocuments(userId) {
  if (!supabase || !userId) return { status: 'unavailable', synced: 0 };
  if (!navigator.onLine) return { status: 'offline', synced: 0 };
  const documents = await listStudyDocumentsForSync(userId);
  const metadata = documents.map((document) => metadataFor(document, userId));
  for (let start = 0; start < metadata.length; start += 100) {
    const { error } = await supabase
      .from('study_documents_metadata')
      .upsert(metadata.slice(start, start + 100), { onConflict: 'id' });
    if (error) throw error;
  }
  return { status: 'synced', synced: metadata.length };
}

export async function syncPendingStudySessions(userId) {
  if (!supabase || !userId) return { status: 'unavailable', synced: 0 };
  if (!navigator.onLine) return { status: 'offline', synced: 0 };

  const pending = await listPendingStudySessions(userId);
  if (!pending.length) return { status: 'current', synced: 0, awarded: 0 };

  const documentIds = [...new Set(pending.map((session) => session.document_id))];
  const documents = await Promise.all(documentIds.map((id) => getStudyDocument(id, userId)));
  const metadata = documents
    .filter((document) => document && ['pdf', 'ppt', 'pptx'].includes(document.file_type))
    .map((document) => metadataFor(document, userId));

  const syncableDocumentIds = new Set(metadata.map((document) => document.id));
  const syncablePending = pending.filter((session) => syncableDocumentIds.has(session.document_id));
  if (!syncablePending.length) {
    return { status: 'current', synced: 0, awarded: 0 };
  }

  if (metadata.length !== new Set(syncablePending.map((session) => session.document_id)).size) {
    throw new Error('A local material is missing. Its study session was kept on this device.');
  }

  const { error: metadataError } = await supabase
    .from('study_documents_metadata')
    .upsert(metadata, { onConflict: 'id' });

  if (metadataError) throw metadataError;

  let totalSynced = 0;
  let totalAwarded = 0;

  for (let start = 0; start < syncablePending.length; start += 25) {
    const batch = syncablePending.slice(start, start + 25);
    const payload = batch.map((session) => ({
      id: session.id,
      document_id: session.document_id,
      started_at: session.started_at,
      ended_at: session.ended_at,
      active_seconds: session.active_seconds,
      interaction_count: session.interaction_count,
      pages_viewed: session.pages_viewed,
    }));

    const { data, error } = await supabase.rpc('sync_study_sessions', {
      p_sessions: payload,
    });

    if (error) throw error;

    const acceptedIds = data?.accepted_session_ids || [];
    const flaggedIds = data?.flagged_session_ids || [];
    await finishStudySessionSync(acceptedIds, flaggedIds);
    totalSynced += acceptedIds.length + flaggedIds.length;
    totalAwarded += Number(data?.awarded_bravos || 0);
  }

  return {
    status: 'synced',
    synced: totalSynced,
    awarded: totalAwarded,
  };
}

export async function loadBravoWallet(userId) {
  if (!supabase) throw new Error('Connect Supabase to load your Bravo wallet.');
  try {
    const { data, error } = await supabase.rpc('get_bravo_wallet');
    if (error) throw error;
    if (userId) await cacheBravoWallet(userId, data).catch(() => {});
    return { ...data, is_cached: false };
  } catch (error) {
    if (userId) {
      const cached = await getCachedBravoWallet(userId).catch(() => null);
      if (cached?.wallet) return { ...cached.wallet, is_cached: true, cached_at: cached.cached_at };
    }
    throw error;
  }
}

export async function loadStudyActivity(userId) {
  if (!supabase) throw new Error('Connect Supabase to load study activity.');
  const recentStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [sessionsResult, daysResult] = await Promise.all([
    supabase
      .from('study_sessions')
      .select('active_seconds, started_at, validation_status')
      .eq('user_id', userId)
      .eq('validation_status', 'accepted')
      .gte('started_at', recentStart)
      .order('started_at', { ascending: false })
      .limit(250),
    supabase
      .from('daily_streak_registry')
      .select('study_date, active_seconds, qualifying')
      .eq('user_id', userId)
      .order('study_date', { ascending: false })
      .limit(35),
  ]);

  if (sessionsResult.error) throw sessionsResult.error;
  if (daysResult.error) throw daysResult.error;

  return {
    sessions: sessionsResult.data || [],
    days: daysResult.data || [],
  };
}
