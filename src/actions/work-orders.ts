"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import {
  createWorkOrderSchema,
  updateWorkOrderSchema,
  workOrderStatusSchema,
  workOrderUpdateSchema,
  parseFormData,
  sanitizeSearchInput,
} from "@/lib/validations";
import { z } from "zod";
import type {
  WorkOrder,
  WorkOrderAssignment,
  WorkOrderUpdate,
  Customer,
  Quotation,
  Profile,
} from "@/types/database";

export interface WorkOrderWithRelations extends WorkOrder {
  customer?: Pick<Customer, "id" | "name" | "customer_id" | "address" | "city" | "phone"> | null;
  quotation?: Pick<Quotation, "id" | "quotation_number" | "title"> | null;
  assignments?: (WorkOrderAssignment & { profile?: Pick<Profile, "full_name" | "role" | "employee_id"> | null })[];
  updates?: (WorkOrderUpdate & { profile?: Pick<Profile, "full_name" | "avatar_url"> | null })[];
}

/**
 * Fetch all work orders with filtering
 */
export async function getWorkOrders(params?: {
  search?: string;
  status?: string;
  type?: string;
  priority?: string;
  assignee_id?: string;
}): Promise<{
  data: WorkOrderWithRelations[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const currentUser = await getCurrentUser();

  if (!currentUser) return { data: null, error: "Unauthorized" };

  let query = supabase
    .from("work_orders")
    .select(`
      *,
      customer:customers!work_orders_customer_id_fkey(id, name, customer_id),
      quotation:quotations!work_orders_quotation_id_fkey(id, quotation_number, title),
      assignments:work_order_assignments(
        id, role,
        profile:profiles!work_order_assignments_employee_id_fkey(full_name, role, employee_id)
      )
    `)
    .order("created_at", { ascending: false });

  // If employee, only show their assigned work orders unless they are manager/admin
  if (currentUser.role === "employee") {
    query = query.eq("work_order_assignments.employee_id", currentUser.id);
  } else if (params?.assignee_id) {
    // Admins/managers can filter by assignee
    query = query.eq("work_order_assignments.employee_id", params.assignee_id);
  }

  if (params?.search) {
    const safe = sanitizeSearchInput(params.search);
    if (safe) {
      query = query.or(
        `title.ilike.%${safe}%,work_order_number.ilike.%${safe}%`
      );
    }
  }

  if (params?.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  if (params?.type && params.type !== "all") {
    query = query.eq("type", params.type);
  }

  if (params?.priority && params.priority !== "all") {
    query = query.eq("priority", params.priority);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  // Filter out work orders if employee filter was applied (PostgREST inner join quirk workaround for array relations)
  let filteredData = data as WorkOrderWithRelations[];
  if (currentUser.role === "employee") {
    filteredData = filteredData.filter(
      (wo) => wo.assignments && wo.assignments.length > 0
    );
  } else if (params?.assignee_id) {
    filteredData = filteredData.filter((wo) =>
      wo.assignments?.some((a) => a.employee_id === params.assignee_id)
    );
  }

  return { data: filteredData, error: null };
}

/**
 * Get a single work order by ID with all relations
 */
export async function getWorkOrder(
  id: string
): Promise<{ data: WorkOrderWithRelations | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("work_orders")
    .select(`
      *,
      customer:customers!work_orders_customer_id_fkey(id, name, customer_id, phone, address, city),
      quotation:quotations!work_orders_quotation_id_fkey(id, quotation_number, title, system_capacity_kw),
      assignments:work_order_assignments(
        id, employee_id, role,
        profile:profiles!work_order_assignments_employee_id_fkey(full_name, role, employee_id)
      ),
      updates:work_order_updates(
        id, update_type, content, photo_url, created_at,
        profile:profiles!work_order_updates_employee_id_fkey(full_name, avatar_url)
      )
    `)
    .eq("id", id)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  // Sort updates by created_at desc
  const wo = data as WorkOrderWithRelations;
  if (wo.updates) {
    wo.updates.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  return { data: wo, error: null };
}

/**
 * Create a new work order
 */
export async function createWorkOrder(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized. Only admins and managers can create work orders." };
  }

  const parsed = parseFormData(createWorkOrderSchema, formData);
  if (!parsed.success) {
    return { error: parsed.error };
  }

  const supabase = await createClient();

  // Generate sequence
  const { data: seqData, error: seqError } = await supabase.rpc(
    "next_sequence",
    { seq_name: "work_order", prefix: "WO" }
  );

  const work_order_number = seqError
    ? `WO-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
    : (seqData as string);

  const insertData = {
    ...parsed.data,
    work_order_number,
    created_by: currentUser.id,
  };

  const { data, error } = await supabase
    .from("work_orders")
    .insert(insertData)
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  const woId = (data as { id: string }).id;

  // If created from quotation, also update quotation status to converted
  if (parsed.data.quotation_id) {
    await supabase
      .from("quotations")
      .update({ status: "converted", updated_at: new Date().toISOString() })
      .eq("id", parsed.data.quotation_id);
  }

  revalidatePath("/work-orders");
  return { data: { id: woId, work_order_number }, error: null };
}

/**
 * Update an existing work order
 */
export async function updateWorkOrder(id: string, formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Unauthorized" };

  // Employees can only update if assigned, but we enforce this mostly in RLS.
  // We'll trust RLS for row-level permissions here.

  const parsed = parseFormData(updateWorkOrderSchema, formData);
  if (!parsed.success) {
    return { error: parsed.error };
  }

  const supabase = await createClient();

  const updates = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("work_orders")
    .update(updates)
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/work-orders");
  revalidatePath(`/work-orders/${id}`);
  return { error: null };
}

/**
 * Assign an employee to a work order
 */
export async function assignEmployee(work_order_id: string, employee_id: string, role: string = "technician") {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("work_order_assignments")
    .insert({
      work_order_id,
      employee_id,
      role,
    });

  if (error) {
    // 23505 is unique constraint violation
    if (error.code === "23505") {
      return { error: "Employee is already assigned to this work order." };
    }
    return { error: error.message };
  }

  revalidatePath(`/work-orders/${work_order_id}`);
  return { error: null };
}

/**
 * Remove an employee assignment
 */
export async function removeAssignment(assignment_id: string, work_order_id: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("work_order_assignments")
    .delete()
    .eq("id", assignment_id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/work-orders/${work_order_id}`);
  return { error: null };
}

/**
 * Post an update or status change to the work order timeline
 */
export async function addWorkOrderUpdate(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Unauthorized." };

  const work_order_id = formData.get("work_order_id") as string;
  if (!work_order_id) return { error: "Work Order ID is required." };

  const parsed = parseFormData(workOrderUpdateSchema, formData);
  if (!parsed.success) {
    return { error: parsed.error };
  }

  const supabase = await createClient();

  // If status change, update the work order status as well
  if (parsed.data.update_type === "status_change" && parsed.data.content) {
    // The new status should be passed in content for status_change type
    const newStatus = parsed.data.content;
    const statusCheck = workOrderStatusSchema.safeParse({ status: newStatus });
    
    if (statusCheck.success) {
      const woUpdate: Record<string, unknown> = {
        status: statusCheck.data.status,
        updated_at: new Date().toISOString()
      };
      
      // Auto-set timestamps based on status
      if (statusCheck.data.status === "in_progress") {
        woUpdate.started_at = new Date().toISOString();
      } else if (statusCheck.data.status === "completed") {
        woUpdate.completed_at = new Date().toISOString();
      }
      
      const { error: woError } = await supabase
        .from("work_orders")
        .update(woUpdate)
        .eq("id", work_order_id);
        
      if (woError) return { error: woError.message };
    }
  }

  // Insert the update timeline record
  const { error } = await supabase
    .from("work_order_updates")
    .insert({
      work_order_id,
      employee_id: currentUser.id,
      ...parsed.data
    });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/work-orders/${work_order_id}`);
  revalidatePath("/work-orders");
  return { error: null };
}

/**
 * Get available technicians/employees for assignment
 */
export async function getAvailableEmployees(): Promise<{
  data: { id: string; full_name: string; employee_id: string; role: string }[] | null;
  error: string | null;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, employee_id, role")
    .eq("is_active", true)
    .order("full_name");

  if (error) return { data: null, error: error.message };
  return {
    data: data as { id: string; full_name: string; employee_id: string; role: string }[],
    error: null,
  };
}
