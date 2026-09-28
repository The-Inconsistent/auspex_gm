"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";

import { BOOKS, MAX_PAGE_BYTES, pdfPage, type BookReply, type ThreatSource } from "@wg/shared";

import type { RenderPage } from "@/hooks/use-table/use-table";

// Wide enough to read small print on a phone with a pinch, small enough to stay a few hundred KB as JPEG.
const PAGE_WIDTH_PX = 1400;
const JPEG_QUALITY = [0.8, 0.6];

type ServeBooks = (next: { sources: ThreatSource[]; render: RenderPage } | null) => void;

// The GM's own PDFs, picked on this device and held in this tab's memory only: nothing is uploaded. While `serving`,
// a player's tap on a cite reaches `render` (via the api relay) and gets back a JPEG of that one page.
// ponytail: files are re-picked after a reload, store File handles in IndexedDB if that gets tedious
export function useBookServer(serveBooks: ServeBooks) {
  const [files, setFiles] = useState<Partial<Record<ThreatSource, File>>>({});
  const [serving, setServing] = useState(false);
  const [served, setServed] = useState(0);
  // What `render` reads (a socket callback, outside render): each picked file, parsed once on its first request.
  const books = useRef(new Map<ThreatSource, { file: File; task?: Promise<PDFDocumentLoadingTask> }>());

  const render: RenderPage = useCallback(async (p) => {
    const book = books.current.get(p.source);
    if (!book) return { ok: false, error: "The GM isn't serving that book." };
    book.task ??= openDoc(book.file);
    let doc: PDFDocumentProxy;
    try {
      doc = await (await book.task).promise;
    } catch {
      book.task = undefined; // not a PDF pdf.js can read; the GM can pick another file
      return { ok: false, error: `The GM's ${BOOKS[p.source].name} file won't open.` };
    }
    const n = pdfPage(p);
    if (n > doc.numPages) return { ok: false, error: `${BOOKS[p.source].name} has no page ${p.page}.` };
    const reply = await renderPage(doc, n);
    if (reply.ok) setServed((c) => c + 1);
    return reply;
  }, []);

  // External system: the table socket. Tells the api which books this tablet serves, or none.
  useEffect(() => {
    const sources = (Object.keys(files) as ThreatSource[]).filter((s) => files[s]);
    serveBooks(serving && sources.length ? { sources, render } : null);
  }, [files, serving, render, serveBooks]);
  // External system: the table socket. Leaving the GM app stops serving. It's separate from the effect above so that
  // picking another book doesn't tell the table "none" first, which would flicker every player's links.
  useEffect(() => () => serveBooks(null), [serveBooks]);

  const pick = (source: ThreatSource, file: File | null) => {
    void closeDoc(books.current.get(source)?.task);
    if (file) books.current.set(source, { file });
    else books.current.delete(source);
    setFiles((f) => ({ ...f, [source]: file ?? undefined }));
  };

  return { files, pick, serving, setServing, served };
}

// Frees a replaced book's parsed PDF. One that never opened has nothing to free.
async function closeDoc(task: Promise<PDFDocumentLoadingTask> | undefined) {
  try {
    await (await task)?.destroy();
  } catch {
    // It failed to load, so there is nothing to destroy.
  }
}

async function openDoc(file: File) {
  const pdfjs = await pdfjsLib();
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
}

async function renderPage(doc: PDFDocumentProxy, n: number): Promise<BookReply> {
  const page = await doc.getPage(n);
  try {
    const viewport = page.getViewport({ scale: PAGE_WIDTH_PX / page.getViewport({ scale: 1 }).width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    for (const q of JPEG_QUALITY) {
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", q));
      if (blob && blob.size <= MAX_PAGE_BYTES) return { ok: true, image: await blob.arrayBuffer() };
    }
    return { ok: false, error: "That page is too large to send." };
  } finally {
    page.cleanup();
  }
}

// pdf.js loads only on the GM's tablet, and only once a book is asked for. Only a loaded module is kept, so a failed
// chunk load (a signal blip) is retried on the next request instead of failing every page until a reload.
let lib: typeof import("pdfjs-dist") | null = null;
async function pdfjsLib() {
  if (lib) return lib;
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), {
    type: "module",
  });
  lib = pdfjs;
  return pdfjs;
}
