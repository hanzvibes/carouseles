import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  createEmptyCarouselDocument,
  validateCarouselDocument,
  type CarouselDocument
} from "@/lib/carousel-core/schema";

type CloudDocumentRow = { id: string; document: unknown };
const ASSET_BUCKET = "carouseles-assets";
const STORAGE_PREFIX = "storage://";
const uploadedImageContent = new Map<string, string>();

export type CloudBootstrap = { user: User; projectId: string; document: CarouselDocument };

async function getOrCreateProject(supabase: SupabaseClient, userId: string) {
  const existing = await supabase.from("carouseles_projects").select("id")
    .eq("user_id", userId).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id) return existing.data.id as string;
  const created = await supabase.from("carouseles_projects")
    .insert({ user_id: userId, name: "My Carouseles" }).select("id").single();
  if (created.error) throw created.error;
  return created.data.id as string;
}

function extensionForMime(mimeType: string) {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "image/gif": "gif", "image/svg+xml": "svg"
  };
  const extension = extensions[mimeType];
  if (!extension) throw new Error(`Unsupported image type: ${mimeType}`);
  return extension;
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("Could not read image data.");
  return response.blob();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not load a cloud image."));
    reader.readAsDataURL(blob);
  });
}

async function uploadDocumentImages(
  supabase: SupabaseClient,
  userId: string,
  document: CarouselDocument
): Promise<CarouselDocument> {
  const pages = await Promise.all(document.pages.map(async (page) => ({
    ...page,
    elements: await Promise.all(page.elements.map(async (element) => {
      if (element.type !== "image" || !element.content.startsWith("data:")) return element;
      const blob = await dataUrlToBlob(element.content);
      if (blob.size === 0 || blob.size > 10 * 1024 * 1024) throw new Error("Image must be between 1 byte and 10 MB.");
      const mimeType = blob.type || "image/png";
      const extension = extensionForMime(mimeType);
      const storagePath = `${userId}/${document.id}/${encodeURIComponent(element.id)}.${extension}`;
      if (uploadedImageContent.get(storagePath) !== element.content) {
        const upload = await supabase.storage.from(ASSET_BUCKET).upload(storagePath, blob, {
          contentType: mimeType, upsert: true, cacheControl: "3600"
        });
        if (upload.error) throw upload.error;

        const metadata = await supabase.from("carouseles_assets").upsert({
          user_id: userId,
          document_id: document.id,
          storage_path: storagePath,
          file_name: `carousel-image.${extension}`,
          mime_type: mimeType,
          file_size: blob.size
        }, { onConflict: "storage_path" });
        if (metadata.error) throw metadata.error;
        uploadedImageContent.set(storagePath, element.content);
      }
      return { ...element, content: `${STORAGE_PREFIX}${storagePath}` };
    }))
  })));
  return { ...document, pages };
}

async function hydrateDocumentImages(supabase: SupabaseClient, document: CarouselDocument) {
  const pages = await Promise.all(document.pages.map(async (page) => ({
    ...page,
    elements: await Promise.all(page.elements.map(async (element) => {
      if (element.type !== "image" || !element.content.startsWith(STORAGE_PREFIX)) return element;
      const path = element.content.slice(STORAGE_PREFIX.length);
      try {
        const { data, error } = await supabase.storage.from(ASSET_BUCKET).download(path);
        if (error || !data) throw error ?? new Error("Cloud image was not found.");
        return { ...element, content: await blobToDataUrl(data) };
      } catch {
        // Keep the rest of the document editable if an individual asset is missing.
        return { ...element, content: "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%271080%27 height=%27620%27%3E%3Crect width=%27100%25%27 height=%27100%25%27 fill=%27%23eeeeee%27/%3E%3C/svg%3E" };
      }
    }))
  })));
  return { ...document, pages };
}

async function saveDocument(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  document: CarouselDocument
) {
  const result = await supabase.from("carouseles_documents").upsert({
    id: document.id, project_id: projectId, user_id: userId,
    title: document.title, document, schema_version: document.schemaVersion,
    updated_at: new Date().toISOString()
  }, { onConflict: "id" });
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
    const existing = await supabase.from("carouseles_documents").select("id, document")
      .eq("id", localDocument.id).eq("user_id", user.id).maybeSingle<CloudDocumentRow>();
    if (existing.error) throw existing.error;
    if (existing.data?.document) {
      const parsed = validateCarouselDocument(existing.data.document);
      return { user, projectId, document: await hydrateDocumentImages(supabase, parsed) };
    }
    await saveCloudDocument(supabase, projectId, user.id, localDocument);
    return { user, projectId, document: localDocument };
  }

  const latest = await supabase.from("carouseles_documents").select("id, document")
    .eq("user_id", user.id).order("updated_at", { ascending: false })
    .limit(1).maybeSingle<CloudDocumentRow>();
  if (latest.error) throw latest.error;
  if (latest.data?.document) {
    const parsed = validateCarouselDocument(latest.data.document);
    return { user, projectId, document: await hydrateDocumentImages(supabase, parsed) };
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
  // Create the owning document first because asset metadata has a document FK.
  await saveDocument(supabase, projectId, userId, document);
  const cloudDocument = await uploadDocumentImages(supabase, userId, document);
  await saveDocument(supabase, projectId, userId, cloudDocument);
}
