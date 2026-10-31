"use client";

import Link from "next/link";
import { useState } from "react";

const projects = [
  { title: "The quiet power of consistency", category: "CREATOR EDUCATION", slides: 7, tone: "violet", date: "Just now" },
  { title: "Build systems, not habits", category: "PERSONAL BRAND", slides: 6, tone: "orange", date: "Yesterday" },
  { title: "A better way to plan your week", category: "PRODUCTIVITY", slides: 8, tone: "blue", date: "2 days ago" }
];

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [notice, setNotice] = useState("");
  function startDraft() {
    if (!prompt.trim()) { setNotice("Write an idea first to start a carousel."); return; }
    window.localStorage.setItem("carouseles:pending-prompt", prompt.trim());
    window.location.href = "/editor";
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
          <div className="usage-card"><div className="usage-top"><span>AI generations</span><b>0 / 20</b></div><div className="usage-track"><i /></div><small>AI provider setup coming soon</small></div>
          <div className="profile-row"><div className="profile-avatar">R</div><div><b>Rehan</b><small>Personal account</small></div></div>
        </div>
      </aside>
      <section className="main-panel">
        <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> Overview</div><div className="top-actions"><div className="top-avatar">R</div></div></header>
        <div className="content">
          <section className="welcome-row"><div><div className="eyebrow">YOUR CREATIVE WORKSPACE</div><h1>Make ideas <em>scroll-stopping.</em></h1><p>From a rough thought to a carousel worth saving.</p></div><Link className="primary-button" href="/editor"><span>＋</span> New carousel</Link></section>
          <section className="prompt-card">
            <div className="prompt-heading"><div className="sparkle">✳</div><div><h2>Start with an idea</h2><p>Describe what you want to create. We&apos;ll put it on your canvas.</p></div><span className="ai-pill">AI STUDIO · SOON</span></div>
            <textarea id="prompt" value={prompt} onChange={event => { setPrompt(event.target.value); setNotice(""); }} placeholder="e.g. 5 lessons I learned building my first side project..." rows={3} />
            <div className="prompt-footer"><span>✧ Your idea becomes the first draft</span><button className="generate-button" onClick={startDraft}>Start designing <span>↗</span></button></div>
            {notice && <p className="notice" role="status">{notice}</p>}
          </section>
          <section className="projects-section" id="projects">
            <div className="section-heading"><div><div className="eyebrow">YOUR CANVAS</div><h2>Recent projects</h2></div><Link href="/editor">Open editor <span>↗</span></Link></div>
            <div className="filter-row"><button className="filter active-filter">All projects</button><button className="filter">My drafts</button></div>
            <div className="project-grid">{projects.map((project, index) => <article className="project-card" key={project.title}><div className={`project-preview ${project.tone}`}><div className="preview-top"><span>CAROUSELES / 0{index + 1}</span><span>↗</span></div><div className="preview-copy"><small>{project.category}</small><strong>{project.title}</strong><span className="preview-lines">━━━━━━━━━━━━<br/>━━━━━━━━</span></div><div className="preview-bottom"><span>01 — 0{project.slides}</span><span>✳</span></div></div><div className="project-meta"><div><b>{project.title}</b><small>{project.date} · {project.slides} slides</small></div><button aria-label={`More options for ${project.title}`}>···</button></div></article>)}</div>
          </section>
          <footer className="footer-note"><span>CAROUSELES</span><span>One idea. Multiple slides. Infinite possibilities.</span><span>v0.2.0</span></footer>
        </div>
      </section>
    </main>
  );
}