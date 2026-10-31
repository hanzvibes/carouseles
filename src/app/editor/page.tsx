"use client";

import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import AiEditPanel from "./ai-edit-panel";
import { applySlideTextEdits } from "@/lib/carousel-core/ai-editing";
import { renderCarouselPage, safeExportName } from "@/lib/carousel-core/export";
import { bootstrapCloudDocument, saveCloudDocument } from "@/lib/carousel-core/cloud";
import { createLatestSaveQueue, type LatestSaveQueue } from "@/lib/carousel-core/latest-save-queue";
import { ANONYMOUS_DRAFT_STORAGE_KEY, LEGACY_DRAFT_STORAGE_KEY, canReadLegacyDraft, getDraftStorageKey } from "@/lib/carousel-core/draft-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyCarouselDocument,
  type CarouselDocument,
  type CarouselElement,
  validateCarouselDocument
} from "@/lib/carousel-core/schema";


function readLocalDraft(storageKey: string, legacyFallback = false): CarouselDocument | null {
  try {
    const raw = window.localStorage.getItem(storageKey)
      ?? (legacyFallback ? window.localStorage.getItem(LEGACY_DRAFT_STORAGE_KEY) : null);
    return raw ? validateCarouselDocument(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function EditorPage() {
  const [document, setDocument] = useState<CarouselDocument>(() => createEmptyCarouselDocument());
  const [activePageId, setActivePageId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [cloudUserId, setCloudUserId] = useState<string | null>(null);
  const [draftStorageKey, setDraftStorageKey] = useState(ANONYMOUS_DRAFT_STORAGE_KEY);
  const [cloudProjectId, setCloudProjectId] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState("Local draft");
  const [cloudError, setCloudError] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const interactionRef = useRef<{ id: string; mode: "move" | "resize"; pointerX: number; pointerY: number; x: number; y: number; width: number; height: number } | null>(null);
  const cloudSaveQueueRef = useRef<{ key: string; queue: LatestSaveQueue<CarouselDocument> } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initializeEditor() {
      let authenticatedUserId: string | null = null;
      const supabase = createSupabaseBrowserClient();

      if (!supabase) {
        const localDocument = readLocalDraft(ANONYMOUS_DRAFT_STORAGE_KEY, canReadLegacyDraft(null));
        if (!cancelled && localDocument) {
          setDocument(localDocument);
          setActivePageId(localDocument.pages[0].id);
        }
        if (!cancelled) {
          setCloudStatus("Local only · configure Supabase");
          setReady(true);
        }
        return;
      }

      try {
        const auth = await supabase.auth.getUser();
        if (auth.error) throw auth.error;

        if (!auth.data.user) {
          // Never upload an anonymous draft into a signed-in account.
          const localDocument = readLocalDraft(ANONYMOUS_DRAFT_STORAGE_KEY, canReadLegacyDraft(null));
          if (!cancelled && localDocument) {
            setDocument(localDocument);
            setActivePageId(localDocument.pages[0].id);
          }
          if (!cancelled) {
            setCloudStatus("Local draft · sign in to sync");
            setCloudError("");
            setReady(true);
          }
          return;
        }

        const userId = auth.data.user.id;
        authenticatedUserId = userId;
        setCloudUserId(userId);
        setDraftStorageKey(getDraftStorageKey(userId));
        const localDocument = readLocalDraft(getDraftStorageKey(userId), canReadLegacyDraft(userId));
        const bootstrap = await bootstrapCloudDocument(supabase, localDocument);
        if (cancelled) return;

        setDocument(bootstrap.document);
        setActivePageId(bootstrap.document.pages[0].id);
        setCloudUserId(bootstrap.user.id);
        setCloudProjectId(bootstrap.projectId);
        setCloudStatus("Cloud connected");
        setCloudError("");
      } catch (error) {
        if (cancelled) return;
        const localDocument = authenticatedUserId
          ? readLocalDraft(getDraftStorageKey(authenticatedUserId), canReadLegacyDraft(authenticatedUserId))
          : readLocalDraft(ANONYMOUS_DRAFT_STORAGE_KEY, canReadLegacyDraft(null));
        if (localDocument) {
          setDocument(localDocument);
          setActivePageId(localDocument.pages[0].id);
        }
        setCloudStatus(authenticatedUserId ? "Cloud unavailable · user draft kept" : "Local draft · sign in to sync");
        setCloudError(error instanceof Error ? error.message : "Cloud connection failed");
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void initializeEditor();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(draftStorageKey, JSON.stringify(document));
        setSavedAt(new Date());
        setSaveError(false);
      } catch {
        setSaveError(true);
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [document, ready, draftStorageKey]);

  useEffect(() => {
    if (!ready || !cloudUserId || !cloudProjectId) return;

    const queueKey = `${cloudUserId}:${cloudProjectId}`;
    if (cloudSaveQueueRef.current?.key !== queueKey) {
      const isCurrentQueue = () => cloudSaveQueueRef.current?.key === queueKey;
      cloudSaveQueueRef.current = {
        key: queueKey,
        queue: createLatestSaveQueue(async (snapshot) => {
          if (!isCurrentQueue()) return;
          const supabase = createSupabaseBrowserClient();
          if (!supabase) return;
          setCloudStatus("Syncing…");
          try {
            await saveCloudDocument(supabase, cloudProjectId, cloudUserId, snapshot);
            if (isCurrentQueue()) {
              setCloudStatus("Saved to cloud");
              setCloudError("");
            }
          } catch (error) {
            if (isCurrentQueue()) {
              setCloudStatus("Cloud save failed · local draft kept");
              setCloudError(error instanceof Error ? error.message : "Cloud save failed");
            }
          }
        })
      };
    }

    const queue = cloudSaveQueueRef.current.queue;
    const handleOffline = () => {
      if (cloudSaveQueueRef.current?.key === queueKey) {
        setCloudStatus("Offline · local draft kept");
      }
    };
    const handleOnline = () => {
      if (cloudSaveQueueRef.current?.key !== queueKey) return;
      setCloudStatus("Connection restored · syncing");
      queue.enqueue(document);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    const timeout = window.setTimeout(() => queue.enqueue(document), 900);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [document, ready, cloudUserId, cloudProjectId]);

  useEffect(() => {
    if (!ready) return;
    const generatedRaw = window.localStorage.getItem("carouseles:generated-document");
    if (generatedRaw) {
      window.localStorage.removeItem("carouseles:generated-document");
      window.localStorage.removeItem("carouseles:pending-prompt");
      try {
        const generatedDocument = validateCarouselDocument(JSON.parse(generatedRaw));
        setDocument(generatedDocument);
        setActivePageId(generatedDocument.pages[0].id);
        setSelectedId(null);
        return;
      } catch {
        setExportStatus("Generated draft could not be loaded. Start a new carousel.");
      }
    }
    const prompt = window.localStorage.getItem("carouseles:pending-prompt");
    if (!prompt) return;
    window.localStorage.removeItem("carouseles:pending-prompt");
    setDocument((current) => {
      const firstPage = current.pages[0];
      if (!firstPage || firstPage.elements.length > 0) return current;
      const headline: CarouselElement = {
        id: makeId(), type: "text", x: 90, y: 150, width: 900, height: 430,
        rotation: 0, content: prompt,
        style: { color: "#171717", fontSize: 68, fontFamily: "Manrope", fontWeight: "bold", textAlign: "left" }
      };
      return {
        ...current,
        title: prompt.length > 42 ? `${prompt.slice(0, 39)}…` : prompt,
        pages: current.pages.map((page, index) => index === 0 ? { ...page, elements: [headline] } : page)
      };
    });
  }, [ready]);

  const activePage = useMemo(
    () => document.pages.find((page) => page.id === activePageId) ?? document.pages[0],
    [document.pages, activePageId]
  );
  const selectedElement = activePage?.elements.find((element) => element.id === selectedId) ?? null;

  const updatePage = useCallback((updater: (elements: CarouselElement[]) => CarouselElement[]) => {
    if (!activePage) return;
    setDocument((current) => ({
      ...current,
      pages: current.pages.map((page) =>
        page.id === activePage.id ? { ...page, elements: updater(page.elements) } : page
      )
    }));
  }, [activePage]);

  function startInteraction(event: React.PointerEvent<HTMLElement>, element: CarouselElement, mode: "move" | "resize") {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(element.id);
    interactionRef.current = {
      id: element.id, mode, pointerX: event.clientX, pointerY: event.clientY,
      x: element.x, y: element.y, width: element.width, height: element.height
    };
    const captureTarget = event.currentTarget.closest(".canvas-element") as HTMLElement | null;
    captureTarget?.setPointerCapture(event.pointerId);
  }

  function moveInteraction(event: React.PointerEvent<HTMLDivElement>) {
    const interaction = interactionRef.current;
    if (!interaction) return;
    const canvas = event.currentTarget.closest(".design-canvas");
    if (!(canvas instanceof HTMLElement)) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = document.width / rect.width;
    const scaleY = document.height / rect.height;
    const dx = (event.clientX - interaction.pointerX) * scaleX;
    const dy = (event.clientY - interaction.pointerY) * scaleY;
    setDocument((current) => ({
      ...current,
      pages: current.pages.map((page) => page.id !== activePage?.id ? page : {
        ...page,
        elements: page.elements.map((element) => element.id !== interaction.id ? element : interaction.mode === "move"
          ? { ...element, x: Math.max(0, Math.min(document.width - element.width, interaction.x + dx)), y: Math.max(0, Math.min(document.height - element.height, interaction.y + dy)) }
          : { ...element, width: Math.max(30, Math.min(document.width - interaction.x, interaction.width + dx)), height: Math.max(30, Math.min(document.height - interaction.y, interaction.height + dy)) })
      })
    }));
  }

  function endInteraction(event: React.PointerEvent<HTMLDivElement>) {
    interactionRef.current = null;
    const captureTarget = event.currentTarget.closest(".canvas-element") as HTMLElement | null;
    if (captureTarget?.hasPointerCapture(event.pointerId)) captureTarget.releasePointerCapture(event.pointerId);
  }

  function addImage(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"].includes(file.type)) { setExportStatus("Use a JPG, PNG, WebP, GIF, or SVG image."); return; }
    if (file.size > 2 * 1024 * 1024) { setExportStatus("Image must be 2 MB or smaller."); return; }
    const currentSize = new Blob([JSON.stringify(document)]).size;
    if (currentSize + file.size * 1.4 > 3.5 * 1024 * 1024) { setExportStatus("This draft is near the browser storage limit. Remove an image first."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const imageData = String(reader.result);
      if (selectedElement?.type === "image") {
        updatePage((items) => items.map((item) => item.id === selectedElement.id ? { ...item, content: imageData } : item));
      } else {
        const element: CarouselElement = {
          id: makeId(), type: "image", x: 100, y: 160, width: 880, height: 620,
          rotation: 0, content: imageData,
          style: { backgroundColor: "#eeeeee" }
        };
        updatePage((items) => [...items, element]);
        setSelectedId(element.id);
      }
      setExportStatus("");
    };
    reader.onerror = () => setExportStatus("Could not read this image.");
    reader.readAsDataURL(file);
  }

  function addText() {
    const element: CarouselElement = {
      id: makeId(), type: "text", x: 100, y: 150, width: 850, height: 230,
      rotation: 0, content: "Your headline goes here",
      style: { color: "#171717", fontSize: 76, fontFamily: "Manrope", fontWeight: "bold", textAlign: "left" }
    };
    updatePage((items) => [...items, element]);
    setSelectedId(element.id);
  }

  function addShape() {
    const element: CarouselElement = {
      id: makeId(), type: "shape", x: 100, y: 470, width: 880, height: 24,
      rotation: 0, content: "",
      style: { backgroundColor: "#7057e8", borderRadius: 12 }
    };
    updatePage((items) => [...items, element]);
    setSelectedId(element.id);
  }

  function addPage() {
    const page = { id: makeId(), name: `Slide ${document.pages.length + 1}`, background: "#ffffff", elements: [] };
    setDocument((current) => ({ ...current, pages: [...current.pages, page] }));
    setActivePageId(page.id);
    setSelectedId(null);
  }

  function removeSelected() {
    if (!selectedId) return;
    updatePage((items) => items.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }

  function updateSelected(patch: Partial<CarouselElement>) {
    if (!selectedId) return;
    updatePage((items) => items.map((item) => item.id === selectedId ? { ...item, ...patch } : item));
  }

  function updateSelectedStyle(key: keyof CarouselElement["style"], value: string | number) {
    if (!selectedElement) return;
    updateSelected({ style: { ...selectedElement.style, [key]: value } });
  }

  async function exportPng() {
    if (!activePage) return;
    setExportStatus("Preparing PNG…");
    try {
      const blob = await renderCarouselPage(document, activePage, "image/png");
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeExportName(document.title)}-slide-${String(document.pages.indexOf(activePage) + 1).padStart(2, "0")}.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setExportStatus("PNG downloaded");
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : "PNG export failed.");
    }
  }

  async function exportJpgAll() {
    if (document.pages.length === 0) return;
    setExportStatus(`Preparing ${document.pages.length} JPG slides…`);
    try {
      const baseName = safeExportName(document.title);
      for (const [index, page] of document.pages.entries()) {
        const blob = await renderCarouselPage(document, page, "image/jpeg", 0.94);
        const url = URL.createObjectURL(blob);
        const anchor = window.document.createElement("a");
        anchor.href = url;
        anchor.download = `${baseName}-slide-${String(index + 1).padStart(2, "0")}.jpg`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 3000);
        setExportStatus(`Exporting JPG ${index + 1}/${document.pages.length}…`);
        await new Promise((resolve) => window.setTimeout(resolve, 220));
      }
      setExportStatus("All JPG slides downloaded");
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : "JPG export failed.");
    }
  }

  async function exportPdfAll() {
    if (document.pages.length === 0) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setExportStatus("Allow pop-ups to export the PDF.");
      return;
    }
    setExportStatus(`Preparing PDF · 0/${document.pages.length} slides…`);
    try {
      const pageImages: string[] = [];
      for (const [index, page] of document.pages.entries()) {
        const blob = await renderCarouselPage(document, page, "image/jpeg", 0.96);
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not prepare a PDF page."));
          reader.readAsDataURL(blob);
        });
        pageImages.push(dataUrl);
        setExportStatus(`Preparing PDF · ${index + 1}/${document.pages.length} slides…`);
      }
      const pages = pageImages.map((src) => `<section class="slide"><img src="${src}" alt="Carousel slide"></section>`).join("");
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safeExportName(document.title)}</title><style>
        @page{size:8in 10in;margin:0}
        *{box-sizing:border-box}
        html,body{margin:0;padding:0;background:#fff}
        .slide{width:8in;height:10in;page-break-after:always;break-after:page;overflow:hidden}
        .slide:last-child{page-break-after:auto;break-after:auto}
        img{display:block;width:100%;height:100%;object-fit:contain}
        @media screen{body{background:#e9e9e9}.slide{margin:20px auto;box-shadow:0 2px 16px #0002}}
      </style></head><body>${pages}</body></html>`);
      printWindow.document.close();
      const images = Array.from(printWindow.document.images);
      await Promise.all(images.map((image) => image.decode()));
      setExportStatus("PDF ready · choose Save as PDF in the print dialog");
      printWindow.focus();
      printWindow.print();
    } catch (error) {
      printWindow.close();
      setExportStatus(error instanceof Error ? error.message : "PDF export failed.");
    }
  }

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      setCloudError(error.message);
      return;
    }
    setCloudUserId(null);
    setCloudProjectId(null);
    setCloudStatus("Signed out · local draft kept");
  }

  function renameDocument(value: string) {
    setDocument((current) => ({ ...current, title: value || "Untitled carousel" }));
  }

  return (
    <main className="editor-shell">
      <header className="editor-topbar">
        <div className="editor-brand-group">
          <Link href="/" className="editor-back" aria-label="Back to dashboard">←</Link>
          <span className="editor-brand-mark">c.</span>
          <input className="document-title" aria-label="Project title" value={document.title} onChange={(event) => renameDocument(event.target.value)} />
          <span className="save-indicator"><i />{saveError ? "Storage full" : cloudStatus}</span>
        </div>
        <div className="editor-top-actions">
          <span className="editor-dimensions">1080 × 1350</span>
          {cloudUserId ? <button className="editor-export" onClick={signOut}>Sign out</button> : <Link className="editor-export" href="/login">Sign in to sync</Link>}
          <button className="editor-export" onClick={exportPng}>PNG</button>
          <button className="editor-export" onClick={exportJpgAll}>JPG · All</button>
          <button className="editor-export" onClick={exportPdfAll}>PDF · All ↗</button>
        </div>
      </header>

      <div className="editor-workspace">
        <aside className="editor-leftbar">
          <div className="tool-label">INSERT</div>
          <button className="tool-button" onClick={addText}><span className="tool-glyph">T</span><span>Text</span></button>
          <button className="tool-button" onClick={addShape}><span className="tool-glyph shape-glyph">▰</span><span>Shape</span></button>
          <button className="tool-button" onClick={() => imageInputRef.current?.click()}><span className="tool-glyph">▧</span><span>Image</span></button><input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(event) => { addImage(event.target.files?.[0]); event.target.value = ""; }} />
          <div className="leftbar-hint">Select an element on the canvas to edit its content and style.</div>
        </aside>

        <section className="canvas-workspace">
          <div className="canvas-toolbar"><div><span className="canvas-toolbar-dot" /> Editing <b>{activePage?.name ?? "Slide"}</b></div><div>Portrait · 4:5</div></div>
          <div className="canvas-stage">
            <div className="design-canvas" style={{ background: activePage?.background ?? "#fff" }} onClick={() => setSelectedId(null)}>
              {activePage?.elements.map((element) => (
                <div
                  key={element.id}
                  className={`canvas-element ${selectedId === element.id ? "element-selected" : ""}`}
                  style={{
                    left: `${element.x / document.width * 100}%`,
                    top: `${element.y / document.height * 100}%`,
                    width: `${element.width / document.width * 100}%`,
                    height: `${element.height / document.height * 100}%`,
                    transform: `rotate(${element.rotation}deg)`,
                    color: element.style.color,
                    background: element.type === "shape" ? element.style.backgroundColor : "transparent",
                    borderRadius: element.style.borderRadius,
                    fontSize: `min(${(element.style.fontSize ?? 40) / 1080 * 100}cqw, 8vw)`,
                    fontFamily: element.style.fontFamily ?? "Manrope",
                    fontWeight: element.style.fontWeight ?? "normal",
                    textAlign: element.style.textAlign ?? "left"
                  }}
                  onClick={(event) => { event.stopPropagation(); setSelectedId(element.id); }}
                  onPointerDown={(event) => startInteraction(event, element, "move")}
                  onPointerMove={moveInteraction}
                  onPointerUp={endInteraction}
                  onPointerCancel={endInteraction}
                >
                  {element.type === "text" ? element.content : element.type === "image" ? <img className="canvas-image" src={element.content} alt="Carousel element" draggable={false} /> : null}
                  {selectedId === element.id && <span className="selection-corner" onPointerDown={(event) => startInteraction(event, element, "resize")} /> }
                </div>
              ))}
              {(!activePage || activePage.elements.length === 0) && (
                <div className="canvas-empty" onClick={(event) => event.stopPropagation()}>
                  <span>✳</span><b>Your canvas is ready</b><small>Add text or a shape from the left panel.</small>
                </div>
              )}
            </div>
          </div>
          <div className="canvas-footer"><span>CAROUSEL CORE · SCHEMA V1</span><span>{exportStatus || cloudError || `${activePage?.elements.length ?? 0} elements`}</span></div>
        </section>

        <aside className="editor-inspector">
          <div className="inspector-heading"><b>{selectedElement ? "Element settings" : "Design"}</b><span>{selectedElement ? selectedElement.type.toUpperCase() : "CANVAS"}</span></div>
          {selectedElement ? (
            <div className="inspector-content">
              {selectedElement.type === "text" && <>
                <label className="field-label">Text content</label>
                <textarea className="inspector-textarea" value={selectedElement.content} onChange={(event) => updateSelected({ content: event.target.value })} rows={5} />
                <label className="field-label">Font size</label>
                <input className="inspector-input" type="number" min="8" max="220" value={selectedElement.style.fontSize ?? 40} onChange={(event) => updateSelectedStyle("fontSize", Number(event.target.value))} />
                <label className="field-label">Text color</label>
                <input className="color-input" type="color" value={selectedElement.style.color ?? "#171717"} onChange={(event) => updateSelectedStyle("color", event.target.value)} />
                <label className="field-label">Alignment</label>
                <div className="alignment-row">{(["left", "center", "right"] as const).map((alignment) => <button key={alignment} className={selectedElement.style.textAlign === alignment ? "alignment-active" : ""} onClick={() => updateSelectedStyle("textAlign", alignment)}>{alignment === "left" ? "≡" : alignment === "center" ? "☰" : "≡"}</button>)}</div>
              </>}
              {selectedElement.type === "image" && <><label className="field-label">Image</label><button className="delete-element" onClick={() => imageInputRef.current?.click()}>Replace image</button></>}
              {selectedElement.type === "shape" && <>
                <label className="field-label">Fill color</label>
                <input className="color-input" type="color" value={selectedElement.style.backgroundColor ?? "#7057e8"} onChange={(event) => updateSelectedStyle("backgroundColor", event.target.value)} />
                <label className="field-label">Corner radius</label>
                <input className="inspector-input" type="number" min="0" max="300" value={selectedElement.style.borderRadius ?? 0} onChange={(event) => updateSelectedStyle("borderRadius", Number(event.target.value))} />
              </>}
              <div className="inspector-divider" />
              <button className="delete-element" onClick={removeSelected}>Delete element</button>
            </div>
          ) : (
            <div className="inspector-content">
              <label className="field-label">Slide background</label>
              <input className="color-input" type="color" value={activePage?.background ?? "#ffffff"} onChange={(event) => {
                if (!activePage) return;
                setDocument((current) => ({ ...current, pages: current.pages.map((page) => page.id === activePage.id ? { ...page, background: event.target.value } : page) }));
              }} />
              <p className="inspector-help">Choose an element on the canvas to edit its properties.</p>
              <div className="inspector-divider" />
              <div className="core-note"><span>✳</span><b>Powered by Carousel Core</b><small>Your design is stored as structured JSON, independent from the visual editor.</small></div>
            </div>
          )}
        <AiEditPanel
          elements={activePage?.elements ?? []}
          onApply={(edits) => {
            try {
              const updatedElements = applySlideTextEdits(activePage?.elements ?? [], edits);
              updatePage(() => updatedElements);
              setExportStatus("AI edits applied");
            } catch {
              setExportStatus("AI edits could not be applied.");
            }
          }}
        />
        </aside>
      </div>

      <footer className="slide-dock">
        <div className="dock-label"><b>Slides</b><span>{document.pages.length} total</span></div>
        <div className="slide-list">
          {document.pages.map((page, index) => (
            <button key={page.id} className={`slide-thumb ${page.id === activePage?.id ? "slide-thumb-active" : ""}`} onClick={() => { setActivePageId(page.id); setSelectedId(null); }}>
              <span className="slide-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="slide-mini" style={{ background: page.background }}>{page.elements.some((element) => element.type === "text") ? "Aa" : "+"}</span>
            </button>
          ))}
          <button className="add-slide" onClick={addPage}>＋<span>Add slide</span></button>
        </div>
        <div className="dock-status">{savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Local draft"}</div>
      </footer>
    </main>
  );
}