import { NextResponse } from "next/server";
import { getUserContext, decryptApiKey, callProviderChat, type ProviderRow } from "@/lib/ai-providers/server";
import { generationRequestSchema, generatedCarouselSchema, buildGeneratedCarousel, extractGeneratedJson } from "@/lib/carousel-core/generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const systemPrompt = `You are Carouseles, an expert Instagram carousel strategist and editorial designer.
Create useful, specific, engaging carousel content. Avoid filler, generic motivational phrases, and repeated ideas.
Return ONLY valid JSON with this exact shape:
{"title":"Short project title","slides":[{"headline":"Short slide headline","body":"Concise useful copy. Use newline characters for separate points.","background":"#25213f"}]}
Rules:
- Return exactly the requested number of slides.
- Slide 1 is a strong hook and sets the promise.
- Middle slides teach concrete points in a logical progression.
- Final slide gives a practical takeaway or clear CTA.
- Headlines should be punchy and readable. Body copy should fit a 1080x1350 social carousel.
- Use valid six-digit hex colors for backgrounds. Keep a coherent, high-contrast palette.
- Do not include markdown fences or any text outside JSON.`;

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Carousel generation failed.";
  if (message === "AUTH_REQUIRED") return NextResponse.json({ error: "Sign in to generate a carousel." }, { status: 401 });
  if (message.includes("CAROUSELES_PROVIDER_ENCRYPTION_KEY")) return NextResponse.json({ error: "Provider encryption is not configured on the server." }, { status: 503 });
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getUserContext(request);
    const parsed = generationRequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid generation request." }, { status: 400 });
    const input = parsed.data;

    const providerColumns = "id,user_id,base_url,api_key_ciphertext,api_key_iv,api_key_tag,model_id,role,capabilities,is_default,created_at,updated_at,name,provider_type";
    const plannerResult = await supabase.from("carouseles_ai_providers")
      .select(providerColumns).eq("user_id", user.id).eq("role", "planner")
      .order("is_default", { ascending: false }).order("created_at", { ascending: true })
      .limit(1).maybeSingle();
    if (plannerResult.error) throw plannerResult.error;

    // A user's default text provider is a safe fallback for a first-run experience.
    const providerResult = plannerResult.data ? plannerResult : await supabase.from("carouseles_ai_providers")
      .select(providerColumns).eq("user_id", user.id).eq("is_default", true)
      .limit(1).maybeSingle();
    if (providerResult.error) throw providerResult.error;
    if (!providerResult.data) return NextResponse.json({ error: "Connect an AI provider and mark it as the default, or assign one to the Planner role." }, { status: 404 });

    const provider = providerResult.data as ProviderRow;
    if (!provider.capabilities?.text) return NextResponse.json({ error: "Your Planner provider does not support text generation." }, { status: 400 });
    const content = await callProviderChat(provider.base_url, decryptApiKey(provider), provider.model_id, [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Topic: ${input.prompt}\nRequested slides: ${input.slideCount}\nTone: ${input.tone}\nAudience: ${input.audience || "General audience"}\nCreate the carousel now.` }
    ]);
    const generated = generatedCarouselSchema.parse(extractGeneratedJson(content));
    if (generated.slides.length !== input.slideCount) {
      throw new Error(`The model returned ${generated.slides.length} slides; ${input.slideCount} were requested. Please try again.`);
    }
    const document = buildGeneratedCarousel(generated, input);
    return NextResponse.json({ document }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
