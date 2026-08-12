"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import { documentUploadSchema, parseFormData } from "@/lib/validations";
import type { Document, Profile } from "@/types/database";

export interface DocumentWithUploader extends Document {
  uploader?: Pick<Profile, "full_name"> | null;
}

const BUCKET_NAME = "documents";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function logAudit(
  supabase: SupabaseServerClient,
  userId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown>
) {
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
  });
}

export async function getDocuments(
  entityType: string,
  entityId?: string
): Promise<{ data: DocumentWithUploader[] | null; error: string | null }> {
  const supabase = await createClient();
  const currentUser = await getCurrentUser();

  if (!currentUser) return { data: null, error: "Unauthorized" };

  let query = supabase
    .from("documents")
    .select(`
      *,
      uploader:profiles!documents_uploaded_by_fkey(full_name)
    `)
    .eq("entity_type", entityType)
    .order("created_at", { ascending: false });

  if (entityId) {
    query = query.eq("entity_id", entityId);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };

  return { data: data as DocumentWithUploader[], error: null };
}

export async function uploadDocument(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Unauthorized" };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { error: "Valid file is required" };
  }

  const parsed = parseFormData(documentUploadSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();

  // Create unique file path
  const fileExt = file.name.split(".").pop();
  const fileName = `${parsed.data.entity_type}/${parsed.data.entity_id || "general"}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

  // 1. Upload to storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    return { error: `Storage error: ${uploadError.message}` };
  }

  // 2. Insert DB record
  const { data: docData, error: dbError } = await supabase
    .from("documents")
    .insert({
      name: parsed.data.name,
      file_url: fileName,
      file_type: file.type || null,
      file_size: file.size,
      category: parsed.data.category,
      entity_type: parsed.data.entity_type,
      entity_id: parsed.data.entity_id,
      notes: parsed.data.notes,
      uploaded_by: currentUser.id,
    })
    .select("id")
    .single();

  if (dbError) {
    // Attempt to clean up storage if DB insert fails
    await supabase.storage.from(BUCKET_NAME).remove([fileName]);
    return { error: dbError.message };
  }

  // 3. Audit log
  await logAudit(
    supabase,
    currentUser.id,
    "document_upload",
    parsed.data.entity_type,
    parsed.data.entity_id,
    { document_id: docData.id, file_name: parsed.data.name, size: file.size }
  );

  // Revalidate relevant path based on entity
  if (parsed.data.entity_id) {
    let route = "";
    switch (parsed.data.entity_type) {
      case "project": route = `/projects/${parsed.data.entity_id}`; break;
      case "customer": route = `/customers/${parsed.data.entity_id}`; break;
      case "employee": route = `/employees/${parsed.data.entity_id}`; break;
      case "quotation": route = `/quotations/${parsed.data.entity_id}`; break;
      case "invoice": route = `/billing/${parsed.data.entity_id}`; break;
      case "expense": route = `/expenses/${parsed.data.entity_id}`; break;
    }
    if (route) revalidatePath(route);
  }

  return { error: null };
}

export async function deleteDocument(id: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Unauthorized" };

  const supabase = await createClient();

  // 1. Get document details
  const { data: doc, error: fetchError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !doc) {
    return { error: "Document not found" };
  }

  // Permission check: only admin/manager or uploader
  if (currentUser.role === "employee" && doc.uploaded_by !== currentUser.id) {
    return { error: "Unauthorized to delete this document" };
  }

  // 2. Remove from Storage
  if (doc.file_url) {
    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([doc.file_url]);
    
    if (storageError) {
      console.error("Storage deletion failed:", storageError);
      // We proceed to delete from DB anyway to avoid zombie records if storage file is already missing
    }
  }

  // 3. Delete from DB
  const { error: dbError } = await supabase
    .from("documents")
    .delete()
    .eq("id", id);

  if (dbError) return { error: dbError.message };

  // 4. Audit Log
  await logAudit(
    supabase,
    currentUser.id,
    "document_delete",
    doc.entity_type || "general",
    doc.entity_id,
    { document_id: id, file_name: doc.name }
  );

  // Attempt to revalidate
  if (doc.entity_id) {
    let route = "";
    switch (doc.entity_type) {
      case "project": route = `/projects/${doc.entity_id}`; break;
      case "customer": route = `/customers/${doc.entity_id}`; break;
      case "employee": route = `/employees/${doc.entity_id}`; break;
      case "quotation": route = `/quotations/${doc.entity_id}`; break;
      case "invoice": route = `/billing/${doc.entity_id}`; break;
      case "expense": route = `/expenses/${doc.entity_id}`; break;
    }
    if (route) revalidatePath(route);
  }

  return { error: null };
}

export async function getSignedUrl(path: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { data: null, error: "Unauthorized" };

  const supabase = await createClient();

  // Generate a signed URL valid for 60 seconds (1 minute)
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, 60);

  if (error) return { data: null, error: error.message };

  return { data: data.signedUrl, error: null };
}
