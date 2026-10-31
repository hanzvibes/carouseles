"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createSupabaseBrowserClient();

    if (!supabase) {
      setStatus("Supabase belum dikonfigurasi. Tambahkan environment variables terlebih dahulu.");
      return;
    }

    setLoading(true);
    setStatus("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/editor` }
    });
    setLoading(false);
    setStatus(error ? error.message : "Magic link terkirim. Periksa inbox email kamu.");
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link href="/" className="auth-brand"><span className="brand-mark">c.</span> carouseles</Link>
        <div className="eyebrow">YOUR CREATIVE WORKSPACE</div>
        <h1>Pick up where<br /><em>ideas begin.</em></h1>
        <p>Masuk dengan email. Kami akan mengirim tautan login tanpa password.</p>
        <form onSubmit={sendMagicLink}>
          <label htmlFor="email">Email address</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          <button type="submit" disabled={loading}>{loading ? "Sending link…" : "Continue with email ↗"}</button>
        </form>
        {status && <p className="auth-status" role="status">{status}</p>}
        <Link href="/" className="auth-back">← Back to workspace</Link>
      </section>
    </main>
  );
}
