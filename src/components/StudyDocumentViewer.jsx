import { useCallback, useEffect, useRef, useState } from 'react';
import { parse } from '@web-ppt/core';
import { Viewer as PowerPointViewer } from '@web-ppt/viewer-core';
import {
  ChevronLeft, ChevronRight, Download, Minus, Plus, RotateCcw, Search, X,
} from 'lucide-react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

function PdfPage({ pdf, pageNumber, scale, rootRef }) {
  const pageRef = useRef(null);
  const canvasRef = useRef(null);
  const renderedRef = useRef(false);
  const [dimensions, setDimensions] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let visible = false;
    let rendering = false;
    let failed = false;
    let pageProxy = null;
    let renderTask = null;

    async function renderPage() {
      if (!active || !visible || rendering || renderedRef.current) return;
      rendering = true;
      try {
        pageProxy = await pdf.getPage(pageNumber);
        if (!active || !visible) return;

        const viewport = pageProxy.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d', { alpha: false });
        if (!canvas || !context) {
          failed = true;
          setError(`Page ${pageNumber} could not be rendered in this browser.`);
          return;
        }

        setDimensions({ width: viewport.width, height: viewport.height });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

        renderTask = pageProxy.render({ canvasContext: context, viewport });
        await renderTask.promise;
        if (active && visible) renderedRef.current = true;
      } catch (renderError) {
        if (active && renderError?.name !== 'RenderingCancelledException') {
          failed = true;
          setError(renderError?.message || `Page ${pageNumber} could not be rendered.`);
        }
      } finally {
        rendering = false;
        renderTask = null;
        if (active && visible && !renderedRef.current && !failed) requestAnimationFrame(renderPage);
      }
    }

    function handleIntersection(entries) {
      for (const entry of entries) {
        visible = entry.isIntersecting;
        if (visible) {
          renderPage();
        } else {
          renderTask?.cancel();
          renderedRef.current = false;
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
          }
          pageProxy?.cleanup();
          pageProxy = null;
        }
      }
    }

    if (typeof IntersectionObserver === 'undefined') {
      visible = true;
      renderPage();
      return () => {
        active = false;
        renderTask?.cancel();
        renderedRef.current = false;
        pageProxy?.cleanup();
      };
    }

    const observer = new IntersectionObserver(handleIntersection, {
      root: rootRef.current,
      rootMargin: '900px 0px',
      threshold: [0, 0.1, 0.5, 1],
    });
    if (pageRef.current) observer.observe(pageRef.current);

    return () => {
      active = false;
      observer.disconnect();
      renderTask?.cancel();
      renderedRef.current = false;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      pageProxy?.cleanup();
    };
  }, [pageNumber, pdf, rootRef, scale]);

  return (
    <article
      className="study-pdf-page"
      data-page-number={pageNumber}
      ref={pageRef}
      style={{ aspectRatio: dimensions ? `${dimensions.width} / ${dimensions.height}` : '0.773' }}
      aria-label={`Page ${pageNumber}`}
    >
      <canvas ref={canvasRef} aria-label={`PDF page ${pageNumber}`} />
      {error && <span className="study-pdf-page-error">{error}</span>}
    </article>
  );
}

export default function StudyDocumentViewer({ document: studyDocument, onPageChange, onClose }) {
  const stageRef = useRef(null);
  const pdfStageRef = useRef(null);
  const pdfRef = useRef(null);
  const pdfLoadingTaskRef = useRef(null);
  const powerPointRef = useRef(null);
  const powerPointHostRef = useRef(null);
  const visiblePageFrameRef = useRef(0);
  const initialNavigationPendingRef = useRef(false);
  const initialPdfPageRef = useRef(studyDocument.progress_page || 1);
  const searchCursorRef = useRef({ term: '', page: 0 });
  const [pageCount, setPageCount] = useState(studyDocument.page_count || null);
  const [page, setPage] = useState(studyDocument.progress_page || 1);
  const [pageInput, setPageInput] = useState(String(studyDocument.progress_page || 1));
  const [zoom, setZoom] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [imageDimensions, setImageDimensions] = useState(null);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [searching, setSearching] = useState(false);
  const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(studyDocument.file_type);
  const imageFitScale = imageDimensions
    ? Math.min(
      1,
      Math.max(0.1, (viewport.width - 36) / imageDimensions.width),
      Math.max(0.1, (viewport.height - 96) / imageDimensions.height),
    )
    : 1;

  const updateCurrentPage = useCallback(() => {
    if (initialNavigationPendingRef.current || visiblePageFrameRef.current) return;
    visiblePageFrameRef.current = requestAnimationFrame(() => {
      visiblePageFrameRef.current = 0;
      if (initialNavigationPendingRef.current) return;
      const stage = pdfStageRef.current;
      if (!stage) return;
      const stageBounds = stage.getBoundingClientRect();
      const center = stageBounds.top + stage.clientHeight / 2;
      let closestPage = 0;
      let closestDistance = Infinity;
      for (const pageElement of stage.querySelectorAll('[data-page-number]')) {
        const bounds = pageElement.getBoundingClientRect();
        if (bounds.bottom <= stageBounds.top || bounds.top >= stageBounds.bottom) continue;
        const distance = Math.abs((bounds.top + bounds.bottom) / 2 - center);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPage = Number(pageElement.dataset.pageNumber);
        }
      }
      if (closestPage) setPage((current) => (current === closestPage ? current : closestPage));
    });
  }, []);

  useEffect(() => {
    let active = true;
    const extension = studyDocument.file_type;
    setLoading(true);
    setError('');
    setPage(studyDocument.progress_page || 1);
    setPageInput(String(studyDocument.progress_page || 1));
    setPageCount(studyDocument.page_count || null);
    setImageDimensions(null);
    initialNavigationPendingRef.current = false;

    function disposePowerPointViewer() {
      const viewer = powerPointRef.current;
      powerPointRef.current = null;
      if (viewer) {
        viewer.onChange = null;
        if (typeof viewer.destroy === 'function') viewer.destroy();
      }

      const host = powerPointHostRef.current;
      powerPointHostRef.current = null;
      host?.remove();
    }

    async function loadDocument() {
      try {
        if (!studyDocument.blob) {
          throw new Error('This material is no longer stored on this device.');
        }

        if (extension === 'pdf') {
          const bytes = await studyDocument.blob.arrayBuffer();
          if (!active) return;
          const loadingTask = getDocument({
            data: new Uint8Array(bytes),
          });
          pdfLoadingTaskRef.current = loadingTask;
          const pdf = await loadingTask.promise;
          if (!active) return;
          pdfRef.current = pdf;
          setPageCount(pdf.numPages);
          const firstPdfPage = await pdf.getPage(1);
          const baseWidth = firstPdfPage.getViewport({ scale: 1 }).width;
          firstPdfPage.cleanup();
          if (!active) return;
          const stageWidth = pdfStageRef.current?.clientWidth || window.innerWidth;
          setFitScale(Math.max(0.45, Math.min(1.35, (stageWidth - 48) / baseWidth)));
          const firstPage = Math.min(Math.max(studyDocument.progress_page || 1, 1), pdf.numPages);
          initialPdfPageRef.current = firstPage;
          initialNavigationPendingRef.current = true;
          setPage(firstPage);
        } else if (['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
          setPage(1);
          setPageCount(null);
        } else if (extension === 'ppt' || extension === 'pptx') {
          const presentation = await parse(studyDocument.blob);
          if (!active || !stageRef.current) return;

          const viewerHost = stageRef.current.ownerDocument.createElement('div');
          viewerHost.style.display = 'contents';
          stageRef.current.replaceChildren(viewerHost);
          powerPointHostRef.current = viewerHost;
          const viewer = new PowerPointViewer(viewerHost, presentation, {
            animate: false,
            autoAdvance: false,
            textMode: 'svg',
          });
          viewer.onChange = (index) => {
            const nextPage = index + 1;
            setPage(nextPage);
            onPageChange(nextPage, viewer.count);
          };
          powerPointRef.current = viewer;
          setPageCount(viewer.count);
          viewer.goTo(Math.max(0, Math.min((studyDocument.progress_page || 1) - 1, viewer.count - 1)));
          const actualPage = viewer.index + 1;
          setPage(actualPage);
          onPageChange(actualPage, viewer.count);
        } else {
          throw new Error('This file type cannot be previewed here. Download a copy to open it in a compatible app.');
        }
      } catch (loadError) {
        if (active) {
          if (extension === 'ppt' || extension === 'pptx') disposePowerPointViewer();
          const message = loadError?.message || 'This document could not be opened.';
          setError(extension === 'ppt' || extension === 'pptx'
            ? `This presentation could not be previewed. Download a copy to open it in a compatible app. ${message}`
            : message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDocument();

    return () => {
      active = false;
      initialNavigationPendingRef.current = false;
      if (visiblePageFrameRef.current) cancelAnimationFrame(visiblePageFrameRef.current);
      visiblePageFrameRef.current = 0;
      const loadingTask = pdfLoadingTaskRef.current;
      pdfLoadingTaskRef.current = null;
      if (typeof loadingTask?.destroy === 'function') {
        loadingTask.destroy().catch((cleanupError) => {
          console.error('Could not clean up the PDF loading task.', cleanupError);
        });
      }
      pdfRef.current = null;
      disposePowerPointViewer();
    };
  }, [studyDocument.id, studyDocument.blob, studyDocument.file_type, onPageChange]);

  useEffect(() => {
    setPageInput(String(page));
    if (studyDocument.file_type === 'pdf' && pageCount) onPageChange(page, pageCount);
  }, [onPageChange, page, pageCount, studyDocument.file_type]);

  useEffect(() => {
    if (studyDocument.file_type !== 'pdf' || !pageCount || loading) return undefined;
    const frame = requestAnimationFrame(() => {
      pdfStageRef.current?.querySelector(`[data-page-number="${initialPdfPageRef.current}"]`)?.scrollIntoView({
        block: 'start',
        behavior: 'auto',
      });
      requestAnimationFrame(() => {
        initialNavigationPendingRef.current = false;
        updateCurrentPage();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, pageCount, studyDocument.file_type, updateCurrentPage]);

  useEffect(() => {
    if (!studyDocument.blob) {
      setDownloadUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(studyDocument.blob);
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [studyDocument.blob]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const goToPage = useCallback((nextPage) => {
    const boundedPage = Math.max(1, Math.min(pageCount || 1, Number(nextPage) || 1));
    setPage(boundedPage);
    setPageInput(String(boundedPage));

    if (studyDocument.file_type === 'pdf') {
      requestAnimationFrame(() => {
        pdfStageRef.current?.querySelector(`[data-page-number="${boundedPage}"]`)?.scrollIntoView({
          block: 'start',
          behavior: 'smooth',
        });
      });
    } else if (boundedPage > page) {
      powerPointRef.current?.next();
    } else {
      powerPointRef.current?.prev();
    }
  }, [page, pageCount, studyDocument.file_type]);

  const findTopic = useCallback(async () => {
    const pdf = pdfRef.current;
    const query = searchTerm.trim().toLocaleLowerCase();
    if (!pdf || !query || !pageCount) return;

    const sameQuery = searchCursorRef.current.term === query;
    const startPage = sameQuery ? searchCursorRef.current.page + 1 : page;
    setSearching(true);
    setSearchStatus('Searching…');
    let foundPage = 0;

    try {
      for (let offset = 0; offset < pageCount; offset += 1) {
        const pageNumber = ((startPage - 1 + offset) % pageCount) + 1;
        const pdfPage = await pdf.getPage(pageNumber);
        const textContent = await pdfPage.getTextContent();
        const text = textContent.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .toLocaleLowerCase();
        if (pdfRef.current !== pdf) return;
        if (text.includes(query)) {
          foundPage = pageNumber;
          break;
        }
      }

      if (foundPage) {
        searchCursorRef.current = { term: query, page: foundPage };
        setSearchStatus(`Found on page ${foundPage}`);
        goToPage(foundPage);
      } else {
        searchCursorRef.current = { term: query, page: 0 };
        setSearchStatus(`No match for “${searchTerm.trim()}”.`);
      }
    } catch (searchError) {
      setSearchStatus(searchError?.message || 'Topic search could not be completed.');
    } finally {
      setSearching(false);
    }
  }, [goToPage, page, pageCount, searchTerm]);

  const closeReader = useCallback(async () => {
    if (pageCount && !isImage) await onPageChange(page, pageCount);
    onClose();
  }, [isImage, onClose, onPageChange, page, pageCount]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        closeReader();
        return;
      }
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === 'ArrowLeft') goToPage(page - 1);
      if (event.key === 'ArrowRight') goToPage(page + 1);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeReader, goToPage, page]);

  return (
    <section className="study-reader study-reader-fullscreen" role="dialog" aria-modal="true" aria-label={`Reading ${studyDocument.file_name}`}>
      <header className="study-reader-toolbar">
        <button className="study-icon-button" type="button" aria-label="Close reader" onClick={closeReader}>
          <X size={19} />
        </button>
        <strong className="study-reader-title" title={studyDocument.file_name}>{studyDocument.file_name}</strong>

        {!isImage && <div className="study-reader-controls">
          <button
            className="study-icon-button"
            type="button"
            aria-label="Previous page or slide"
            disabled={loading || page <= 1}
            onClick={() => goToPage(page - 1)}
          ><ChevronLeft size={18} /></button>
          <label className="study-page-jump">
            <span className="sr-only">Go to page</span>
            <input
              aria-label="Go to page"
              type="number"
              min="1"
              max={pageCount || undefined}
              value={pageInput}
              disabled={loading || !pageCount}
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={() => goToPage(pageInput)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  goToPage(pageInput);
                  event.currentTarget.blur();
                }
              }}
            />
            <span>/ {pageCount || '—'}</span>
          </label>
          <button
            className="study-icon-button"
            type="button"
            aria-label="Next page or slide"
            disabled={loading || !pageCount || page >= pageCount}
            onClick={() => goToPage(page + 1)}
          ><ChevronRight size={18} /></button>
        </div>}

        {studyDocument.file_type === 'pdf' && (
          <>
            <form
              className="study-topic-search"
              onSubmit={(event) => {
                event.preventDefault();
                findTopic();
              }}
            >
              <input
                type="search"
                aria-label="Search a topic in this PDF"
                placeholder="Search in PDF"
                value={searchTerm}
                disabled={loading}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  searchCursorRef.current = { term: '', page: 0 };
                  setSearchStatus('');
                }}
              />
              <button className="study-icon-button" type="submit" disabled={loading || searching || !searchTerm.trim()} aria-label="Find next match">
                <Search size={16} />
              </button>
            </form>
            <span className="study-search-status" aria-live="polite">
              {searching ? 'Searching…' : searchStatus}
            </span>
          </>
        )}
        {(studyDocument.file_type === 'pdf' || isImage) && (
          <div className="study-reader-zoom">
            <button className="study-icon-button" type="button" aria-label="Zoom out" disabled={zoom <= (isImage ? 0.25 : 0.6)} onClick={() => setZoom((value) => Math.max(isImage ? 0.25 : 0.6, value - 0.1))}><Minus size={16} /></button>
            <span>{Math.round(zoom * 100)}%</span>
            <button className="study-icon-button" type="button" aria-label="Zoom in" disabled={zoom >= (isImage ? 4 : 2.2)} onClick={() => setZoom((value) => Math.min(isImage ? 4 : 2.2, value + 0.1))}><Plus size={16} /></button>
          </div>
        )}

        {downloadUrl && (
          <a className="study-icon-button" href={downloadUrl} download={studyDocument.file_name} aria-label="Download a copy">
            <Download size={16} />
          </a>
        )}
      </header>

      {loading && <div className="study-reader-state"><span className="loading-inline" />Opening your material…</div>}
      {error && (
        <div className="study-reader-state study-viewer-error" role="alert">
          <RotateCcw size={17} />
          <span>{error}</span>
          {downloadUrl && (
            <a className="button button-outline button-small" href={downloadUrl} download={studyDocument.file_name}>
              <Download size={14} /> Download file
            </a>
          )}
        </div>
      )}

      {studyDocument.file_type === 'pdf' && pdfRef.current && (
        <div className="study-pdf-stage study-pdf-continuous" ref={pdfStageRef} hidden={loading || Boolean(error)} onScroll={updateCurrentPage}>
          {Array.from({ length: pageCount || 0 }, (_, index) => (
            <PdfPage
              key={`${studyDocument.id}-${index + 1}`}
              pdf={pdfRef.current}
              pageNumber={index + 1}
              scale={fitScale * zoom}
              rootRef={pdfStageRef}
            />
          ))}
        </div>
      )}
      {isImage && (
        <div className="study-image-stage" hidden={loading || Boolean(error)}>
          {downloadUrl && (
            <img
              src={downloadUrl}
              alt={studyDocument.title || studyDocument.file_name}
              onLoad={(event) => {
                setImageDimensions({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                });
              }}
              style={{
                width: imageDimensions
                  ? `${imageDimensions.width * imageFitScale * zoom}px`
                  : 'auto',
              }}
              onError={() => setError('This image could not be opened from local storage.')}
            />
          )}
        </div>
      )}
      {studyDocument.file_type !== 'pdf' && !isImage && (
        <div className="study-document-stage study-reader-ppt" ref={stageRef} hidden={loading || Boolean(error)} />
      )}
    </section>
  );
}
