"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Role = "writer" | "planner" | "designer" | "editor" | "vision";
type Provider = {
  id: string; name: string; providerType: string; baseUrl: string; modelId: string;
  role: Role; capabilities: Record<string, boolean>; isDefault: boolean; hasApiKey: boolean;
};
type FormState = {
  name: string; providerType: string; baseUrl: string; apiKey: string;
  modelId: string; role: Role; isDefault: boolean;
  capabilities: Record<string, boolean>;
};
const presets: Record<string, { name: string; baseUrl: string }> = {
  openai: { name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  openrouter: { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  groq: { name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  deepseek: { name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  custom: { name: "Custom provider", baseUrl: "https://" }
};
const initialForm: FormState = {
  name: "OpenAI", providerType: "openai", baseUrl: "https://api.openai.com/v1",
  apiKey: "", modelId: "gpt-4o-mini", role: "writer", isDefault: true,
  capabilities: { text: true, structuredOutput: true, toolCalling: true, vision: true, imageGeneration: false, streaming: true }
};
const capabilityLabels: Record<string, string> = {
  text: "Text generation", structuredOutput: "Structured output", toolCalling: "Tool calling",
  vision: "Image understanding", imageGeneration: "Image generation", streaming: "Streaming"
};

export default function ProviderSettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [modelSelections, setModelSelections] = useState<Record<string, string>>({});
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const request = useCallback(async (url: string, init: RequestInit = {}) => {
    if (!supabase) throw new Error("Supabase belum dikonfigurasi.");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Silakan sign in terlebih dahulu.");
    const response = await fetch(url, {
      ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "Request failed.");
    return payload;
  }, [supabase]);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const result = await request("/api/ai/providers");
      setProviders(result.providers ?? []);
      setNotice(null);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not load providers." });
    } finally { setLoading(false); }
  }, [request]);

  useEffect(() => { void loadProviders(); }, [loadProviders]);

  function selectPreset(type: string) {
    const preset = presets[type] ?? presets.custom;
    setForm((current) => ({ ...current, providerType: type, name: preset.name, baseUrl: preset.baseUrl }));
  }

  function startEdit(provider: Provider) {
    setEditingId(provider.id);
    setForm({
      name: provider.name, providerType: provider.providerType, baseUrl: provider.baseUrl,
      apiKey: "", modelId: provider.modelId, role: provider.role, isDefault: provider.isDefault,
      capabilities: { ...provider.capabilities }
    });
    setNotice({ type: "info", text: "Leave API key empty to keep the currently saved key." });
  }

  function resetForm() { setEditingId(null); setForm(initialForm); setNotice(null); }

  async function saveProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setNotice(null);
    try {
      const result = await request(editingId ? `/api/ai/providers/${editingId}` : "/api/ai/providers", {
        method: editingId ? "PATCH" : "POST", body: JSON.stringify(form)
      });
      if (editingId) setProviders((current) => current.map((item) => item.id === editingId ? result.provider : item));
      else setProviders((current) => [...current, result.provider]);
      if (form.isDefault) setProviders((current) => current.map((item) => ({ ...item, isDefault: item.id === result.provider.id })));
      setNotice({ type: "success", text: editingId ? "Provider updated." : "Provider saved securely." });
      resetForm();
      await loadProviders();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save provider." });
    } finally { setSaving(false); }
  }

  async function testProvider(id: string) {
    setBusyId(id); setNotice(null);
    try {
      const result = await request(`/api/ai/providers/${id}/test`, { method: "POST" });
      setModels((current) => ({ ...current, [id]: result.models ?? [] }));
      setModelSelections((current) => ({ ...current, [id]: result.models?.[0] ?? "" }));
      setNotice({ type: "success", text: result.message });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Connection test failed." });
    } finally { setBusyId(null); }
  }

  async function saveSelectedModel(id: string) {
    const provider = providers.find((item) => item.id === id);
    const modelId = modelSelections[id];
    if (!provider || !modelId) return;
    setBusyId(id);
    try {
      await request(`/api/ai/providers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...provider, apiKey: "", modelId })
      });
      await loadProviders();
      setNotice({ type: "success", text: `Model changed to ${modelId}.` });
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not update model." }); }
    finally { setBusyId(null); }
  }

  async function deleteProvider(id: string) {
    if (!window.confirm("Delete this provider configuration? Its encrypted API key will also be deleted.")) return;
    setBusyId(id);
    try {
      await request(`/api/ai/providers/${id}`, { method: "DELETE" });
      setProviders((current) => current.filter((item) => item.id !== id));
      setNotice({ type: "success", text: "Provider deleted." });
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not delete provider." }); }
    finally { setBusyId(null); }
  }

  return (
    <main className="provider-shell">
      <header className="provider-topbar">
        <Link href="/" className="provider-brand"><span className="brand-mark">c.</span> carouseles</Link>
        <Link href="/" className="provider-back">← Back to workspace</Link>
      </header>
      <div className="provider-content">
        <div className="provider-heading">
          <div><div className="eyebrow">AI STUDIO / SETTINGS</div><h1>AI providers<span>.</span></h1><p>Connect your own models. Keep your keys private. Choose which model handles each role.</p></div>
          <span className="provider-count">{providers.length} CONFIGURED</span>
        </div>
        {notice && <div className={`provider-notice ${notice.type}`} role="status">{notice.text}</div>}
        <div className="provider-layout">
          <section className="provider-list-panel">
            <div className="provider-panel-heading"><div><h2>Your providers</h2><p>Credentials are encrypted before they reach the database.</p></div><span className="provider-icon">◈</span></div>
            {loading ? <div className="provider-empty">Loading providers…</div> : providers.length === 0 ? (
              <div className="provider-empty"><div className="provider-empty-icon">✳</div><b>No providers connected</b><span>Add an API provider to activate AI features.</span></div>
            ) : <div className="provider-cards">{providers.map((provider) => (
              <article className="provider-card" key={provider.id}>
                <div className="provider-card-top"><div className="provider-logo">{provider.providerType === "openai" ? "◎" : provider.providerType.slice(0, 1).toUpperCase()}</div><div className="provider-card-name"><b>{provider.name}</b><small>{provider.providerType} · {provider.role}</small></div>{provider.isDefault && <span className="default-tag">DEFAULT</span>}</div>
                <div className="provider-model">{provider.modelId}</div>
                <div className="provider-key"><span className="key-dot" /> API key saved ·••••••••</div>
                {models[provider.id]?.length > 0 && <div className="provider-model-picker"><select aria-label="Choose model" value={modelSelections[provider.id] ?? ""} onChange={(event) => setModelSelections((current) => ({ ...current, [provider.id]: event.target.value }))}>{models[provider.id].map((model) => <option key={model} value={model}>{model}</option>)}</select><button onClick={() => void saveSelectedModel(provider.id)} disabled={busyId === provider.id}>Use model</button></div>}
                <div className="provider-card-actions"><button onClick={() => void testProvider(provider.id)} disabled={busyId === provider.id}>{busyId === provider.id ? "Testing…" : "Test connection"}</button><button onClick={() => startEdit(provider)}>Edit</button><button className="danger-action" onClick={() => void deleteProvider(provider.id)} disabled={busyId === provider.id}>Delete</button></div>
              </article>
            ))}</div>}
            <div className="provider-security-note"><span>⌑</span><p>API keys are encrypted with AES-256-GCM on the server. Keys are never returned to the browser or written to application logs.</p></div>
          </section>
          <section className="provider-form-panel">
            <div className="provider-panel-heading"><div><h2>{editingId ? "Edit provider" : "Add a provider"}</h2><p>OpenAI-compatible chat completions API.</p></div></div>
            <form className="provider-form" onSubmit={saveProvider}>
              <label>Provider type<select value={form.providerType} onChange={(event) => selectPreset(event.target.value)}>{Object.entries(presets).map(([key, preset]) => <option value={key} key={key}>{preset.name}</option>)}</select></label>
              <label>Display name<input required maxLength={60} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Base URL<input required type="url" value={form.baseUrl} onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://api.example.com/v1" /></label>
              <label>API key<input type="password" autoComplete="new-password" value={form.apiKey} onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder={editingId ? "Leave empty to keep saved key" : "Paste your provider API key"} required={!editingId} /></label>
              <label>Model ID<input required value={form.modelId} onChange={(event) => setForm((current) => ({ ...current, modelId: event.target.value }))} placeholder="e.g. gpt-4o-mini" /></label>
              <label>Assigned role<select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as Role }))}><option value="writer">Writer · captions and copy</option><option value="planner">Planner · outline and flow</option><option value="designer">Designer · visual direction</option><option value="editor">Editor · refinement</option><option value="vision">Vision · image understanding</option></select></label>
              <div className="capability-block"><b>Model capabilities</b><div className="capability-grid">{Object.entries(capabilityLabels).map(([key, label]) => <label className="capability-option" key={key}><input type="checkbox" checked={Boolean(form.capabilities[key])} onChange={(event) => setForm((current) => ({ ...current, capabilities: { ...current.capabilities, [key]: event.target.checked } }))} />{label}</label>)}</div></div>
              <label className="default-option"><input type="checkbox" checked={form.isDefault} onChange={(event) => setForm((current) => ({ ...current, isDefault: event.target.checked }))} /> Set as default provider</label>
              <div className="provider-form-actions"><button className="provider-save" type="submit" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes ↗" : "Save provider ↗"}</button>{editingId && <button className="provider-cancel" type="button" onClick={resetForm}>Cancel</button>}</div>
            </form>
          </section>
        </div>
        <footer className="provider-footer"><span>CAROUSELES / AI PROVIDERS</span><span>BYOK · Provider agnostic</span></footer>
      </div>
    </main>
  );
}
