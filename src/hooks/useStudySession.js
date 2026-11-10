import { useCallback, useEffect, useRef, useState } from 'react';
import { saveStudySession } from '../lib/studyStore.js';
import { syncPendingStudySessions } from '../lib/studySync.js';

const IDLE_LIMIT_MS = 180_000;
const CHECKPOINT_MS = 30_000;

function canCountStudyTime() {
  return document.visibilityState === 'visible' && document.hasFocus();
}

export function useStudySession({ documentId, userId, initialPage = 1, syncEnabled = true }) {
  const sessionRef = useRef(null);
  const lastCheckpointRef = useRef(0);
  const seenPagesRef = useRef(new Set([initialPage]));
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [isCounting, setIsCounting] = useState(false);
  const [saved, setSaved] = useState(false);

  const persistCheckpoint = useCallback(async (finished = false) => {
    const session = sessionRef.current;
    if (!session) return;
    if (finished && session.activeMs < 1000 && session.interactionCount === 0) return;

    const endedAt = finished ? new Date().toISOString() : null;
    const record = {
      id: session.id,
      user_id: userId,
      document_id: documentId,
      started_at: session.startedAt,
      ended_at: endedAt,
      checkpointed_at: new Date().toISOString(),
      active_seconds: Math.floor(session.activeMs / 1000),
      interaction_count: session.interactionCount,
      pages_viewed: session.pagesViewed,
      sync_enabled: syncEnabled,
      sync_status: finished ? (syncEnabled ? 'pending' : 'local_only') : 'active',
      server_status: null,
      synced_at: null,
    };

    try {
      await saveStudySession(record);
      lastCheckpointRef.current = session.activeMs;
      if (!finished) setSaved(true);
      if (finished && syncEnabled && navigator.onLine) {
        syncPendingStudySessions(userId).catch(() => {});
      }
    } catch {
      setSaved(false);
    }
  }, [documentId, syncEnabled, userId]);

  useEffect(() => {
    if (!documentId || !userId) return undefined;

    const now = Date.now();
    sessionRef.current = {
      id: crypto.randomUUID(),
      startedAt: new Date(now).toISOString(),
      activeMs: 0,
      lastTick: now,
      lastInteraction: now,
      interactionCount: 0,
      pagesViewed: 1,
      counting: canCountStudyTime(),
    };
    seenPagesRef.current = new Set([initialPage]);
    lastCheckpointRef.current = 0;
    setActiveSeconds(0);
    setIsCounting(sessionRef.current.counting);
    setSaved(false);

    function accrue(until = Date.now()) {
      const session = sessionRef.current;
      if (!session) return;

      const focusedAndVisible = canCountStudyTime();
      if (session.counting && focusedAndVisible) {
        const idleDeadline = session.lastInteraction + IDLE_LIMIT_MS;
        const activeUntil = Math.min(until, idleDeadline);
        session.activeMs += Math.max(0, activeUntil - session.lastTick);
        session.lastTick = until;
        if (until >= idleDeadline) session.counting = false;
      } else {
        session.lastTick = until;
        if (!focusedAndVisible) session.counting = false;
      }

      setIsCounting(session.counting);
      setActiveSeconds(Math.floor(session.activeMs / 1000));
    }

    function recordActivity() {
      const session = sessionRef.current;
      if (!session) return;

      const nowAt = Date.now();
      accrue(nowAt);
      session.interactionCount += 1;
      session.lastInteraction = nowAt;
      if (canCountStudyTime()) {
        session.counting = true;
        session.lastTick = nowAt;
      }
      setIsCounting(session.counting);
    }

    function handleFocusChange() {
      accrue(Date.now());
      const session = sessionRef.current;
      if (session && !canCountStudyTime()) {
        session.counting = false;
        setIsCounting(false);
        persistCheckpoint();
      }
    }

    const checkpointTimer = window.setInterval(() => {
      accrue(Date.now());
      const session = sessionRef.current;
      if (session && session.activeMs - lastCheckpointRef.current >= CHECKPOINT_MS) {
        persistCheckpoint();
      }
    }, 5000);

    window.addEventListener('pointerdown', recordActivity, { passive: true });
    window.addEventListener('keydown', recordActivity, { passive: true });
    document.addEventListener('scroll', recordActivity, { passive: true, capture: true });
    window.addEventListener('blur', handleFocusChange);
    window.addEventListener('focus', handleFocusChange);
    document.addEventListener('visibilitychange', handleFocusChange);

    return () => {
      window.clearInterval(checkpointTimer);
      window.removeEventListener('pointerdown', recordActivity);
      window.removeEventListener('keydown', recordActivity);
      document.removeEventListener('scroll', recordActivity, true);
      window.removeEventListener('blur', handleFocusChange);
      window.removeEventListener('focus', handleFocusChange);
      document.removeEventListener('visibilitychange', handleFocusChange);
      accrue(Date.now());
      persistCheckpoint(true);
      sessionRef.current = null;
    };
  }, [documentId, userId, persistCheckpoint]);

  const markPageViewed = useCallback((pageNumber) => {
    if (seenPagesRef.current.has(pageNumber)) return;
    seenPagesRef.current.add(pageNumber);
    const session = sessionRef.current;
    if (session) session.pagesViewed = seenPagesRef.current.size;
  }, []);

  return { activeSeconds, isCounting, saved, markPageViewed };
}
