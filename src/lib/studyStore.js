const DATABASE_NAME = 'bravo-study-room';
const DATABASE_VERSION = 3;
const DOCUMENTS_STORE = 'documents';
const SESSIONS_STORE = 'sessions';
const WALLETS_STORE = 'wallets';
export const MAX_STUDY_FILE_BYTES = 50 * 1024 * 1024;
const SUPPORTED_FILE_TYPES = {
  pdf: 'application/pdf',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

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
        const documents = request.transaction.objectStore(DOCUMENTS_STORE);
        if (!documents.indexNames.contains('owner_id')) documents.createIndex('owner_id', 'owner_id');
        if (!documents.indexNames.contains('dedupe_key')) documents.createIndex('dedupe_key', 'dedupe_key');
        if (!documents.indexNames.contains('owner_source_material')) {
          documents.createIndex('owner_source_material', ['owner_id', 'source_material_id']);
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

      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          databasePromise = undefined;
        };
        resolve(database);
      };
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
    .map(normalizeStudyDocument)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
}

export async function listStudyDocumentsForSync(userId) {
  if (!userId) return [];
  const records = await readAll(DOCUMENTS_STORE);
  return records
    .filter((record) => record.owner_id === userId && ['pdf', 'ppt', 'pptx'].includes(record.file_type))
    .map(normalizeStudyDocument)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

function normalizeStudyDocument(record) {
  return {
    ...record,
    original_filename: record.original_filename || record.file_name,
    added_at: record.added_at || record.created_at,
    last_modified_at: record.last_modified_at || null,
    category: record.category || null,
    source_type: record.source_type || 'personal',
    source_material_id: record.source_material_id || null,
    progress_page: record.progress_page || 1,
  };
}

export async function getStudyDocument(id, userId) {
  const database = await openDatabase();
  const transaction = database.transaction(DOCUMENTS_STORE, 'readonly');
  const record = await requestValue(transaction.objectStore(DOCUMENTS_STORE).get(id));
  await waitForTransaction(transaction);
  return record?.owner_id === userId ? normalizeStudyDocument(record) : null;
}

function randomId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function storageQuotaError(cause) {
  const error = new Error(
    'This file could not be saved because this device has insufficient browser storage. Free up space and try again.',
    { cause },
  );
  error.name = 'QuotaExceededError';
  return error;
}

export async function getStudyStorageStatus({ requestPersistence = false } = {}) {
  const storage = globalThis.navigator?.storage;
  const warnings = [];
  let persistent = false;
  let usage = null;
  let quota = null;

  if (!storage) {
    warnings.push('This browser does not report local storage persistence or quota. Stored files may be removed if site data is cleared.');
    return { supported: false, persistent, usage, quota, warnings };
  }

  if (requestPersistence && typeof storage.persist === 'function') {
    try {
      persistent = await storage.persist();
    } catch (error) {
      warnings.push(`Persistent storage could not be requested: ${error.message || 'browser request failed'}.`);
    }
  } else if (typeof storage.persisted === 'function') {
    try {
      persistent = await storage.persisted();
    } catch (error) {
      warnings.push(`Persistent storage status could not be checked: ${error.message || 'browser request failed'}.`);
    }
  }

  if (!persistent) {
    warnings.push('The browser has not granted persistent storage. It may evict saved files under storage pressure; clearing site data also removes them.');
  }

  if (typeof storage.estimate === 'function') {
    try {
      const estimate = await storage.estimate();
      usage = Number.isFinite(estimate.usage) ? estimate.usage : null;
      quota = Number.isFinite(estimate.quota) ? estimate.quota : null;
    } catch (error) {
      warnings.push(`Available storage could not be checked: ${error.message || 'browser request failed'}.`);
    }
  }

  return { supported: true, persistent, usage, quota, warnings };
}

export async function saveStudyDocument(file, userId, options = {}) {
  if (!userId) throw new Error('Sign in before adding study materials.');
  if (!file || typeof file.size !== 'number' || typeof file.slice !== 'function') {
    throw new Error('Choose a valid document file to save.');
  }
  if (file.size < 1) throw new Error('This file is empty and cannot be saved.');
  if (file.size > MAX_STUDY_FILE_BYTES) {
    throw new Error(`Choose a file smaller than ${Math.round(MAX_STUDY_FILE_BYTES / (1024 * 1024))} MB.`);
  }

  const fileName = file.name || 'Untitled material';
  const extension = fileName.split('.').pop()?.toLowerCase();
  const normalizedExtension = extension === 'jpeg' ? 'jpg' : extension;
  const declaredMimeType = String(file.type || '').toLowerCase();
  const mimeType = ['application/octet-stream', 'binary/octet-stream'].includes(declaredMimeType)
    ? ''
    : declaredMimeType;
  const mimeExtension = Object.keys(SUPPORTED_FILE_TYPES).find((type) => SUPPORTED_FILE_TYPES[type] === mimeType);
  const fileType = ['pdf', 'ppt', 'pptx', 'jpg', 'png', 'webp'].includes(normalizedExtension)
    ? normalizedExtension
    : mimeExtension;

  if (!fileType) {
    throw new Error('Choose a PDF, PPT, PPTX, JPG, PNG, or WEBP file.');
  }
  if (mimeType && mimeType !== SUPPORTED_FILE_TYPES[fileType]) {
    throw new Error('The file extension and file type do not match. Choose a valid document or image.');
  }

  const storageStatus = await getStudyStorageStatus({ requestPersistence: true });
  if (storageStatus.quota !== null && storageStatus.usage !== null) {
    const remaining = Math.max(0, storageStatus.quota - storageStatus.usage);
    if (file.size > remaining) throw storageQuotaError();
  }

  const addedAt = new Date().toISOString();
  const lastModifiedAt = Number.isFinite(file.lastModified) && file.lastModified > 0
    ? new Date(file.lastModified).toISOString()
    : null;
  const sourceType = options.source_type === 'course' ? 'course' : 'personal';
  const sourceMaterialId = options.source_material_id || null;
  const dedupeKey = sourceMaterialId
    ? `${userId}:course:${sourceMaterialId}`
    : `${userId}:personal:${fileName.toLocaleLowerCase()}:${file.size}:${file.lastModified || 0}:${fileType}`;
  const fileStem = fileName.replace(/\.[^.]+$/, '');
  const title = String(options.title || '').trim() || fileStem || fileName;
  const record = {
    id: randomId(),
    owner_id: userId,
    title: title.slice(0, 160),
    file_name: fileName,
    original_filename: fileName,
    file_type: fileType,
    size_bytes: file.size,
    blob: file.slice(0, file.size, SUPPORTED_FILE_TYPES[fileType]),
    progress_page: 1,
    page_count: null,
    category: options.category || null,
    course: options.course || null,
    source_type: sourceType,
    source_material_id: sourceMaterialId,
    dedupe_key: dedupeKey,
    added_at: addedAt,
    last_modified_at: lastModifiedAt,
    created_at: addedAt,
    updated_at: addedAt,
    last_opened_at: null,
    deleted_at: null,
  };

  const database = await openDatabase();
  const transaction = database.transaction(DOCUMENTS_STORE, 'readwrite');
  const completed = waitForTransaction(transaction);
  const store = transaction.objectStore(DOCUMENTS_STORE);
  try {
    const duplicates = await requestValue(store.index('dedupe_key').getAll(dedupeKey));
    const existing = duplicates.find((item) => item.owner_id === userId && !item.deleted_at);
    if (existing) {
      await completed;
      return { ...normalizeStudyDocument(existing), duplicate: true, storage_persistent: storageStatus.persistent };
    }
    await requestValue(store.add(record));
    await completed;
    return { ...normalizeStudyDocument(record), duplicate: false, storage_persistent: storageStatus.persistent };
  } catch (error) {
    try {
      await completed;
    } catch {
      // The original request error is more useful than the transaction abort
      // that follows it.
    }
    if (error?.name === 'QuotaExceededError' || transaction.error?.name === 'QuotaExceededError') {
      throw storageQuotaError(error);
    }
    throw error;
  }
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
    record.sync_enabled !== false &&
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
      sync_status: record.sync_enabled === false ? 'local_only' : 'pending',
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
