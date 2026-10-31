import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isDraftBasedOnCloud } from "@/lib/carousel-core/draft-storage";
import {
  createEmptyCarouselDocument,
  validateCarouselDocument,
  type CarouselDocument
} from "@/lib/carousel-core/schema";

type CloudDocumentRow = { id: string; document: unknown; updated_at: string };
type CloudVersionRow = { id: string; updated_at: string };
const ASSET_BUCKET = "carouseles-assets";
const STORAGE_PREFIX = "storage://";
const uploadedImagePaths = new Map<string, string>();
const cloudVersions = new Map<string, string | null>();

export class CloudDraftConflictError extends Error {
  constructor() {
    super("This draft changed on another device. Your local copy is safe; reload the editor to compare versions.");
    this.name = "CloudDraftConflictError";
  }
}

function cloudVersionKey(userId: string, documentId: string) {
  return `${userId}:${documentId}`;
}

function nextCloudUpdatedAt(previousUpdatedAt: string | null) {
  const previousTime = previousUpdatedAt ? Date.parse(previousUpdatedAt) : 0;
  const nextTime = Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0);
  return new Date(nextTime).toISOString();
}

export type CloudBootstrap = { user: User; projectId: string; document: CarouselDocument; cloudUpdatedAt: string | null; localConflict: boolean };

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
      const cacheKey = `${userId}:${document.id}:${element.id}:${element.content}`;
      let storagePath = uploadedImagePaths.get(cacheKey);
      if (!storagePath) {
        // Immutable asset paths prevent a stale save from replacing an image
        // that is still referenced by the latest cloud document.
        storagePath = `${userId}/${document.id}/${encodeURIComponent(element.id)}/${crypto.randomUUID()}.${extension}`;
        const upload = await supabase.storage.from(ASSET_BUCKET).upload(storagePath, blob, {
          contentType: mimeType, upsert: false, cacheControl: "3600"
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
        uploadedImagePaths.set(cacheKey, storagePath);
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
  const updatedAt = nextCloudUpdatedAt(null);
  const result = await supabase.from("carouseles_documents").upsert({
    id: document.id, project_id: projectId, user_id: userId,
    title: document.title, document, schema_version: document.schemaVersion,
    updated_at: updatedAt
  }, { onConflict: "id" }).select("updated_at").single<{ updated_at: string }>();
  if (result.error) throw result.error;
  return result.data.updated_at;
}

export async function bootstrapCloudDocument(
  supabase: SupabaseClient,
  localDocument: { document: CarouselDocument; savedAt: number | null; baseCloudUpdatedAt: string | null } | null
): Promise<CloudBootstrap> {
  const auth = await supabase.auth.getUser();
  if (auth.error) throw auth.error;
  if (!auth.data.user) throw new Error("Sign in to sync your work.");
  const user = auth.data.user;
  const projectId = await getOrCreateProject(supabase, user.id);

  if (localDocument) {
    const existing = await supabase.from("carouseles_documents").select("id, document, updated_at")
      .eq("id", localDocument.document.id).eq("user_id", user.id).maybeSingle<CloudDocumentRow>();
    if (existing.error) throw existing.error;
    const versionKey = cloudVersionKey(user.id, localDocument.document.id);
    if (existing.data?.document) {
      cloudVersions.set(versionKey, existing.data.updated_at);
      if (isDraftBasedOnCloud(localDocument, existing.data.updated_at)) {
        const updatedAt = await saveCloudDocument(supabase, projectId, user.id, localDocument.document);
        return { user, projectId, document: localDocument.document, cloudUpdatedAt: updatedAt, localConflict: false };
      }
      const parsed = validateCarouselDocument(existing.data.document);
      // Compare equivalent representations: cloud images are storage:// references,
      // while local drafts contain hydrated data URLs.
      const cloudDocument = await hydrateDocumentImages(supabase, parsed);
      const localConflict = JSON.stringify(localDocument.document) !== JSON.stringify(cloudDocument);
      return { user, projectId, document: cloudDocument, cloudUpdatedAt: existing.data.updated_at, localConflict };
    }
    cloudVersions.set(versionKey, null);
    const updatedAt = await saveCloudDocument(supabase, projectId, user.id, localDocument.document);
    return { user, projectId, document: localDocument.document, cloudUpdatedAt: updatedAt, localConflict: false };
  }

  const latest = await supabase.from("carouseles_documents").select("id, document, updated_at")
    .eq("user_id", user.id).order("updated_at", { ascending: false })
    .limit(1).maybeSingle<CloudDocumentRow>();
  if (latest.error) throw latest.error;
  if (latest.data?.document) {
    const parsed = validateCarouselDocument(latest.data.document);
    cloudVersions.set(cloudVersionKey(user.id, latest.data.id), latest.data.updated_at);
    return { user, projectId, document: await hydrateDocumentImages(supabase, parsed), cloudUpdatedAt: latest.data.updated_at, localConflict: false };
  }

  const document = createEmptyCarouselDocument();
  const updatedAt = await saveDocument(supabase, projectId, user.id, document);
  cloudVersions.set(cloudVersionKey(user.id, document.id), updatedAt);
  return { user, projectId, document, cloudUpdatedAt: updatedAt, localConflict: false };
}

export async function saveCloudDocument(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  document: CarouselDocument
) {
  const versionKey = cloudVersionKey(userId, document.id);
  if (!cloudVersions.has(versionKey)) {
    throw new Error("Cloud version is not initialized. Reload the editor before saving.");
  }

  const expectedUpdatedAt = cloudVersions.get(versionKey) ?? null;
  const existing = await supabase.from("carouseles_documents").select("id, updated_at")
    .eq("id", document.id).eq("user_id", userId).maybeSingle<CloudVersionRow>();
  if (existing.error) throw existing.error;

  if (existing.data) {
    if (expectedUpdatedAt === null || !isDraftBasedOnCloud(
      { document, savedAt: null, baseCloudUpdatedAt: expectedUpdatedAt },
      existing.data.updated_at
    )) {
      throw new CloudDraftConflictError();
    }
  } else if (expectedUpdatedAt !== null) {
    throw new CloudDraftConflictError();
  }

  // Ensure the owning row exists before inserting asset metadata.
  let expectedForUpdate = existing.data?.updated_at ?? null;
  if (!existing.data) {
    expectedForUpdate = nextCloudUpdatedAt(null);
    const created = await supabase.from("carouseles_documents").insert({
      id: document.id, project_id: projectId, user_id: userId,
      title: document.title, document, schema_version: document.schemaVersion,
      updated_at: expectedForUpdate
    });
    if (created.error) {
      if (created.error.code === "23505") throw new CloudDraftConflictError();
      throw created.error;
    }
  }

  const cloudDocument = await uploadDocumentImages(supabase, userId, document);
  const updatedAt = nextCloudUpdatedAt(expectedForUpdate);
  const saved = await supabase.from("carouseles_documents").update({
    project_id: projectId, title: cloudDocument.title, document: cloudDocument,
    schema_version: cloudDocument.schemaVersion, updated_at: updatedAt
  }).eq("id", document.id).eq("user_id", userId).eq("updated_at", expectedForUpdate)
    .select("updated_at").maybeSingle<{ updated_at: string }>();
  if (saved.error) throw saved.error;
  if (!saved.data?.updated_at) throw new CloudDraftConflictError();

  cloudVersions.set(versionKey, saved.data.updated_at);
  return saved.data.updated_at;
}
