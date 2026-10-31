"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createEmptyCarouselDocument,
  type CarouselDocument,
  type CarouselElement,
  validateCarouselDocument
} from "@/lib/carousel-core/schema";

const STORAGE_KEY = "carouseles:local-draft:v1";

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
  const [exportStatus, setExportStatus] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = validateCarouselDocument(JSON.parse(raw));
        setDocument(parsed);
        setActivePageId(parsed.pages[0].id);
      }
    } catch {
      // Ignore an invalid local draft and start with a fresh document.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
        setSavedAt(new Date());
      } catch {
        // Storage may be unavailable or full; the editor remains usable in memory.
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [document, ready]);

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
      } else if (element.type === "text") {
        const fontSize = element.style.fontSize ?? 40;
        context.fillStyle = element.style.color ?? "#171717";
        context.font = `${element.style.fontWeight ?? "normal"} ${fontSize}px ${element.style.fontFamily ?? "Arial"}`;
        context.textAlign = element.style.textAlign ?? "left";
        context.textBaseline = "top";
        const words = element.content.split(/\\s+/);
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
      URL.revokeObjectURL(url);
      setExportStatus("PNG downloaded");
      window.setTimeout(() => setExportStatus(""), 2500);
    }, "image/png");
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
          <span className="save-indicator"><i />{savedAt ? "Saved locally" : ready ? "Saving…" : "Loading…"}</span>
        </div>
        <div className="editor-top-actions">
          <span className="editor-dimensions">1080 × 1350</span>
          <button className="editor-export" onClick={() => window.alert("PNG and PDF export are coming in the next phase.")}>Export ↗</button>
        </div>
      </header>

      <div className="editor-workspace">
        <aside className="editor-leftbar">
          <div className="tool-label">INSERT</div>
          <button className="tool-button" onClick={addText}><span className="tool-glyph">T</span><span>Text</span></button>
          <button className="tool-button" onClick={addShape}><span className="tool-glyph shape-glyph">▰</span><span>Shape</span></button>
          <button className="tool-button disabled-tool" disabled title="Image support is coming soon"><span className="tool-glyph">▧</span><span>Image</span></button>
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
                >
                  {element.type === "text" ? element.content : null}
                  {selectedId === element.id && <span className="selection-corner" />}
                </div>
              ))}
              {(!activePage || activePage.elements.length === 0) && (
                <div className="canvas-empty" onClick={(event) => event.stopPropagation()}>
                  <span>✳</span><b>Your canvas is ready</b><small>Add text or a shape from the left panel.</small>
                </div>
              )}
            </div>
          </div>
          <div className="canvas-footer"><span>CAROUSEL CORE · SCHEMA V1</span><span>{exportStatus || `${activePage?.elements.length ?? 0} elements`}</span></div>
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