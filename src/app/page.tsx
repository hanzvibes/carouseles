"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const projects = [
  { title: "The quiet power of consistency", category: "CREATOR EDUCATION", slides: 7, tone: "violet", date: "Just now" },
  { title: "Build systems, not habits", category: "PERSONAL BRAND", slides: 6, tone: "orange", date: "Yesterday" },
  { title: "A better way to plan your week", category: "PRODUCTIVITY", slides: 8, tone: "blue", date: "2 days ago" }
];

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [slideCount, setSlideCount] = useState(6);
  const [tone, setTone] = useState("educational");
  const [audience, setAudience] = useState("");
  const [notice, setNotice] = useState("");
  const [generating, setGenerating] = useState(false);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#"><span className="brand-mark">c.</span><span>carouseles</span></a>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-switch"><span className="workspace-avatar">R</span><span><b>Rehan&apos;s studio</b><small>Free workspace</small></span><span className="chevron">⌄</span></div>
        <nav className="nav-list" aria-label="Main navigation">
          <a className="nav-item active" href="#"><span>▦</span> Overview</a>
          <a className="nav-item" href="#projects"><span>▤</span> My projects</a>
          <span className="nav-item"><span>▧</span> Templates <span className="nav-soon">SOON</span></span>
          <span className="nav-item"><span>◈</span> Brand kit <span className="nav-soon">SOON</span></span>
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
          <section className="projects-section" id="projects">
            <div className="section-heading"><div><div className="eyebrow">YOUR CANVAS</div><h2>Recent projects</h2></div><Link href="/editor">Open editor <span>↗</span></Link></div>
            <div className="filter-row"><button className="filter active-filter">All projects</button><button className="filter">My drafts</button></div>
            <div className="project-grid">{projects.map((project, index) => <article className="project-card" key={project.title}><div className={`project-preview ${project.tone}`}><div className="preview-top"><span>CAROUSELES / 0{index + 1}</span><span>↗</span></div><div className="preview-copy"><small>{project.category}</small><strong>{project.title}</strong><span className="preview-lines">━━━━━━━━━━━━<br/>━━━━━━━━</span></div><div className="preview-bottom"><span>01 — 0{project.slides}</span><span>✳</span></div></div><div className="project-meta"><div><b>{project.title}</b><small>{project.date} · {project.slides} slides</small></div><button aria-label={`More options for ${project.title}`}>···</button></div></article>)}</div>
          </section>
          <footer className="footer-note"><span>CAROUSELES</span><span>One idea. Multiple slides. Infinite possibilities.</span><span>v0.3.0</span></footer>
        </div>
      </section>
    </main>
  );
}
