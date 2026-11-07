const DATABASE_NAME = 'bravo-study-room';
const DATABASE_VERSION = 2;
const DOCUMENTS_STORE = 'documents';
const SESSIONS_STORE = 'sessions';
const WALLETS_STORE = 'wallets';

let databasePromise;

function openDatabase() {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('This browser does not support local study storage.'));
  }

  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DOCUMENTS_STORE)) {
          const documents = database.createObjectStore(DOCUMENTS_STORE, { keyPath: 'id' });
          documents.createIndex('created_at', 'created_at');
          documents.createIndex('deleted_at', 'deleted_at');
        }

        if (!database.objectStoreNames.contains(SESSIONS_STORE)) {
          const sessions = database.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
          sessions.createIndex('user_id', 'user_id');
          sessions.createIndex('sync_status', 'sync_status');
          sessions.createIndex('started_at', 'started_at');
        }

        if (!database.objectStoreNames.contains(WALLETS_STORE)) {
          database.createObjectStore(WALLETS_STORE, { keyPath: 'user_id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open local study storage.'));
      request.onblocked = () => reject(new Error('Close other BRAVO tabs to update local study storage.'));
    }).catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }

  return databasePromise;
}

function waitForTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('Local study storage could not be updated.'));
    transaction.onerror = () => reject(transaction.error || new Error('Local study storage could not be updated.'));
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not read local study storage.'));
  });
}

async function readAll(storeName) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readonly');
  const records = await requestValue(transaction.objectStore(storeName).getAll());
  await waitForTransaction(transaction);
  return records;
}

export async function listStudyDocuments(userId) {
  const records = await readAll(DOCUMENTS_STORE);
  return records
    .filter((record) => record.owner_id === userId && !record.deleted_at)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
}

export async function listStudyDocumentsForSync(userId) {
  if (!userId) return [];
  const records = await readAll(DOCUMENTS_STORE);
  return records
    .filter((record) => record.owner_id === userId)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

export async function getStudyDocument(id, userId) {
  const database = await openDatabase();
  const transaction = database.transaction(DOCUMENTS_STORE, 'readonly');
  const record = await requestValue(transaction.objectStore(DOCUMENTS_STORE).get(id));
  await waitForTransaction(transaction);
  return record?.owner_id === userId ? record : null;
}

export async function saveStudyDocument(file, userId) {
  if (!userId) throw new Error('Sign in before adding study materials.');
  const fileName = file.name || 'Untitled material';
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (!['pdf', 'ppt', 'pptx'].includes(extension)) {
    throw new Error('Choose a PDF, PPT, or PPTX file.');
  }

  const record = {
    id: crypto.randomUUID(),
    owner_id: userId,
    title: fileName.replace(/\.(pdf|pptx?)$/i, ''),
    file_name: fileName,
    file_type: extension,
    size_bytes: file.size,
    blob: file,
    progress_page: 1,
    page_count: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_opened_at: null,
    deleted_at: null,
  };

  const database = await openDatabase();
  const transaction = database.transaction(DOCUMENTS_STORE, 'readwrite');
  transaction.objectStore(DOCUMENTS_STORE).add(record);
  await waitForTransaction(transaction);
  return record;
}

export async function updateStudyDocument(id, changes, userId) {
  const database = await openDatabase();
  const transaction = database.transaction(DOCUMENTS_STORE, 'readwrite');
  const store = transaction.objectStore(DOCUMENTS_STORE);
  const request = store.get(id);
  const updated = await new Promise((resolve, reject) => {
    request.onsuccess = () => {
      if (!request.result || request.result.owner_id !== userId) {
        resolve(null);
        return;
      }
      const record = { ...request.result, ...changes, updated_at: new Date().toISOString() };
      store.put(record);
      resolve(record);
    };
    request.onerror = () => reject(request.error || new Error('Could not update this material.'));
  });
  await waitForTransaction(transaction);
  return updated;
}

export async function deleteStudyDocument(id, userId) {
  return updateStudyDocument(id, {
    blob: null,
    deleted_at: new Date().toISOString(),
  }, userId);
}

export async function saveStudySession(session) {
  const database = await openDatabase();
  const transaction = database.transaction(SESSIONS_STORE, 'readwrite');
  transaction.objectStore(SESSIONS_STORE).put(session);
  await waitForTransaction(transaction);
}

export async function listPendingStudySessions(userId) {
  const records = await readAll(SESSIONS_STORE);
  return records.filter((record) => (
    record.user_id === userId &&
    record.sync_status === 'pending' &&
    Boolean(record.ended_at)
  ));
}

export async function recoverInterruptedStudySessions(userId) {
  if (!userId) return 0;
  const records = await readAll(SESSIONS_STORE);
  const database = await openDatabase();
  const transaction = database.transaction(SESSIONS_STORE, 'readwrite');
  const store = transaction.objectStore(SESSIONS_STORE);
  const recoveryCutoff = Date.now() - 2 * 60 * 1000;
  let recoveredCount = 0;
  records.forEach((record) => {
    if (record.user_id !== userId || record.sync_status !== 'active') return;
    if (record.checkpointed_at && new Date(record.checkpointed_at).getTime() > recoveryCutoff) return;
    const recovered = {
      ...record,
      ended_at: record.checkpointed_at || record.started_at,
      sync_status: 'pending',
    };
    store.put(recovered);
    recoveredCount += 1;
  });
  await waitForTransaction(transaction);
  return recoveredCount;
}

export async function finishStudySessionSync(acceptedIds = [], flaggedIds = []) {
  const completed = new Map([
    ...acceptedIds.map((id) => [id, 'accepted']),
    ...flaggedIds.map((id) => [id, 'flagged']),
  ]);
  if (!completed.size) return;

  const database = await openDatabase();
  const transaction = database.transaction(SESSIONS_STORE, 'readwrite');
  const store = transaction.objectStore(SESSIONS_STORE);
  completed.forEach((serverStatus, id) => {
    const request = store.get(id);
    request.onsuccess = () => {
      if (!request.result) return;
      store.put({
        ...request.result,
        sync_status: 'synced',
        server_status: serverStatus,
        synced_at: new Date().toISOString(),
      });
    };
  });
  await waitForTransaction(transaction);
}

export async function getLocalStudySummary(userId) {
  const [documents, sessions] = await Promise.all([
    listStudyDocuments(userId),
    readAll(SESSIONS_STORE),
  ]);
  const userSessions = sessions.filter((session) => session.user_id === userId);
  const pending = userSessions.filter((session) => session.sync_status === 'pending');

  return {
    document_count: documents.length,
    pending_session_count: pending.length,
    pending_active_seconds: pending.reduce((total, session) => total + (session.active_seconds || 0), 0),
    recent_sessions: userSessions
      .sort((left, right) => right.started_at.localeCompare(left.started_at))
      .slice(0, 7),
  };
}

export async function cacheBravoWallet(userId, wallet) {
  const database = await openDatabase();
  const transaction = database.transaction(WALLETS_STORE, 'readwrite');
  transaction.objectStore(WALLETS_STORE).put({
    user_id: userId,
    wallet,
    cached_at: new Date().toISOString(),
  });
  await waitForTransaction(transaction);
}

export async function getCachedBravoWallet(userId) {
  const database = await openDatabase();
  const transaction = database.transaction(WALLETS_STORE, 'readonly');
  const record = await requestValue(transaction.objectStore(WALLETS_STORE).get(userId));
  await waitForTransaction(transaction);
  return record || null;
}
