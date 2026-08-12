import { z } from "zod";

// ─── Shared ──────────────────────────────────────────────

/**
 * Sanitize search input to prevent PostgREST filter injection.
 * Strips characters that have special meaning in PostgREST filter syntax.
 */
export function sanitizeSearchInput(input: string): string {
  return input.replace(/[.,()!]/g, "").trim();
}

const uuidSchema = z.string().uuid("Invalid ID format");

const phoneSchema = z
  .string()
  .regex(/^\d{10,12}$/, "Phone must be 10-12 digits")
  .or(z.literal(""))
  .optional()
  .transform((v) => v || null);

const emailSchema = z
  .string()
  .email("Invalid email address")
  .or(z.literal(""))
  .optional()
  .transform((v) => v || null);

// ─── Auth ────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Valid email is required"),
});

// ─── Employee ────────────────────────────────────────────

export const createEmployeeSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Valid email is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: phoneSchema,
  role: z.enum(["admin", "manager", "supervisor", "employee"]).default("employee"),
  department: z.string().max(100).optional().transform((v) => v || null),
  designation: z.string().max(100).optional().transform((v) => v || null),
  employee_type: z.enum(["daily_wage", "monthly_salary"]).default("daily_wage"),
  daily_rate: z.number().min(0).optional().transform((v) => v ?? null),
  monthly_salary: z.number().min(0).optional().transform((v) => v ?? null),
  ot_rate_per_hour: z.number().min(0).optional().transform((v) => v ?? null),
  date_of_joining: z.string().optional().transform((v) => v || null),
  address: z.string().max(500).optional().transform((v) => v || null),
  emergency_contact_name: z.string().max(200).optional().transform((v) => v || null),
  emergency_contact_phone: phoneSchema,
  manager_id: z.string().uuid().optional().transform((v) => v || null),
  bank_account_no: z.string().max(50).optional().transform((v) => v || null),
  bank_ifsc: z.string().max(20).optional().transform((v) => v || null),
  bank_name: z.string().max(100).optional().transform((v) => v || null),
  aadhar_number: z.string().max(20).optional().transform((v) => v || null),
});

export const updateEmployeeSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(200),
  phone: phoneSchema,
  department: z.string().max(100).optional().transform((v) => v || null),
  designation: z.string().max(100).optional().transform((v) => v || null),
  employee_type: z.enum(["daily_wage", "monthly_salary"]).optional(),
  daily_rate: z.number().min(0).optional().transform((v) => v ?? null),
  monthly_salary: z.number().min(0).optional().transform((v) => v ?? null),
  ot_rate_per_hour: z.number().min(0).optional().transform((v) => v ?? null),
  address: z.string().max(500).optional().transform((v) => v || null),
  emergency_contact_name: z.string().max(200).optional().transform((v) => v || null),
  emergency_contact_phone: phoneSchema,
  // Admin-only fields
  role: z.enum(["admin", "manager", "supervisor", "employee"]).optional(),
  date_of_joining: z.string().optional().transform((v) => v || null),
  manager_id: z.string().uuid().optional().transform((v) => v || null),
  is_active: z.string().optional().transform((v) => v === "true"),
  bank_account_no: z.string().max(50).optional().transform((v) => v || null),
  bank_ifsc: z.string().max(20).optional().transform((v) => v || null),
  bank_name: z.string().max(100).optional().transform((v) => v || null),
  aadhar_number: z.string().max(20).optional().transform((v) => v || null),
});

// ─── Projects ────────────────────────────────────────────

export const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(300),
  client_company: z.string().min(1, "Client company is required").max(200),
  client_contact_name: z.string().max(200).optional().transform((v) => v || null),
  client_contact_phone: phoneSchema,
  client_gst: z.string().max(20).optional().transform((v) => v || null),
  district: z.string().max(100).optional().transform((v) => v || null),
  site_address: z.string().max(500).optional().transform((v) => v || null),
  site_gps_lat: z.number().optional().transform((v) => v ?? null),
  site_gps_lng: z.number().optional().transform((v) => v ?? null),
  geofence_radius_m: z.number().min(10).default(500),
  scope_description: z.string().max(2000).optional().transform((v) => v || null),
  rate_type: z.enum(["per_unit", "per_day", "lump_sum"]).optional().transform((v) => v || null),
  rate_amount: z.number().min(0).optional().transform((v) => v ?? null),
  rate_unit: z.string().max(50).optional().transform((v) => v || null),
  start_date: z.string().optional().transform((v) => v || null),
  expected_end_date: z.string().optional().transform((v) => v || null),
  total_workers_required: z.number().int().min(1).optional().transform((v) => v ?? null),
  notes: z.string().max(2000).optional().transform((v) => v || null),
  status: z.enum(["not_started", "in_progress", "completed", "billed", "closed"]).default("not_started"),
});

export const updateProjectSchema = createProjectSchema.extend({
  progress_percent: z.number().min(0).max(100).optional(),
  actual_end_date: z.string().optional().transform((v) => v || null),
});

export const projectAssignmentSchema = z.object({
  project_id: z.string().uuid("Project is required"),
  employee_id: z.string().uuid("Employee is required"),
  role_in_project: z.enum(["supervisor", "worker"]).default("worker"),
  assigned_date: z.string().optional().transform((v) => v || null),
});

// ─── Attendance ──────────────────────────────────────────

export const attendanceSchema = z.object({
  employee_id: z.string().uuid("Employee is required"),
  project_id: z.string().uuid().optional().transform((v) => v || null),
  date: z.string().min(1, "Date is required"),
  status: z.enum(["present", "absent", "half_day", "leave"]),
  check_in_gps_lat: z.number().optional().transform((v) => v ?? null),
  check_in_gps_lng: z.number().optional().transform((v) => v ?? null),
  check_in_photo_url: z.string().url().optional().transform((v) => v || null),
  check_out_gps_lat: z.number().optional().transform((v) => v ?? null),
  check_out_gps_lng: z.number().optional().transform((v) => v ?? null),
  notes: z.string().max(2000).optional().transform((v) => v || null),
  is_offline_entry: z.boolean().default(false),
});

export const batchAttendanceSchema = z.object({
  project_id: z.string().uuid("Project is required"),
  date: z.string().min(1, "Date is required"),
  records: z.array(z.object({
    employee_id: z.string().uuid(),
    status: z.enum(["present", "absent", "half_day", "leave"]),
  })).min(1, "At least one record is required"),
});

export const attendanceCorrectionSchema = z.object({
  employee_id: z.string().uuid(),
  project_id: z.string().uuid().optional().transform((v) => v || null),
  date: z.string().min(1),
  status: z.enum(["present", "absent", "half_day", "leave"]),
  working_hours: z.number().min(0).optional().transform((v) => v ?? null),
  overtime_hours: z.number().min(0).optional().transform((v) => v ?? null),
  correction_reason: z.string().min(1, "Reason is required").max(1000),
});

// ─── Work Logs ───────────────────────────────────────────

export const workLogSchema = z.object({
  project_id: z.string().uuid("Project is required"),
  date: z.string().min(1, "Date is required"),
  work_description: z.string().min(1, "Work description is required").max(5000),
  work_category: z.enum(["civil", "structure", "panel_installation", "electrical", "testing", "other"]).default("other"),
  workers_present_count: z.number().int().min(0).optional().transform((v) => v ?? null),
  materials_used: z.string().max(2000).optional().transform((v) => v || null),
  problems: z.string().max(2000).optional().transform((v) => v || null),
  weather: z.enum(["good", "rainy", "extreme_heat"]).optional().transform((v) => v || null),
  remarks: z.string().max(2000).optional().transform((v) => v || null),
});

export const workLogPhotoSchema = z.object({
  work_log_id: z.string().uuid("Work log is required"),
  photo_url: z.string().url("Valid photo URL is required"),
  caption: z.string().max(500).optional().transform((v) => v || null),
  gps_lat: z.number().optional().transform((v) => v ?? null),
  gps_lng: z.number().optional().transform((v) => v ?? null),
  taken_at: z.string().optional().transform((v) => v || new Date().toISOString()),
});

// ─── Expenses ────────────────────────────────────────────

export const expenseSchema = z.object({
  project_id: z.string().uuid("Project is required"),
  date: z.string().min(1, "Date is required"),
  category: z.enum(["food", "tea", "water", "fuel", "travel", "vehicle", "equipment_rental", "labour", "materials", "miscellaneous"]),
  title: z.string().min(1, "Title is required").max(300),
  description: z.string().max(2000).optional().transform((v) => v || null),
  total_amount: z.number().positive("Amount must be greater than 0"),
  head_count: z.number().int().min(1).optional().transform((v) => v ?? null),
  meal_type: z.enum(["breakfast", "lunch", "dinner", "tea", "snacks"]).optional().transform((v) => v || null),
  receipt_url: z.string().url().optional().transform((v) => v || null),
});

export const expenseApprovalSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  rejection_reason: z.string().max(1000).optional().transform((v) => v || null),
});

// ─── Salary Advances ─────────────────────────────────────

export const salaryAdvanceSchema = z.object({
  employee_id: z.string().uuid("Employee is required"),
  project_id: z.string().uuid().optional().transform((v) => v || null),
  amount: z.number().positive("Amount must be greater than 0"),
  date: z.string().min(1, "Date is required"),
  reason: z.string().max(1000).optional().transform((v) => v || null),
});

// ─── Payroll ─────────────────────────────────────────────

export const generatePayrollSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});

export const updatePayrollSchema = z.object({
  other_deductions: z.number().min(0).optional(),
  deduction_notes: z.string().max(1000).optional().transform((v) => v || null),
  bonus: z.number().min(0).optional(),
  bonus_notes: z.string().max(1000).optional().transform((v) => v || null),
  is_paid: z.boolean().optional(),
  paid_date: z.string().optional().transform((v) => v || null),
  paid_method: z.enum(["bank_transfer", "cash", "upi", "cheque"]).optional().transform((v) => v || null),
  paid_reference: z.string().max(100).optional().transform((v) => v || null),
});

// ─── Invoices ────────────────────────────────────────────

export const invoiceItemSchema = z.object({
  description: z.string().min(1, "Description is required").max(500),
  unit: z.string().min(1, "Unit is required").max(50).default("nos"),
  quantity: z.number().positive(),
  unit_price: z.number().min(0),
});

export const invoiceSchema = z.object({
  project_id: z.string().uuid("Project is required"),
  billing_period_start: z.string().optional().transform((v) => v || null),
  billing_period_end: z.string().optional().transform((v) => v || null),
  due_date: z.string().optional().transform((v) => v || null),
  tax_percent: z.number().min(0).max(100).default(18),
  discount_amount: z.number().min(0).default(0),
  tds_deducted: z.number().min(0).default(0),
  notes: z.string().max(2000).optional().transform((v) => v || null),
  items: z.string().transform((str, ctx) => {
    try {
      const parsed = JSON.parse(str);
      const result = z.array(invoiceItemSchema).min(1, "At least one item is required").safeParse(parsed);
      if (!result.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid invoice items" });
        return z.NEVER;
      }
      return result.data;
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid JSON for items" });
      return z.NEVER;
    }
  }),
});

export const paymentSchema = z.object({
  invoice_id: z.string().uuid("Invoice is required"),
  amount: z.number().positive("Amount must be greater than 0"),
  payment_method: z.enum(["cash", "bank_transfer", "cheque", "upi"]),
  payment_date: z.string().min(1, "Payment date is required"),
  reference_number: z.string().max(100).optional().transform((v) => v || null),
  tds_on_payment: z.number().min(0).default(0),
  notes: z.string().max(2000).optional().transform((v) => v || null),
});

// ─── Submissions ─────────────────────────────────────────

export const submissionSchema = z.object({
  project_id: z.string().uuid("Project is required"),
  period_start: z.string().min(1, "Start date is required"),
  period_end: z.string().min(1, "End date is required"),
  include_attendance: z.boolean().default(true),
  include_work_logs: z.boolean().default(true),
  include_photos: z.boolean().default(true),
  include_expenses: z.boolean().default(true),
  include_invoice: z.boolean().default(false),
  invoice_id: z.string().uuid().optional().transform((v) => v || null),
  cover_note: z.string().max(2000).optional().transform((v) => v || null),
  format: z.enum(["pdf", "zip", "excel"]).default("pdf"),
});

// ─── Settings ────────────────────────────────────────────

export const companySettingsSchema = z.object({
  company_name: z.string().min(1, "Company name is required").max(200),
  address: z.string().max(500).optional().transform((v) => v || null),
  phone: phoneSchema,
  email: emailSchema,
  gst_number: z.string().max(20).optional().transform((v) => v || null),
  pan_number: z.string().max(10).optional().transform((v) => v || null),
  bank_name: z.string().max(200).optional().transform((v) => v || null),
  bank_account_no: z.string().max(30).optional().transform((v) => v || null),
  bank_ifsc: z.string().max(15).optional().transform((v) => v || null),
  invoice_prefix: z.string().max(10).default("INV"),
  quotation_prefix: z.string().max(10).default("QT"),
  work_order_prefix: z.string().max(10).default("WO"),
  expense_prefix: z.string().max(10).default("EXP"),
  project_prefix: z.string().max(10).default("PRJ"),
  tax_rate: z.number().min(0).max(100).default(18),
  shift_start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)").default("07:00"),
  shift_end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)").default("17:00"),
  ot_after_hours: z.number().min(1).max(24).default(8),
  financial_year_start_month: z.number().int().min(1).max(12).default(4),
  default_geofence_radius: z.number().min(10).default(500),
});

// ─── Documents ─────────────────────────────────────────────

export const documentUploadSchema = z.object({
  title: z.string().min(1, "Document title is required").max(300),
  project_id: z.string().uuid("Project is required"),
  doc_type: z.enum(["work_order", "drawing", "certificate", "letter", "other"]).default("other"),
  // file itself is handled via FormData Blob
});


/**
 * Extract and validate form data against a Zod schema.
 * Returns a discriminated union for proper TypeScript narrowing.
 */
export function parseFormData<T extends z.ZodSchema>(
  schema: T,
  formData: FormData
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const raw: Record<string, unknown> = {};

  formData.forEach((value, key) => {
    raw[key] = String(value);
  });

  const result = schema.safeParse(raw);

  if (!result.success) {
    const firstError = result.error.issues[0];
    return {
      success: false,
      error: firstError
        ? `${firstError.path.join(".")}: ${firstError.message}`
        : "Validation failed",
    };
  }

  return { success: true, data: result.data };
}
