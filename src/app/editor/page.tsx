"use client";

import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { bootstrapCloudDocument, saveCloudDocument } from "@/lib/carousel-core/cloud";
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
    const timeout = window.setTimeout(async () => {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;
      setCloudStatus("Syncing…");
      try {
        await saveCloudDocument(supabase, cloudProjectId, cloudUserId, document);
        setCloudStatus("Saved to cloud");
        setCloudError("");
      } catch (error) {
        setCloudStatus("Cloud save failed · local draft kept");
        setCloudError(error instanceof Error ? error.message : "Cloud save failed");
      }
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [document, ready, cloudUserId, cloudProjectId]);

  useEffect(() => {
    if (!ready) return;
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
    const canvas = window.document.createElement("canvas");
    canvas.width = document.width;
    canvas.height = document.height;
    const context = canvas.getContext("2d");
    if (!context) { setExportStatus("PNG export is unavailable in this browser."); return; }
    context.fillStyle = activePage.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (const element of activePage.elements) {
      context.save();
      const centerX = element.x + element.width / 2;
      const centerY = element.y + element.height / 2;
      context.translate(centerX, centerY);
      context.rotate((element.rotation * Math.PI) / 180);
      if (element.type === "shape") {
        context.fillStyle = element.style.backgroundColor ?? "#7057e8";
        const radius = Math.min(element.style.borderRadius ?? 0, element.width / 2, element.height / 2);
        context.beginPath();
        context.roundRect(-element.width / 2, -element.height / 2, element.width, element.height, radius);
        context.fill();
      } else if (element.type === "image") {
        try {
          const image = new window.Image();
          image.src = element.content;
          await image.decode();
          context.drawImage(image, -element.width / 2, -element.height / 2, element.width, element.height);
        } catch {
          context.fillStyle = "#eeeeee";
          context.fillRect(-element.width / 2, -element.height / 2, element.width, element.height);
        }
      } else if (element.type === "text") {
        const fontSize = element.style.fontSize ?? 40;
        context.fillStyle = element.style.color ?? "#171717";
        context.font = `${element.style.fontWeight ?? "normal"} ${fontSize}px ${element.style.fontFamily ?? "Arial"}`;
        context.textAlign = element.style.textAlign ?? "left";
        context.textBaseline = "top";
        const words = element.content.split(/\s+/);
        const lines: string[] = [];
        let line = "";
        for (const word of words) {
          const candidate = line ? `${line} ${word}` : word;
          if (line && context.measureText(candidate).width > element.width - 20) {
            lines.push(line);
            line = word;
          } else line = candidate;
        }
        if (line) lines.push(line);
        const textX = context.textAlign === "center" ? 0 : context.textAlign === "right" ? element.width / 2 - 10 : -element.width / 2 + 10;
        lines.forEach((textLine, index) => context.fillText(textLine, textX, -element.height / 2 + 8 + index * fontSize * 1.18, element.width - 20));
      }
      context.restore();
    }
    canvas.toBlob((blob) => {
      if (!blob) { setExportStatus("Could not create PNG."); return; }
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `${document.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-slide.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportStatus("PNG downloaded");
      window.setTimeout(() => setExportStatus(""), 2500);
    }, "image/png");
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
          <button className="editor-export" onClick={exportPng}>Export PNG ↗</button>
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