import { NextResponse } from "next/server";
import { chatRequestSchema } from "@/lib/ai-providers/schema";
import { callProviderChat, decryptApiKey, getUserContext, type ProviderRow } from "@/lib/ai-providers/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getUserContext(request);
    const parsed = chatRequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid AI request." }, { status: 400 });
    const { providerId, role, messages } = parsed.data;
    let query = supabase.from("carouseles_ai_providers")
      .select("id,user_id,base_url,api_key_ciphertext,api_key_iv,api_key_tag,model_id,role,capabilities")
      .eq("user_id", user.id);
    if (providerId) query = query.eq("id", providerId);
    else if (role) query = query.eq("role", role).order("is_default", { ascending: false }).order("created_at", { ascending: true });
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: role ? `No provider is assigned to the ${role} role.` : "Provider not found." }, { status: 404 });
    const provider = data as Pick<ProviderRow, "api_key_ciphertext" | "api_key_iv" | "api_key_tag" | "base_url" | "model_id" | "role" | "capabilities">;
    if (role && provider.role !== role && !providerId) return NextResponse.json({ error: "No provider is assigned to this role." }, { status: 404 });
    if (!provider.capabilities?.text) return NextResponse.json({ error: "This provider is not configured for text generation." }, { status: 400 });
    const content = await callProviderChat(provider.base_url, decryptApiKey(provider), provider.model_id, messages);
    return NextResponse.json({ content, model: provider.model_id, role: provider.role }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed.";
    if (message === "AUTH_REQUIRED") return NextResponse.json({ error: "Sign in to use AI providers." }, { status: 401 });
    if (message.includes("CAROUSELES_PROVIDER_ENCRYPTION_KEY")) return NextResponse.json({ error: "Provider encryption is not configured on the server." }, { status: 503 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
