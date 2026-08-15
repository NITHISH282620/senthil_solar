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

/**
 * Write an audit row.
 *
 * The columns are table_name / record_id / new_values, and `action` is
 * constrained to insert|update|delete|restore|login|export — so the earlier
 * shape (entity_type, entity_id, details, action 'document_upload') was
 * rejected on every call. Nothing surfaced it, because the result was never
 * inspected: the audit trail §23 requires was silently empty.
 *
 * Failures are logged rather than thrown. An audit write must not roll back
 * the user's actual work, but it must not vanish either.
 */
async function logAudit(
  supabase: SupabaseServerClient,
  userId: string,
  action: "insert" | "update" | "delete" | "restore" | "login" | "export",
  tableName: string,
  recordId: string | null,
  details: Record<string, unknown>
) {
  const { error } = await supabase.from("audit_logs").insert({
    user_id: userId,
    action,
    table_name: tableName,
    record_id: recordId,
    new_values: details,
  });

  if (error) {
    console.error("Audit log write failed:", error.message, {
      action,
      tableName,
      recordId,
    });
  }
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
    .is("deleted_at", null)
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
      file_path: fileName,
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
  await logAudit(supabase, currentUser.id, "insert", "documents", docData.id, {
    entity_type: parsed.data.entity_type,
    entity_id: parsed.data.entity_id,
    file_name: parsed.data.name,
    size: file.size,
  });

  // Revalidate relevant path based on entity
  if (parsed.data.entity_id) {
    let route = "";
    switch (parsed.data.entity_type) {
      case "contract": route = `/contracts/${parsed.data.entity_id}`; break;
      case "company": route = `/companies/${parsed.data.entity_id}`; break;
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

  if (doc.deleted_at) {
    return { error: "That document has already been removed." };
  }

  // Permission check: only admin/manager or uploader
  if (currentUser.role === "worker" && doc.uploaded_by !== currentUser.id) {
    return { error: "Unauthorized to delete this document" };
  }

  // 2. Soft delete. The house rule (§23) is that records are withdrawn, not
  // destroyed, and the stored file is deliberately left in place — removing it
  // would make the soft delete unrecoverable and defeat the point.
  const { error: dbError } = await supabase
    .from("documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (dbError) return { error: dbError.message };

  // 4. Audit Log
  await logAudit(supabase, currentUser.id, "delete", "documents", id, {
    entity_type: doc.entity_type ?? "general",
    entity_id: doc.entity_id,
    file_name: doc.name,
  });

  // Attempt to revalidate
  if (doc.entity_id) {
    let route = "";
    switch (doc.entity_type) {
      case "contract": route = `/contracts/${doc.entity_id}`; break;
      case "company": route = `/companies/${doc.entity_id}`; break;
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
