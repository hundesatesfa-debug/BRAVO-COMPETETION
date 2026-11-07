import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, Check, Clock3, FileText, FolderOpen, HardDrive,
  Pause, Pencil, Presentation, RefreshCw, Search, Trash2, Upload,
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
  listStudyDocuments,
  recoverInterruptedStudySessions,
  saveStudyDocument,
  updateStudyDocument,
} from '../lib/studyStore.js';
import { syncPendingStudySessions, syncStudyDocument, syncStudyDocuments } from '../lib/studySync.js';

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
  return <FileText size={18} />;
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
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingFile, setSavingFile] = useState(false);
  const [error, setError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [summary, setSummary] = useState({ document_count: 0, pending_session_count: 0, pending_active_seconds: 0 });
  const [editingId, setEditingId] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const recoveredUserRef = useRef('');

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) || null;
  const { activeSeconds, isCounting, saved, markPageViewed } = useStudySession({
    documentId: selectedDocument?.id,
    userId,
    initialPage: selectedDocument?.progress_page || 1,
  });

  const visibleDocuments = useMemo(() => {
    const searchText = search.trim().toLowerCase();
    if (!searchText) return documents;
    return documents.filter((document) => (
      document.title.toLowerCase().includes(searchText) ||
      document.file_type.includes(searchText)
    ));
  }, [documents, search]);

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
      if (!isOnline || !userId) { setCourseMaterials([]); setCourseMaterialsError(''); return; }
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
    try {
      const savedDocuments = [];
      for (const file of files) savedDocuments.push(await saveStudyDocument(file, userId));
      const nextDocuments = await refreshDocuments();
      await refreshSummary();
      if (savedDocuments.length === 1) setSelectedDocumentId(savedDocuments[0].id);
      else if (nextDocuments.length && !selectedDocumentId) setSelectedDocumentId(nextDocuments[0].id);
    } catch (saveError) {
      setError(saveError.message || 'The material could not be saved in this browser.');
    } finally {
      setSavingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function downloadCourseMaterial(material) {
    if (!isOnline) { setCourseMaterialsError('Connect to the internet to download a course file. Once saved, it is available offline.'); return; }
    setDownloadingMaterial(material.id); setCourseMaterialsError('');
    try {
      const { data, error: downloadError } = await supabase.storage.from('academic-materials').download(material.object_path);
      if (downloadError) throw downloadError;
      const extension = material.mime_type === 'application/pdf' ? 'pdf'
        : material.mime_type === 'application/vnd.ms-powerpoint' ? 'ppt' : 'pptx';
      const fileName = `${material.title.replace(/[\\/:*?"<>|]/g, '_')}.${extension}`;
      const stored = await saveStudyDocument(new File([data], fileName, { type: material.mime_type }), userId);
      await refreshDocuments();
      await refreshSummary();
      setSelectedDocumentId(stored.id);
      setSyncMessage(`${material.title} is saved on this device and ready offline.`);
    } catch (downloadError) {
      setCourseMaterialsError(downloadError.message || 'This course material could not be downloaded.');
    } finally { setDownloadingMaterial(''); }
  }

  async function openDocument(document) {
    setSelectedDocumentId(document.id);
    setError('');
    const opened = await updateStudyDocument(document.id, {
      last_opened_at: new Date().toISOString(),
    }, userId).catch(() => document);
    setDocuments((current) => current.map((item) => item.id === document.id ? opened : item));

    if (isOnline) {
      syncStudyDocument(opened, userId)
        .then(() => setSyncMessage('Material metadata synced. The file and reading position stay on this device.'))
        .catch(() => setSyncMessage('This material is ready offline. Its metadata will sync with your next study session.'));
    }
  }

  const onPageChange = useCallback(async (page, pageCount) => {
    markPageViewed(page);
    if (!selectedDocumentId) return;

    const updated = await updateStudyDocument(selectedDocumentId, {
      progress_page: page,
      page_count: pageCount,
    }, userId).catch(() => null);
    if (updated) {
      setDocuments((current) => current.map((document) => (
        document.id === selectedDocumentId ? updated : document
      )));
    }
  }, [markPageViewed, selectedDocumentId, userId]);

  async function deleteDocument(document) {
    if (!window.confirm(`Remove “${document.title}” from this device?`)) return;
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
        <p><strong>Your files and reading position stay on this device.</strong> BRAVO syncs material names, file types, sizes, open times, and study-session stats to award Bravos.</p>
      </div>

      {error && <div className="study-message study-message-error" role="alert">{error}</div>}
      {syncMessage && <div className="study-message" role="status">{syncMessage}</div>}

      {selectedDocument && (
        <div className="study-active-panel">
          <StudyDocumentViewer document={selectedDocument} onPageChange={onPageChange} />
          <div className="study-session-status">
            <span className={`session-state-dot ${isCounting ? 'is-active' : ''}`} />
            <span>{isCounting ? 'Study time is counting' : 'Study time paused'}</span>
            <strong><Clock3 size={14} /> {formatDuration(activeSeconds)}</strong>
            {!isCounting && <span className="session-pause-hint"><Pause size={13} /> Pauses after 3 minutes idle or when this tab is hidden</span>}
            {saved && <span className="session-saved"><Check size={14} /> Saved locally</span>}
            <button className="button button-quiet button-small" type="button" onClick={syncNow} disabled={!isOnline || !summary.pending_session_count}>
              <RefreshCw size={14} /> Sync sessions
            </button>
          </div>
        </div>
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
          <p>Choose or drop PDF, PPT, and PPTX files. The original files are not uploaded.</p>
        </div>
        <button className="button button-primary button-small" type="button" disabled={savingFile} onClick={() => fileInputRef.current?.click()}>
          <Upload size={15} /> Choose files
        </button>
        <input
          ref={fileInputRef}
          className="study-file-input"
          type="file"
          multiple
          accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
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
            const Icon = material.mime_type === 'application/pdf' ? FileText : Presentation;
            return <article className="study-material-card official-material-card" key={material.id}>
              <div className={`study-material-icon ${material.mime_type === 'application/pdf' ? 'file-pdf' : 'file-pptx'}`}><Icon size={18} /></div>
              <div className="study-material-copy"><h4 title={material.title}>{material.title}</h4><span>{material.courses?.code || material.courses?.title || 'Course'} · {formatBytes(material.size_bytes)}</span><small>{material.description || 'Official BRAVO course material'}</small></div>
              <div className="study-material-actions"><button className="button button-outline button-small" type="button" onClick={() => downloadCourseMaterial(material)} disabled={downloadingMaterial === material.id}><BookOpen size={14} /> {downloadingMaterial === material.id ? 'Saving…' : 'Save offline'}</button></div>
            </article>;
          })}</div> : <div className="study-empty-state official-library-empty"><span className="study-empty-icon"><BookOpen size={20} /></span><p>Official course files from your academic level and stream will appear here.</p></div>)}
        </div>
        <div className="study-library-heading">
        <div>
          <div className="eyebrow">YOUR DEVICE LIBRARY</div>
          <h3>{documents.length} material{documents.length === 1 ? '' : 's'}</h3>
        </div>
        <label className="study-search">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search materials" />
        </label>
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
                <span>{document.file_type.toUpperCase()} · {formatBytes(document.size_bytes)}</span>
                <small>
                  {document.page_count
                    ? `Last position: page or slide ${document.progress_page} of ${document.page_count}`
                    : document.last_opened_at
                      ? `Last opened ${new Date(document.last_opened_at).toLocaleDateString()}`
                      : 'Not opened yet'}
                </small>
              </div>
              <div className="study-material-actions">
                <button className="button button-outline button-small" type="button" onClick={() => openDocument(document)}>
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
    </section>
  );
}
