"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CarouselElement } from "@/lib/carousel-core/schema";
import type { SlideTextEdit } from "@/lib/carousel-core/ai-editing";

type Props = {
  elements: CarouselElement[];
  onApply: (edits: SlideTextEdit[]) => void;
};

export default function AiEditPanel({ elements, onApply }: Props) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const textElements = elements.filter((element) => element.type === "text");
  const disabled = busy || instruction.trim().length < 4 || textElements.length === 0;

  async function editSlide() {
    if (disabled) return;
    setBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase belum dikonfigurasi.");
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const token = data.session?.access_token;
      if (!token) throw new Error("Login dulu untuk memakai AI editor.");
      const response = await fetch("/api/ai/edit-slide", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          instruction: instruction.trim(),
          elements: textElements.map(({ id, content }) => ({ id, content }))
        })
      });
      const payload = await response.json() as { edits?: SlideTextEdit[]; error?: string };
      if (!response.ok || !payload.edits) throw new Error(payload.error ?? "AI gagal mengedit slide.");
      onApply(payload.edits);
      setMessage("Teks slide aktif berhasil diperbarui.");
      setInstruction("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI editing gagal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ border: "1px solid #e6e4ef", borderRadius: 12, padding: 12, marginTop: 14, background: "#faf9ff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
        <strong style={{ fontSize: 12, color: "#29263b" }}>✳ AI slide editor</strong>
        <span style={{ fontSize: 10, color: "#777" }}>TEXT ONLY</span>
      </div>
      <p style={{ fontSize: 11, lineHeight: 1.5, color: "#777", margin: "0 0 9px" }}>Minta AI memperbaiki copy slide aktif. Layout dan gambar tidak disentuh.</p>
      <textarea
        aria-label="AI editing instruction"
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        placeholder="Contoh: bikin headline lebih kuat dan body lebih singkat…"
        rows={3}
        maxLength={500}
        disabled={busy || textElements.length === 0}
        style={{ width: "100%", resize: "vertical", border: "1px solid #e2e0eb", borderRadius: 8, padding: 9, font: "inherit", fontSize: 11, background: "#fff", color: "#24232b" }}
      />
      <button type="button" onClick={editSlide} disabled={disabled} style={{ width: "100%", border: 0, borderRadius: 8, padding: "9px 10px", marginTop: 8, background: disabled ? "#b7b4c6" : "#29243f", color: "#fff", fontSize: 11, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer" }}>
        {busy ? "AI sedang mengedit…" : "Improve active slide ↗"}
      </button>
      {message && <p role="status" style={{ fontSize: 10, lineHeight: 1.5, color: message.startsWith("Perubahan") ? "#34734d" : "#a34444", margin: "8px 0 0" }}>{message}</p>}
    </section>
  );
}
