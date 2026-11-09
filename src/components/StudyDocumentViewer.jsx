import { useCallback, useEffect, useRef, useState } from 'react';
import { parse } from '@web-ppt/core';
import { Viewer as PowerPointViewer } from '@web-ppt/viewer-core';
import {
  ChevronLeft, ChevronRight, Download, Minus, Plus, RotateCcw,
} from 'lucide-react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

export default function StudyDocumentViewer({ document: studyDocument, onPageChange }) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const pdfRef = useRef(null);
  const pdfLoadingTaskRef = useRef(null);
  const renderTaskRef = useRef(null);
  const powerPointRef = useRef(null);
  const powerPointHostRef = useRef(null);
  const [pageCount, setPageCount] = useState(studyDocument.page_count || null);
  const [page, setPage] = useState(studyDocument.progress_page || 1);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');

  const drawPdfPage = useCallback(async (pageNumber) => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;

    renderTaskRef.current?.cancel();
    try {
      const pdfPage = await pdf.getPage(pageNumber);
      if (pdfRef.current !== pdf) return;
      const viewport = pdfPage.getViewport({ scale: zoom });
      const context = canvas.getContext('2d', { alpha: false });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const task = pdfPage.render({ canvasContext: context, viewport });
      renderTaskRef.current = task;
      await task.promise;
      if (renderTaskRef.current === task) renderTaskRef.current = null;
    } catch (drawError) {
      if (drawError?.name !== 'RenderingCancelledException' && pdfRef.current === pdf) {
        setError(drawError?.message || 'This PDF page could not be rendered.');
      }
    }
  }, [zoom]);

  useEffect(() => {
    let active = true;
    const extension = studyDocument.file_type;
    setLoading(true);
    setError('');
    setPage(studyDocument.progress_page || 1);
    setPageCount(studyDocument.page_count || null);

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
          const firstPage = Math.min(Math.max(studyDocument.progress_page || 1, 1), pdf.numPages);
          setPage(firstPage);
          await drawPdfPage(firstPage);
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
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
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
    if (studyDocument.file_type === 'pdf' && pageCount) drawPdfPage(page);
  }, [drawPdfPage, page, pageCount, studyDocument.file_type]);

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
    if (studyDocument.file_type === 'pdf' && pageCount) onPageChange(page, pageCount);
  }, [onPageChange, page, pageCount, studyDocument.file_type]);

  function changePage(nextPage) {
    const boundedPage = Math.max(1, Math.min(pageCount || 1, nextPage));
    if (boundedPage === page) return;

    if (studyDocument.file_type === 'pdf') {
      setPage(boundedPage);
    } else if (boundedPage > page) {
      powerPointRef.current?.next();
    } else {
      powerPointRef.current?.prev();
    }
  }

  return (
    <section className="study-reader" aria-label={`Reading ${studyDocument.file_name}`}>
      <div className="study-reader-toolbar">
        <div>
          <strong>{studyDocument.file_name}</strong>
          <span>{studyDocument.file_type.toUpperCase()} · Stored on this device</span>
        </div>
        <div className="study-reader-controls">
          <button
            className="study-icon-button"
            type="button"
            aria-label="Previous page or slide"
            disabled={loading || page <= 1}
            onClick={() => changePage(page - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="study-page-count">{pageCount ? `${page} / ${pageCount}` : '— / —'}</span>
          <button
            className="study-icon-button"
            type="button"
            aria-label="Next page or slide"
            disabled={loading || !pageCount || page >= pageCount}
            onClick={() => changePage(page + 1)}
          >
            <ChevronRight size={18} />
          </button>
          {studyDocument.file_type === 'pdf' && (
            <>
              <button
                className="study-icon-button study-zoom-control"
                type="button"
                aria-label="Zoom out"
                onClick={() => setZoom((value) => Math.max(0.65, value - 0.15))}
              ><Minus size={16} /></button>
              <span className="study-page-count">{Math.round(zoom * 100)}%</span>
              <button
                className="study-icon-button study-zoom-control"
                type="button"
                aria-label="Zoom in"
                onClick={() => setZoom((value) => Math.min(2.25, value + 0.15))}
              ><Plus size={16} /></button>
            </>
          )}
          <a
            className="study-icon-button"
            href={downloadUrl || undefined}
            download={studyDocument.file_name}
            aria-label="Download a copy"
          ><Download size={16} /></a>
        </div>
      </div>

      {loading && <div className="study-viewer-message"><span className="loading-inline" />Opening your material…</div>}
      {error && (
        <div className="study-viewer-message study-viewer-error">
          <RotateCcw size={17} />
          <span>{error}</span>
          {downloadUrl && (
            <a className="button button-outline button-small" href={downloadUrl} download={studyDocument.file_name}>
              <Download size={14} /> Download file
            </a>
          )}
        </div>
      )}

      <div className="study-document-stage" ref={stageRef} hidden={loading || Boolean(error) || studyDocument.file_type === 'pdf'} />
      {studyDocument.file_type === 'pdf' && (
        <div className="study-pdf-stage" ref={stageRef} hidden={loading || Boolean(error)}>
          <canvas ref={canvasRef} aria-label={`PDF page ${page}`} />
        </div>
      )}
    </section>
  );
}
