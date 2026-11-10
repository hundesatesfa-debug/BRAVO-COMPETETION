import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, Check, Clock3, Download, FileText, FolderOpen, HardDrive, Image as ImageIcon,
  Pencil, Presentation, RefreshCw, RotateCcw, Search, Trash2, Upload,
  Wifi, WifiOff, X,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import StudyDocumentViewer from '../components/StudyDocumentViewer.jsx';
import { useStudySession } from '../hooks/useStudySession.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import {
  deleteStudyDocument,
  getLocalStudySummary,
  getStudyStorageStatus,
  listStudyDocuments,
  recoverInterruptedStudySessions,
  saveStudyDocument,
  updateStudyDocument,
} from '../lib/studyStore.js';
import { syncPendingStudySessions, syncStudyDocument, syncStudyDocuments } from '../lib/studySync.js';

const materialExtensions = {
  'application/pdf': 'pdf',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

function formatBytes(bytes) {
  if (!bytes) return '0 bytes';
  const units = ['bytes', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** unitIndex)).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 1) return `${remainder}s`;
  return `${minutes}m ${remainder}s`;
}

function MaterialIcon({ type }) {
  if (type === 'ppt' || type === 'pptx') return <Presentation size={18} />;
  if (['jpg', 'jpeg', 'png', 'webp'].includes(type)) return <ImageIcon size={18} />;
  return <FileText size={18} />;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getCourseMaterialDownloadError(error) {
  const status = Number(error?.statusCode);
  if (status === 401 || status === 403) {
    return 'You do not have permission to access this course file. Sign in again or contact your course administrator.';
  }
  if (status === 404) return 'This course file is no longer available. Ask your course administrator to upload it again.';
  if (!navigator.onLine) return 'The connection was lost before the course file finished downloading. Reconnect and try again.';
  return error?.message || 'This course material could not be downloaded.';
}

export default function StudyRoomPage() {
  const { account } = useAuth();
  const location = useLocation();
  const userId = account?.user.id;
  const isOnline = useOnlineStatus();
  const isLibraryOnly = location.pathname === '/materials';
  const fileInputRef = useRef(null);
  const [documents, setDocuments] = useState([]);
  const [courseMaterials, setCourseMaterials] = useState([]);
  const [courseMaterialsError, setCourseMaterialsError] = useState('');
  const [downloadingMaterial, setDownloadingMaterial] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [resumeDocument, setResumeDocument] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [category, setCategory] = useState('');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingFile, setSavingFile] = useState(false);
  const [error, setError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [summary, setSummary] = useState({ document_count: 0, pending_session_count: 0, pending_active_seconds: 0 });
  const [editingId, setEditingId] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [storageStatus, setStorageStatus] = useState({ persistent: false, usage: null, quota: null, warnings: [] });
  const recoveredUserRef = useRef('');

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) || null;
  const { markPageViewed } = useStudySession({
    documentId: selectedDocument?.id,
    userId,
    initialPage: selectedDocument?.progress_page || 1,
    syncEnabled: !['jpg', 'jpeg', 'png', 'webp'].includes(selectedDocument?.file_type),
  });

  const visibleDocuments = useMemo(() => {
    const searchText = search.trim().toLowerCase();
    return documents.filter((document) => {
      const matchesSearch = !searchText ||
        document.title.toLowerCase().includes(searchText) ||
        document.file_name.toLowerCase().includes(searchText);
      const matchesType = typeFilter === 'all' ||
        (typeFilter === 'image' && ['jpg', 'jpeg', 'png', 'webp'].includes(document.file_type)) ||
        (typeFilter === 'presentation' && ['ppt', 'pptx'].includes(document.file_type)) ||
        document.file_type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [documents, search, typeFilter]);
  const offlineCourseCopies = useMemo(() => (
    new Map(documents
      .filter((document) => document.source_type === 'course' && document.source_material_id)
      .map((document) => [document.source_material_id, document]))
  ), [documents]);

  const refreshDocuments = useCallback(async () => {
    const nextDocuments = await listStudyDocuments(userId);
    setDocuments(nextDocuments);
    setSummary((current) => ({ ...current, document_count: nextDocuments.length }));
    return nextDocuments;
  }, [userId]);

  const refreshSummary = useCallback(async () => {
    if (!userId) return;
    try {
      setSummary(await getLocalStudySummary(userId));
    } catch (summaryError) {
      setError(summaryError.message || 'Local study information could not be loaded.');
    }
  }, [userId]);

  const refreshStorageStatus = useCallback(async (requestPersistence = false) => {
    try {
      setStorageStatus(await getStudyStorageStatus({ requestPersistence }));
    } catch (storageError) {
      setStorageStatus({
        persistent: false,
        usage: null,
        quota: null,
        warnings: [storageError.message || 'Local storage status could not be checked.'],
      });
    }
  }, []);

  useEffect(() => {
    refreshStorageStatus(true);
  }, [refreshStorageStatus]);

  useEffect(() => {
    let active = true;
    async function loadLocalWorkspace() {
      try {
        if (userId && recoveredUserRef.current !== userId) {
          await recoverInterruptedStudySessions(userId);
          recoveredUserRef.current = userId;
        }
        const nextDocuments = userId ? await listStudyDocuments(userId) : [];
        if (userId && navigator.onLine) {
          await syncStudyDocuments(userId).catch(() => null);
          const synced = await syncPendingStudySessions(userId).catch(() => null);
          if (synced?.synced) {
            setSyncMessage(`${synced.synced} study session${synced.synced === 1 ? '' : 's'} synced. ${synced.awarded} Bravos added.`);
          }
        }
        const localSummary = userId ? await getLocalStudySummary(userId) : null;
        if (!active) return;
        setDocuments(nextDocuments);
        if (localSummary) setSummary(localSummary);
      } catch (loadError) {
        if (active) setError(loadError.message || 'Your local materials could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadLocalWorkspace();
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!isOnline || !userId) return;
    syncStudyDocuments(userId)
      .then(() => syncPendingStudySessions(userId))
      .then(async (result) => {
        if (result.synced) {
          setSyncMessage(`${result.synced} study session${result.synced === 1 ? '' : 's'} synced. ${result.awarded} Bravos added.`);
          await refreshSummary();
        }
      })
      .catch(() => setSyncMessage('Study sessions are saved on this device and will retry when sync is available.'));
  }, [isOnline, refreshSummary, userId]);

  useEffect(() => {
    let active = true;
    async function loadCourseMaterials() {
      if (!isOnline || !userId || !supabase) { setCourseMaterials([]); setCourseMaterialsError(''); return; }
      const { data, error: loadError } = await supabase.from('academic_materials')
        .select('id, title, description, object_path, mime_type, size_bytes, courses(code, title)')
        .eq('active', true).order('created_at', { ascending: false }).limit(200);
      if (!active) return;
      setCourseMaterials(data || []);
      setCourseMaterialsError(loadError?.message || '');
    }
    loadCourseMaterials();
    return () => { active = false; };
  }, [isOnline, userId]);

  async function storeFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    setSavingFile(true);
    setError('');
    setSyncMessage('');
    await refreshStorageStatus(true);
    const savedDocuments = [];
    const failures = [];
    try {
      for (const file of files) {
        try {
          savedDocuments.push(await saveStudyDocument(file, userId, {
            category: category.trim() || null,
          }));
        } catch (saveError) {
          failures.push(`${file.name || 'Selected file'}: ${saveError.message || 'could not be saved.'}`);
        }
      }
      const nextDocuments = await refreshDocuments();
      await refreshSummary();
      if (savedDocuments.length === 1) setSelectedDocumentId(savedDocuments[0].id);
      else if (nextDocuments.length && !selectedDocumentId) setSelectedDocumentId(nextDocuments[0].id);
      const addedCount = savedDocuments.filter((document) => !document.duplicate).length;
      const duplicateCount = savedDocuments.length - addedCount;
      if (savedDocuments.length) {
        setSyncMessage([
          addedCount ? `${addedCount} material${addedCount === 1 ? '' : 's'} saved on this device.` : '',
          duplicateCount ? `${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} already saved.` : '',
        ].filter(Boolean).join(' '));
      }
      if (failures.length) setError(failures.join(' '));
    } catch (saveError) {
      setError(`Some files may already have been saved, but the library could not be refreshed: ${saveError.message || 'local storage error'}`);
    } finally {
      setSavingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      refreshStorageStatus();
    }
  }

  async function downloadCourseMaterial(material) {
    if (!isOnline) { setCourseMaterialsError('Connect to the internet to download a course file. Once saved, it is available offline.'); return; }
    setDownloadingMaterial(material.id); setCourseMaterialsError('');
    try {
      const { data, error: downloadError } = await supabase.storage.from('academic-materials').download(material.object_path);
      if (downloadError) {
        setCourseMaterialsError(getCourseMaterialDownloadError(downloadError));
        return;
      }
      if (!data) throw new Error('The stored course file was empty or is no longer available.');
      const extension = materialExtensions[material.mime_type];
      const safeTitle = material.title.replace(/[\\/:*?"<>|]/g, '_');
      if (!extension) {
        const storedName = material.object_path.split('/').pop()?.replace(/[\\/:*?"<>|]/g, '_');
        downloadBlob(data, storedName || safeTitle);
        setSyncMessage(`${material.title} was downloaded. This format is not previewed in BRAVO; open it with a compatible app.`);
        return;
      }
      const storedFileName = material.object_path.split('/').pop()?.replace(/^[0-9a-f-]{36}-/i, '');
      const fileName = storedFileName || `${safeTitle}.${extension}`;
      const stored = await saveStudyDocument(new File([data], fileName, { type: material.mime_type }), userId, {
        source_type: 'course',
        source_material_id: material.id,
        title: material.title,
        category: material.courses?.code || material.courses?.title || 'Course material',
        course: material.courses?.title || null,
      });
      await refreshDocuments();
      await refreshSummary();
      setSelectedDocumentId(stored.id);
      setSyncMessage(stored.duplicate
        ? `${material.title} is already downloaded and ready offline.`
        : `${material.title} is saved on this device and ready offline.`);
    } catch (downloadError) {
      setCourseMaterialsError(getCourseMaterialDownloadError(downloadError));
    } finally { setDownloadingMaterial(''); }
  }

  async function openDocument(document, progressPage = document.progress_page || 1) {
    setError('');
    try {
      const opened = await updateStudyDocument(document.id, {
        last_opened_at: new Date().toISOString(),
        progress_page: progressPage,
      }, userId);
      if (!opened) throw new Error('This material is no longer available in your local library.');
      setDocuments((current) => current.map((item) => item.id === document.id ? opened : item));
      setSelectedDocumentId(document.id);
      setResumeDocument(null);

      if (isOnline) {
        syncStudyDocument(opened, userId)
          .then((result) => {
            if (result.status === 'synced') {
              setSyncMessage('Material metadata synced. The file and reading position stay on this device.');
            }
          })
          .catch((syncError) => setSyncMessage(syncError.message || 'Material metadata could not be synced.'));
      }
    } catch (openError) {
      setError(openError.message || 'This material could not be opened.');
    }
  }

  function requestOpenDocument(document) {
    if ((document.progress_page || 1) > 1) {
      setResumeDocument(document);
      return;
    }
    openDocument(document, 1);
  }

  const onPageChange = useCallback(async (page, pageCount) => {
    markPageViewed(page);
    if (!selectedDocumentId) return;

    const updated = await updateStudyDocument(selectedDocumentId, {
      progress_page: page,
      page_count: pageCount,
    }, userId).catch((progressError) => {
      setError(progressError.message || 'Reading progress could not be saved on this device.');
      return null;
    });
    if (updated) {
      setDocuments((current) => current.map((document) => (
        document.id === selectedDocumentId ? updated : document
      )));
    }
  }, [markPageViewed, selectedDocumentId, setError, userId]);

  async function deleteDocument(document) {
    if (!window.confirm(`Remove “${document.title}” from this device? This does not delete the official material from BRAVO.`)) return;
    try {
      const deleted = await deleteStudyDocument(document.id, userId);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      if (selectedDocumentId === document.id) setSelectedDocumentId('');
      if (isOnline) {
        syncStudyDocument(deleted, userId).catch(() => {});
      }
      await refreshSummary();
    } catch (deleteError) {
      setError(deleteError.message || 'This material could not be removed.');
    }
  }

  async function saveTitle(document) {
    const title = editTitle.trim();
    if (!title || title.length > 160) return;
    const updated = await updateStudyDocument(document.id, { title }, userId).catch((saveError) => {
      setError(saveError.message || 'The material name could not be saved.');
      return null;
    });
    if (updated) {
      setDocuments((current) => current.map((item) => item.id === document.id ? updated : item));
      if (isOnline) syncStudyDocument(updated, userId).catch(() => {});
    }
    setEditingId('');
  }

  async function syncNow() {
    setSyncMessage('Syncing your study sessions…');
    try {
      const result = await syncPendingStudySessions(userId);
      if (result.status === 'offline') {
        setSyncMessage('You’re offline. Sessions will sync when you reconnect.');
        return;
      }
      setSyncMessage(result.synced
        ? `${result.synced} session${result.synced === 1 ? '' : 's'} synced; ${result.awarded} Bravos added.`
        : 'Your study sessions are up to date.');
      await refreshSummary();
    } catch (syncError) {
      setSyncMessage(syncError.message || 'Study sessions remain saved on this device and will retry later.');
    }
  }

  return (
    <section className="study-page">
      <header className="study-page-heading">
        <div>
          <div className="eyebrow"><span className="live-dot" /> STUDY WITH PURPOSE</div>
          <h2>{isLibraryOnly ? 'My Materials' : 'Study Room'}</h2>
          <p>
            {isLibraryOnly
              ? 'Your lecture files are saved on this device and ready when you are.'
              : 'Read your lecture materials locally, even when you are offline.'}
          </p>
        </div>
        <div className={`connection-pill ${isOnline ? 'is-online' : 'is-offline'}`}>
          {isOnline ? <Wifi size={15} /> : <WifiOff size={15} />}
          {isOnline ? 'Online' : 'Offline ready'}
        </div>
      </header>

      <div className="study-info-banner">
        <HardDrive size={18} />
        <p><strong>Document files and reading progress stay in this browser.</strong> Study metadata and eligible session activity may sync to award Bravos; personal file contents are never uploaded. Browser storage can still be removed if site data is cleared.</p>
      </div>

      {error && <div className="study-message study-message-error" role="alert">{error}</div>}
      {syncMessage && <div className="study-message" role="status">{syncMessage}</div>}
      {storageStatus.warnings.map((warning) => (
        <div className="study-message study-storage-warning" role="status" key={warning}>
          <HardDrive size={15} /> {warning}
        </div>
      ))}
      {storageStatus.usage !== null && storageStatus.quota !== null && (
        <div className="study-storage-status" role="status">
          <HardDrive size={14} />
          {formatBytes(storageStatus.usage)} used of {formatBytes(storageStatus.quota)} browser storage
          {storageStatus.persistent ? ' · persistent storage granted' : ' · storage may be cleared by the browser'}
        </div>
      )}

      {selectedDocument && (
        <StudyDocumentViewer
          key={selectedDocument.id}
          document={selectedDocument}
          onPageChange={onPageChange}
          onClose={() => setSelectedDocumentId('')}
        />
      )}

      <div
        className={`study-dropzone ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          storeFiles(event.dataTransfer.files);
        }}
      >
        <span className="study-drop-icon"><Upload size={20} /></span>
        <div>
          <strong>{savingFile ? 'Saving on this device…' : 'Add lecture materials'}</strong>
          <p>Choose or drop PDF, PPT, PPTX, JPG, PNG, or WEBP files (up to 50 MB each). File contents stay on this device.</p>
        </div>
        <input
          className="study-category-input"
          type="text"
          maxLength={80}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          placeholder="Optional category"
          aria-label="Optional material category"
        />
        <button className="button button-primary button-small" type="button" disabled={savingFile} onClick={() => fileInputRef.current?.click()}>
          <Upload size={15} /> Add material
        </button>
        <input
          ref={fileInputRef}
          className="study-file-input"
          type="file"
          multiple
          accept=".pdf,.ppt,.pptx,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png,image/webp"
          onChange={(event) => storeFiles(event.target.files)}
        />
      </div>

      <div className="official-library-heading">
          <div className="study-library-heading">
            <div><div className="eyebrow">OFFICIAL COURSE LIBRARY</div><h3>Course materials</h3></div>
            {!isOnline && <span className="section-note">Connect to browse downloads</span>}
          </div>
          {courseMaterialsError && <div className="study-message study-message-error" role="status">{courseMaterialsError}</div>}
          {isOnline && (courseMaterials.length ? <div className="study-material-grid official-material-grid">{courseMaterials.map((material) => {
            const extension = materialExtensions[material.mime_type];
            const Icon = extension === 'pdf' ? FileText : extension ? Presentation : Download;
            return <article className="study-material-card official-material-card" key={material.id}>
              <div className={`study-material-icon ${extension === 'pdf' ? 'file-pdf' : extension ? 'file-pptx' : ''}`}><Icon size={18} /></div>
              <div className="study-material-copy"><h4 title={material.title}>{material.title}</h4><span>{material.courses?.code || material.courses?.title || 'Course'} · {formatBytes(material.size_bytes)}</span><small>{material.description || 'Official BRAVO course material'}</small></div>
              <div className="study-material-actions">
                {offlineCourseCopies.has(material.id) ? (
                  <>
                    <button className="button button-outline button-small" type="button" onClick={() => requestOpenDocument(offlineCourseCopies.get(material.id))}>
                      <BookOpen size={14} /> Open offline
                    </button>
                    <button className="study-icon-button is-danger" type="button" onClick={() => deleteDocument(offlineCourseCopies.get(material.id))} aria-label={`Remove offline copy of ${material.title}`} title="Remove offline copy">
                      <Trash2 size={15} />
                    </button>
                  </>
                ) : (
                  <button className="button button-outline button-small" type="button" onClick={() => downloadCourseMaterial(material)} disabled={downloadingMaterial === material.id}>
                    {downloadingMaterial === material.id ? 'Downloading…' : extension ? <><Download size={14} /> Download for offline</> : <><Download size={14} /> Download</>}
                  </button>
                )}
              </div>
            </article>;
          })}</div> : <div className="study-empty-state official-library-empty"><span className="study-empty-icon"><BookOpen size={20} /></span><p>Official course files from your academic level and stream will appear here.</p></div>)}
        </div>
        <div className="study-library-heading">
        <div>
            <div className="eyebrow">MY MATERIALS · SAVED ON THIS DEVICE</div>
          <h3>{documents.length} material{documents.length === 1 ? '' : 's'}</h3>
        </div>
          <div className="study-library-filters">
            <label className="study-search">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or filename" />
            </label>
            <label className="study-filter">
              <span className="sr-only">Filter by document type</span>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">All types</option>
                <option value="pdf">PDF</option>
                <option value="image">Images</option>
                <option value="presentation">Presentations</option>
              </select>
            </label>
          </div>
      </div>

      {loading ? (
        <div className="study-empty-state"><span className="loading-inline" /> Loading your local library…</div>
      ) : visibleDocuments.length ? (
        <div className="study-material-grid">
          {visibleDocuments.map((document) => (
            <article className={`study-material-card ${selectedDocumentId === document.id ? 'is-selected' : ''}`} key={document.id}>
              <div className={`study-material-icon file-${document.file_type}`}><MaterialIcon type={document.file_type} /></div>
              <div className="study-material-copy">
                {editingId === document.id ? (
                  <form className="study-rename-form" onSubmit={(event) => { event.preventDefault(); saveTitle(document); }}>
                    <input autoFocus maxLength={160} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} aria-label="Material name" />
                    <button className="study-icon-button" type="submit" aria-label="Save name"><Check size={15} /></button>
                    <button className="study-icon-button" type="button" onClick={() => setEditingId('')} aria-label="Cancel rename"><X size={15} /></button>
                  </form>
                ) : (
                  <h4 title={document.title}>{document.title}</h4>
                )}
                <span>{document.file_type.toUpperCase()} · {formatBytes(document.size_bytes)} · {document.source_type === 'course' ? 'Downloaded for offline' : 'Personal · file stays here'}</span>
                <small>
                  {document.category
                    ? `${document.category} · ${document.page_count
                      ? `page ${document.progress_page} of ${document.page_count}`
                      : document.last_opened_at
                        ? `last opened ${new Date(document.last_opened_at).toLocaleDateString()}`
                        : 'not opened yet'}`
                    : document.page_count
                    ? `Last position: page or slide ${document.progress_page} of ${document.page_count}`
                    : document.last_opened_at
                      ? `Last opened ${new Date(document.last_opened_at).toLocaleDateString()}`
                      : 'Not opened yet'}
                </small>
              </div>
              <div className="study-material-actions">
                <button className="button button-outline button-small" type="button" onClick={() => requestOpenDocument(document)}>
                  <BookOpen size={14} /> {selectedDocumentId === document.id ? 'Continue' : 'Open'}
                </button>
                <button className="study-icon-button" type="button" onClick={() => { setEditTitle(document.title); setEditingId(document.id); }} aria-label={`Rename ${document.title}`}><Pencil size={15} /></button>
                <button className="study-icon-button is-danger" type="button" onClick={() => deleteDocument(document)} aria-label={`Remove ${document.title}`}><Trash2 size={15} /></button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="study-empty-state">
          <span className="study-empty-icon"><FolderOpen size={22} /></span>
          <h3>{search ? 'No matching materials' : 'Your study shelf is ready'}</h3>
          <p>{search ? 'Try another title or file type.' : 'Add a lecture PDF or presentation. It will be stored in your browser so you can keep studying offline.'}</p>
        </div>
      )}

      <div className="study-sync-footer">
        <span><Clock3 size={15} /> {summary.pending_session_count} session{summary.pending_session_count === 1 ? '' : 's'} waiting to sync · {formatDuration(summary.pending_active_seconds)}</span>
        <button className="text-button" type="button" onClick={syncNow} disabled={!isOnline || !summary.pending_session_count}>
          <RefreshCw size={14} /> Sync now
        </button>
      </div>

      {resumeDocument && (
        <div className="study-resume-backdrop">
          <section className="study-resume-dialog" role="dialog" aria-modal="true" aria-labelledby="study-resume-title">
            <button className="study-icon-button study-resume-close" type="button" onClick={() => setResumeDocument(null)} aria-label="Close resume prompt">
              <X size={17} />
            </button>
            <span className="study-resume-icon"><BookOpen size={20} /></span>
            <h3 id="study-resume-title">Continue where you left off?</h3>
            <p>
              <strong>{resumeDocument.title}</strong>
              <br />
              Your last saved position was page {resumeDocument.progress_page}
              {resumeDocument.page_count ? ` of ${resumeDocument.page_count}` : ''}.
            </p>
            <div className="study-resume-actions">
              <button className="button button-outline" type="button" onClick={() => openDocument(resumeDocument, 1)}>
                <RotateCcw size={15} /> Start from beginning
              </button>
              <button className="button button-primary" type="button" onClick={() => openDocument(resumeDocument)}>
                <BookOpen size={15} /> Resume reading
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
