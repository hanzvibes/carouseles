"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { applyBrandKit, brandKitSchema, carouselTemplates, createTemplateDocument, type BrandKit, type TemplateId } from "@/lib/carousel-core/templates";
import { validateCarouselDocument, type CarouselDocument } from "@/lib/carousel-core/schema";

type SavedProject = { id: string; title: string; document: CarouselDocument; slides: number; updatedAt: string };
const projectTones = ["violet", "orange", "blue", "green", "pink", "slate"];

function formatProjectDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved project";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}
const BRAND_KIT_KEY = "carouseles:brand-kit";
const defaultBrandKit: BrandKit = { name: "My brand", colors: ["#20201f", "#f3efe7", "#b56d4b"], fontFamily: "Manrope" };

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [slideCount, setSlideCount] = useState(6);
  const [tone, setTone] = useState("educational");
  const [audience, setAudience] = useState("");
  const [notice, setNotice] = useState("");
  const [generating, setGenerating] = useState(false);
  const [brandKit, setBrandKit] = useState<BrandKit>(defaultBrandKit);
  const [kitNotice, setKitNotice] = useState("");
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(BRAND_KIT_KEY);
      if (saved) setBrandKit(brandKitSchema.parse(JSON.parse(saved)));
    } catch {
      window.localStorage.removeItem(BRAND_KIT_KEY);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSavedProjects() {
      if (!supabase) {
        if (!cancelled) setProjectsLoading(false);
        return;
      }
      try {
        const auth = await supabase.auth.getUser();
        if (auth.error) throw auth.error;
        if (!auth.data.user) {
          if (!cancelled) setSavedProjects([]);
          return;
        }
        const result = await supabase.from("carouseles_documents")
          .select("id, title, document, updated_at")
          .eq("user_id", auth.data.user.id)
          .order("updated_at", { ascending: false })
          .limit(6);
        if (result.error) throw result.error;
        const projects = (result.data ?? []).flatMap((row) => {
          try {
            const document = validateCarouselDocument(row.document);
            return [{
              id: row.id as string,
              title: (row.title as string) || document.title,
              document,
              slides: document.pages.length,
              updatedAt: row.updated_at as string
            }];
          } catch {
            return [];
          }
        });
        if (!cancelled) setSavedProjects(projects);
      } catch {
        if (!cancelled) setProjectsError("Could not load saved projects. Your drafts are still safe.");
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    }
    void loadSavedProjects();
    return () => { cancelled = true; };
  }, [supabase]);

  async function generateCarousel() {
    if (prompt.trim().length < 8) { setNotice("Add a little more detail to your idea (at least 8 characters)."); return; }
    if (!supabase) { setNotice("Supabase belum dikonfigurasi. Hubungkan project terlebih dahulu."); return; }
    setGenerating(true);
    setNotice("");
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const token = data.session?.access_token;
      if (!token) {
        setNotice("Sign in dulu untuk menggunakan AI. API key tetap tersimpan aman di server.");
        return;
      }
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: prompt.trim(), slideCount, tone, audience: audience.trim() })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Carousel generation failed.");
      window.localStorage.setItem("carouseles:generated-document", JSON.stringify(result.document));
      window.location.href = "/editor";
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not generate this carousel.");
    } finally {
      setGenerating(false);
    }
  }

  function openSavedProject(project: SavedProject) {
    try {
      window.localStorage.setItem("carouseles:generated-document", JSON.stringify(project.document));
      window.location.href = "/editor";
    } catch {
      setProjectsError("This project could not be opened in this browser.");
    }
  }

  function startFromTemplate(templateId: TemplateId) {
    try {
      let document = createTemplateDocument(templateId);
      const savedKit = window.localStorage.getItem(BRAND_KIT_KEY);
      if (savedKit) document = applyBrandKit(document, brandKitSchema.parse(JSON.parse(savedKit)));
      window.localStorage.setItem("carouseles:generated-document", JSON.stringify(document));
      window.location.href = "/editor";
    } catch {
      setNotice("Template could not be opened. Please try again.");
    }
  }

  function saveBrandKit() {
    const parsed = brandKitSchema.safeParse(brandKit);
    if (!parsed.success) { setKitNotice("Check the brand name and colors."); return; }
    try {
      window.localStorage.setItem(BRAND_KIT_KEY, JSON.stringify(parsed.data));
      setBrandKit(parsed.data);
      setKitNotice("Brand kit saved on this device.");
    } catch {
      setKitNotice("Could not save the brand kit in this browser.");
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#"><span className="brand-mark">c.</span><span>carouseles</span></a>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-switch"><span className="workspace-avatar">R</span><span><b>Rehan&apos;s studio</b><small>Free workspace</small></span><span className="chevron">⌄</span></div>
        <nav className="nav-list" aria-label="Main navigation">
          <a className="nav-item active" href="#"><span>▦</span> Overview</a>
          <a className="nav-item" href="#projects"><span>▤</span> My projects</a>
          <a className="nav-item" href="#templates"><span>▧</span> Templates</a>
          <a className="nav-item" href="#brand-kit"><span>◈</span> Brand kit</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="usage-card"><div className="usage-top"><span>AI generations</span><b>—</b></div><div className="usage-track"><i /></div><small>Uses your connected AI provider</small></div>
          <div className="profile-row"><div className="profile-avatar">R</div><div><b>Rehan</b><small>Personal account</small></div></div>
        </div>
      </aside>
      <section className="main-panel">
        <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> Overview</div><div className="top-actions"><Link className="nav-item" href="/settings/providers">AI providers</Link><Link className="nav-item" href="/login">Sign in</Link><div className="top-avatar">R</div></div></header>
        <div className="content">
          <section className="welcome-row"><div><div className="eyebrow">YOUR CREATIVE WORKSPACE</div><h1>Make ideas <em>scroll-stopping.</em></h1><p>From a rough thought to a carousel worth saving.</p></div><Link className="primary-button" href="/editor"><span>＋</span> New carousel</Link></section>
          <section className="prompt-card">
            <div className="prompt-heading"><div className="sparkle">✳</div><div><h2>Turn an idea into a carousel</h2><p>AI creates the slides. You stay in control of the design.</p></div><span className="ai-pill">AI STUDIO</span></div>
            <textarea id="prompt" value={prompt} onChange={event => { setPrompt(event.target.value); setNotice(""); }} placeholder="e.g. 5 lessons I learned building my first side project..." rows={3} disabled={generating} />
            <div className="generation-options">
              <label>SLIDES<select value={slideCount} onChange={event => setSlideCount(Number(event.target.value))} disabled={generating}><option value={3}>3 slides</option><option value={5}>5 slides</option><option value={6}>6 slides</option><option value={7}>7 slides</option><option value={8}>8 slides</option><option value={10}>10 slides</option></select></label>
              <label>CONTENT STYLE<select value={tone} onChange={event => setTone(event.target.value)} disabled={generating}><option value="educational">Educational</option><option value="storytelling">Storytelling</option><option value="bold">Bold & direct</option><option value="minimal">Minimal</option></select></label>
              <label className="audience-field">FOR WHO? <input value={audience} onChange={event => setAudience(event.target.value)} placeholder="e.g. indie makers, students..." maxLength={120} disabled={generating}/></label>
            </div>
            <div className="prompt-footer"><span>✧ Generated slides are fully editable</span><button className="generate-button" onClick={generateCarousel} disabled={generating}>{generating ? <><span className="generation-spinner"/> Creating slides…</> : <>Generate carousel <span>↗</span></>}</button></div>
            {notice && <p className="notice" role="status">{notice}</p>}
          </section>

          <section className="templates-section" id="templates">
            <div className="section-heading"><div><div className="eyebrow">START WITH A STRUCTURE</div><h2>Starter templates</h2></div><span className="section-subtitle">Pick one to open the editor</span></div>
            <div className="template-grid">
              {carouselTemplates.map((template) => <article className="template-card" key={template.id}>
                <button className="template-preview-button" onClick={() => startFromTemplate(template.id)} aria-label={`Use ${template.name} template`}>
                  <div className={`template-preview template-${template.id}`} style={{ background: template.colors[1], color: template.colors[0] }}>
                    <span className="template-kicker">CAROUSELES / 01</span><strong>{template.id === "editorial" ? "Ideas worth sharing." : template.id === "bold" ? "MAKE IT COUNT." : "Less, but better."}</strong><i style={{ background: template.colors[2] }}/><small>One thought. One clear message.</small>
                  </div>
                  <span className="template-use">Use template ↗</span>
                </button>
                <div className="template-meta"><b>{template.name}</b><span>{template.description}</span></div>
              </article>)}
            </div>
          </section>

          <section className="brand-kit-card" id="brand-kit">
            <div className="brand-kit-intro"><div className="eyebrow">YOUR VISUAL IDENTITY</div><h2>Brand kit</h2><p>Save your colors and typeface. Apply them to any starter template.</p></div>
            <div className="brand-kit-fields">
              <label>BRAND NAME<input value={brandKit.name} maxLength={40} onChange={event => setBrandKit(current => ({ ...current, name: event.target.value }))}/></label>
              <label>FONT<select value={brandKit.fontFamily} onChange={event => setBrandKit(current => ({ ...current, fontFamily: event.target.value as BrandKit["fontFamily"] }))}><option>Manrope</option><option>Inter</option><option>DM Sans</option><option>Georgia</option></select></label>
              <div className="brand-colors">{brandKit.colors.map((color, index) => <label key={index}>COLOR {index + 1}<span className="brand-color-control"><input type="color" value={color} onChange={event => setBrandKit(current => ({ ...current, colors: current.colors.map((item, itemIndex) => itemIndex === index ? event.target.value : item) as BrandKit["colors"] }))}/><code>{color.toUpperCase()}</code></span></label>)}</div>
            </div>
            <div className="brand-kit-footer"><div className="brand-swatch-preview">{brandKit.colors.map(color => <i key={color} style={{ background: color }}/>)}</div><span className="brand-kit-note">{kitNotice || "Stored locally in this browser for now."}</span><button className="generate-button" onClick={saveBrandKit}>Save brand kit</button></div>
          </section>

          <section className="projects-section" id="projects">
            <div className="section-heading"><div><div className="eyebrow">YOUR CANVAS</div><h2>Recent projects</h2></div><Link href="/editor">Open editor <span>↗</span></Link></div>
            <div className="filter-row"><span className="filter active-filter">All projects</span><span className="section-subtitle">Latest 6 saved carousels</span></div>
            {projectsError && <p className="notice" role="status">{projectsError}</p>}
            {projectsLoading ? <p className="section-subtitle" role="status">Loading your projects…</p> : savedProjects.length === 0 ? (
              <div className="project-empty"><strong>No saved carousels yet</strong><span>Start with an AI prompt or a template. Your saved work will appear here.</span><Link href="/editor">Create your first carousel ↗</Link></div>
            ) : (
              <div className="project-grid">{savedProjects.map((project, index) => <article className="project-card" key={project.id}>
                <button type="button" className={`project-preview ${projectTones[index % projectTones.length]}`} onClick={() => openSavedProject(project)} aria-label={`Open ${project.title}`} style={{ width: "100%", border: 0, textAlign: "left", cursor: "pointer" }}>
                  <div className="preview-top"><span>CAROUSELES / 0{index + 1}</span><span>↗</span></div>
                  <div className="preview-copy"><small>SAVED CAROUSEL</small><strong>{project.title}</strong><span className="preview-lines">━━━━━━━━━━━━<br/>━━━━━━━━</span></div>
                  <div className="preview-bottom"><span>01 — {String(project.slides).padStart(2, "0")}</span><span>✳</span></div>
                </button>
                <div className="project-meta"><div><b>{project.title}</b><small>{formatProjectDate(project.updatedAt)} · {project.slides} slides</small></div><button type="button" onClick={() => openSavedProject(project)} aria-label={`Open ${project.title}`}>↗</button></div>
              </article>)}</div>
            )}
          </section>
          <footer className="footer-note"><span>CAROUSELES</span><span>One idea. Multiple slides. Infinite possibilities.</span><span>v0.4.0</span></footer>
        </div>
      </section>
    </main>
  );
}
