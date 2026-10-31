import { NextResponse } from "next/server";
import { providerInputSchema } from "@/lib/ai-providers/schema";
import { encryptApiKey, getUserContext, publicProvider, validateProviderBaseUrl, type ProviderRow } from "@/lib/ai-providers/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  if (message === "AUTH_REQUIRED") return NextResponse.json({ error: "Sign in to manage AI providers." }, { status: 401 });
  if (message.includes("CAROUSELES_PROVIDER_ENCRYPTION_KEY")) return NextResponse.json({ error: "Provider encryption is not configured on the server." }, { status: 503 });
  return NextResponse.json({ error: message }, { status: 400 });
}
export async function GET(request: Request) {
  try {
    const { supabase, user } = await getUserContext(request);
    const { data, error } = await supabase.from("carouseles_ai_providers")
      .select("id,user_id,name,provider_type,base_url,api_key_ciphertext,api_key_iv,api_key_tag,model_id,role,capabilities,is_default,created_at,updated_at")
      .eq("user_id", user.id).order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ providers: (data as ProviderRow[]).map(publicProvider) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const { supabase, user } = await getUserContext(request);
    const parsed = providerInputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid provider settings." }, { status: 400 });
    const input = parsed.data;
    const safeBaseUrl = await validateProviderBaseUrl(input.baseUrl);
    if (!input.apiKey) return NextResponse.json({ error: "API key is required for a new provider." }, { status: 400 });
    if (input.isDefault) {
      const reset = await supabase.from("carouseles_ai_providers").update({ is_default: false }).eq("user_id", user.id);
      if (reset.error) throw reset.error;
    }
    const encrypted = encryptApiKey(input.apiKey);
    const { data, error } = await supabase.from("carouseles_ai_providers").insert({
      user_id: user.id, name: input.name, provider_type: input.providerType,
      base_url: safeBaseUrl, ...encrypted, model_id: input.modelId,
      role: input.role, capabilities: input.capabilities, is_default: input.isDefault
    }).select("id,user_id,name,provider_type,base_url,api_key_ciphertext,api_key_iv,api_key_tag,model_id,role,capabilities,is_default,created_at,updated_at").single();
    if (error) throw error;
    return NextResponse.json({ provider: publicProvider(data as ProviderRow) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
