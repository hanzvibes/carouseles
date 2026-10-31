import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  createEmptyCarouselDocument,
  validateCarouselDocument,
  type CarouselDocument
} from "@/lib/carousel-core/schema";

type CloudDocumentRow = {
  id: string;
  document: unknown;
};

export type CloudBootstrap = {
  user: User;
  projectId: string;
  document: CarouselDocument;
};

async function getOrCreateProject(supabase: SupabaseClient, userId: string) {
  const existing = await supabase
    .from("carouseles_projects")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data?.id) return existing.data.id as string;

  const created = await supabase
    .from("carouseles_projects")
    .insert({ user_id: userId, name: "My Carouseles" })
    .select("id")
    .single();

  if (created.error) throw created.error;
  return created.data.id as string;
}

async function saveDocument(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  document: CarouselDocument
) {
  const result = await supabase.from("carouseles_documents").upsert(
    {
      id: document.id,
      project_id: projectId,
      user_id: userId,
      title: document.title,
      document,
      schema_version: document.schemaVersion,
      updated_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );

  if (result.error) throw result.error;
}

export async function bootstrapCloudDocument(
  supabase: SupabaseClient,
  localDocument: CarouselDocument | null
): Promise<CloudBootstrap> {
  const auth = await supabase.auth.getUser();
  if (auth.error) throw auth.error;
  if (!auth.data.user) throw new Error("Sign in to sync your work.");

  const user = auth.data.user;
  const projectId = await getOrCreateProject(supabase, user.id);

  if (localDocument) {
    const existing = await supabase
      .from("carouseles_documents")
      .select("id, document")
      .eq("id", localDocument.id)
      .eq("user_id", user.id)
      .maybeSingle<CloudDocumentRow>();

    if (existing.error) throw existing.error;

    if (existing.data?.document) {
      return {
        user,
        projectId,
        document: validateCarouselDocument(existing.data.document)
      };
    }

    await saveDocument(supabase, projectId, user.id, localDocument);
    return { user, projectId, document: localDocument };
  }

  const latest = await supabase
    .from("carouseles_documents")
    .select("id, document")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<CloudDocumentRow>();

  if (latest.error) throw latest.error;
  if (latest.data?.document) {
    return {
      user,
      projectId,
      document: validateCarouselDocument(latest.data.document)
    };
  }

  const document = createEmptyCarouselDocument();
  await saveDocument(supabase, projectId, user.id, document);
  return { user, projectId, document };
}

export async function saveCloudDocument(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  document: CarouselDocument
) {
  await saveDocument(supabase, projectId, userId, document);
}
