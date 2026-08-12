"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import {
  createProjectSchema,
  updateProjectSchema,
  projectAssignmentSchema,
  parseFormData,
  sanitizeSearchInput,
} from "@/lib/validations";
import type {
  Project,
  ProjectAssignment,
  Profile,
} from "@/types/database";

export interface ProjectWithRelations extends Project {
  assignments?: (ProjectAssignment & { profile?: Pick<Profile, "full_name" | "role" | "employee_id"> | null })[];
  _count?: {
    work_logs: number;
    expenses: number;
  };
}

/**
 * Fetch all projects with filtering
 */
export async function getProjects(params?: {
  search?: string;
  status?: string;
  district?: string;
  assignee_id?: string;
}): Promise<{
  data: ProjectWithRelations[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const currentUser = await getCurrentUser();

  if (!currentUser) return { data: null, error: "Unauthorized" };

  let query = supabase
    .from("projects")
    .select(`
      *,
      assignments:project_assignments(
        id, role_in_project,
        profile:profiles!project_assignments_employee_id_fkey(full_name, role, employee_id)
      )
    `)
    .order("created_at", { ascending: false });

  // If employee/supervisor, only show their assigned projects unless they are manager/admin
  if (currentUser.role === "employee" || currentUser.role === "supervisor") {
    query = query.eq("project_assignments.employee_id", currentUser.id);
  } else if (params?.assignee_id) {
    query = query.eq("project_assignments.employee_id", params.assignee_id);
  }

  if (params?.search) {
    const safe = sanitizeSearchInput(params.search);
    if (safe) {
      query = query.or(
        `name.ilike.%${safe}%,project_code.ilike.%${safe}%,client_company.ilike.%${safe}%`
      );
    }
  }

  if (params?.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  if (params?.district && params.district !== "all") {
    query = query.eq("district", params.district);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  // Filter out projects if employee filter was applied (PostgREST inner join quirk workaround)
  let filteredData = data as ProjectWithRelations[];
  if (currentUser.role === "employee" || currentUser.role === "supervisor") {
    filteredData = filteredData.filter(
      (p) => p.assignments && p.assignments.length > 0
    );
  } else if (params?.assignee_id) {
    filteredData = filteredData.filter((p) =>
      p.assignments?.some((a) => a.employee_id === params.assignee_id)
    );
  }

  return { data: filteredData, error: null };
}

/**
 * Get a single project by ID with all relations
 */
export async function getProject(
  id: string
): Promise<{ data: ProjectWithRelations | null; error: string | null }> {
  const supabase = await createClient();
  const currentUser = await getCurrentUser();

  if (!currentUser) return { data: null, error: "Unauthorized" };

  const { data, error } = await supabase
    .from("projects")
    .select(`
      *,
      assignments:project_assignments(
        id, employee_id, role_in_project, assigned_date,
        profile:profiles!project_assignments_employee_id_fkey(full_name, role, employee_id)
      )
    `)
    .eq("id", id)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as ProjectWithRelations, error: null };
}

/**
 * Create a new project
 */
export async function createProject(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized. Only admins and managers can create projects." };
  }

  const parsed = parseFormData(createProjectSchema, formData);
  if (!parsed.success) {
    return { error: parsed.error };
  }

  const supabase = await createClient();

  // Generate sequence
  const { data: seqData, error: seqError } = await supabase.rpc(
    "next_sequence",
    { seq_name: "project_code", prefix: "PRJ" }
  );

  const project_code = seqError
    ? `PRJ-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
    : (seqData as string);

  const insertData = {
    ...parsed.data,
    project_code,
    created_by: currentUser.id,
  };

  const { data, error } = await supabase
    .from("projects")
    .insert(insertData)
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  const prjId = (data as { id: string }).id;

  revalidatePath("/projects");
  return { data: { id: prjId, project_code }, error: null };
}

/**
 * Update an existing project
 */
export async function updateProject(id: string, formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized. Only admins and managers can edit projects." };
  }

  const parsed = parseFormData(updateProjectSchema, formData);
  if (!parsed.success) {
    return { error: parsed.error };
  }

  const supabase = await createClient();

  const updates = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { error: null };
}

/**
 * Assign an employee to a project
 */
export async function assignEmployeeToProject(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized." };
  }

  const parsed = parseFormData(projectAssignmentSchema, formData);
  if (!parsed.success) {
    return { error: parsed.error };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("project_assignments")
    .insert({
      project_id: parsed.data.project_id,
      employee_id: parsed.data.employee_id,
      role_in_project: parsed.data.role_in_project,
      assigned_date: parsed.data.assigned_date || new Date().toISOString().split('T')[0],
      is_active: true
    });

  if (error) {
    if (error.code === "23505") { // unique constraint
      return { error: "Employee is already assigned to this project." };
    }
    return { error: error.message };
  }

  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { error: null };
}

/**
 * Remove an employee assignment from a project
 */
export async function removeProjectAssignment(assignment_id: string, project_id: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("project_assignments")
    .delete()
    .eq("id", assignment_id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/projects/${project_id}`);
  return { error: null };
}

/**
 * Get available employees for assignment
 */
export async function getAvailableEmployeesForProject(): Promise<{
  data: { id: string; full_name: string; employee_id: string; role: string; employee_type: string }[] | null;
  error: string | null;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, employee_id, role, employee_type")
    .eq("is_active", true)
    .order("full_name");

  if (error) return { data: null, error: error.message };
  return {
    data: data as { id: string; full_name: string; employee_id: string; role: string; employee_type: string }[],
    error: null,
  };
}
