"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import { companySettingsSchema } from "@/lib/validations";
import type { CompanySettings } from "@/types/database";

/**
 * Get company settings
 */
export async function getCompanySettings(): Promise<{
  data: CompanySettings | null;
  error: string | null;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("company_settings")
    .select("*")
    .limit(1)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as CompanySettings, error: null };
}

/**
 * Update company settings (Admin only)
 */
export async function updateCompanySettings(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "owner") {
    return { error: "Unauthorized. Only admins can modify settings." };
  }

  // Build raw object from form data
  const raw: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    const strVal = String(value);
    if (key === "default_gst_percent") {
      raw[key] = Number(strVal) || 18;
    } else {
      raw[key] = strVal;
    }
  });

  const parsed = companySettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();

  // Get the existing settings row ID
  const { data: existing } = await supabase
    .from("company_settings")
    .select("id")
    .limit(1)
    .single();

  if (!existing) {
    return { error: "Settings not found. Please ensure the database migrations have been run." };
  }

  const { error } = await supabase
    .from("company_settings")
    .update(parsed.data as Record<string, unknown>)
    .eq("id", (existing as { id: string }).id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings");
  return { error: null };
}
