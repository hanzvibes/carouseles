import { NextResponse } from "next/server";
import { providerInputSchema } from "@/lib/ai-providers/schema";
import { encryptApiKey, getUserContext, publicProvider, validateProviderBaseUrl, type ProviderRow } from "@/lib/ai-providers/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  if (message === "AUTH_REQUIRED") return NextResponse.json({ error: "Sign in to manage AI providers." }, { status: 401 });
  if (message.includes("CAROUSELES_PROVIDER_ENCRYPTION_KEY")) return NextResponse.json({ error: "Provider encryption is not configured on the server." }, { status: 503 });
  return NextResponse.json({ error: message }, { status: 400 });
}
export async function PATCH(request: Request, context: Context) {
  try {
    const { supabase, user } = await getUserContext(request);
    const { id } = await context.params;
    const parsed = providerInputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid provider settings." }, { status: 400 });
    const input = parsed.data;
    const safeBaseUrl = await validateProviderBaseUrl(input.baseUrl);
    if (input.isDefault) {
      const reset = await supabase.from("carouseles_ai_providers").update({ is_default: false }).eq("user_id", user.id);
      if (reset.error) throw reset.error;
    }
    const update: Record<string, unknown> = {
      name: input.name, provider_type: input.providerType, base_url: safeBaseUrl,
      model_id: input.modelId, role: input.role, capabilities: input.capabilities,
      is_default: input.isDefault, updated_at: new Date().toISOString()
    };
    if (input.apiKey) Object.assign(update, encryptApiKey(input.apiKey));
    const { data, error } = await supabase.from("carouseles_ai_providers").update(update)
      .eq("id", id).eq("user_id", user.id)
      .select("id,user_id,name,provider_type,base_url,api_key_ciphertext,api_key_iv,api_key_tag,model_id,role,capabilities,is_default,created_at,updated_at").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Provider not found." }, { status: 404 });
    return NextResponse.json({ provider: publicProvider(data as ProviderRow) });
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const { supabase, user } = await getUserContext(request);
    const { id } = await context.params;
    const { error, count } = await supabase.from("carouseles_ai_providers").delete({ count: "exact" })
      .eq("id", id).eq("user_id", user.id);
    if (error) throw error;
    if (!count) return NextResponse.json({ error: "Provider not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) { return errorResponse(error); }
}
