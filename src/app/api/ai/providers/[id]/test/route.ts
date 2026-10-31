import { NextResponse } from "next/server";
import { getUserContext, decryptApiKey, callProviderModels, type ProviderRow } from "@/lib/ai-providers/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const { supabase, user } = await getUserContext(request);
    const { id } = await context.params;
    const { data, error } = await supabase.from("carouseles_ai_providers")
      .select("id,user_id,base_url,api_key_ciphertext,api_key_iv,api_key_tag")
      .eq("id", id).eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Provider not found." }, { status: 404 });
    const row = data as Pick<ProviderRow, "api_key_ciphertext" | "api_key_iv" | "api_key_tag"> & { base_url: string };
    const models = await callProviderModels(row.base_url, decryptApiKey(row));
    return NextResponse.json({ success: true, models, message: `Connection successful. ${models.length} model(s) found.` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not connect to provider.";
    if (message === "AUTH_REQUIRED") return NextResponse.json({ error: "Sign in to test this provider." }, { status: 401 });
    if (message.includes("CAROUSELES_PROVIDER_ENCRYPTION_KEY")) return NextResponse.json({ error: "Provider encryption is not configured on the server." }, { status: 503 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
