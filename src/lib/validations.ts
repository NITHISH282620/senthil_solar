import { z } from "zod";

// ─── Shared primitives ───────────────────────────────────
//
// IMPORTANT: `parseFormData` below converts every FormData entry to a string.
// Zod's `z.number()` / `z.boolean()` do NOT coerce, so any schema field that
// arrives via FormData must use `z.coerce.*`. Using the plain variants here was
// silently breaking every create/update form in the application.

/** Optional numeric field: "" / undefined → null, otherwise coerced number. */
const optionalNumber = (min?: number, max?: number) =>
  z
    .union([z.literal(""), z.coerce.number()])
    // nullish, not optional: these helpers NORMALISE empty values to null, so a
    // schema that will not ACCEPT null cannot take back what it just produced.
    // Server actions that receive a plain object rather than FormData send
    // explicit nulls for empty optional fields, and every one of them was
    // rejected with "expected string, received null".
    .nullish()
    .transform((v) => (v === "" || v === undefined || v === null ? null : (v as number)))
    .refine((v) => v === null || min === undefined || v >= min, {
      message: min === 0 ? "Cannot be negative" : `Must be at least ${min}`,
    })
    .refine((v) => v === null || max === undefined || v <= max, {
      message: `Must be at most ${max}`,
    });

/** Optional text field: "" / undefined → null. */
const optionalText = (max: number) =>
  z
    .string()
    .max(max, `Must be ${max} characters or fewer`)
    // See optionalNumber: nullish so the schema accepts the null it emits.
    .nullish()
    .transform((v) => (v ? v : null));

/**
 * Optional foreign key: "" / null / undefined → null.
 *
 * An unselected picker submits an empty string, and `z.string().uuid().or(
 * z.literal(""))` happily passed that straight through to a uuid column —
 * Postgres answered `invalid input syntax for type uuid: ""`, which is what the
 * user saw. Every call site had to remember `|| null`; the ones that forgot
 * were broken. Normalising here means none of them has to.
 */
const optionalUuid = () =>
  z
    .union([z.literal(""), z.string().uuid("Must be a valid selection")])
    .nullish()
    .transform((v) => (v ? v : null));

/** Optional date (ISO yyyy-mm-dd) field: "" / undefined → null. */
const optionalDate = () =>
  z
    .string()
    .nullish()
    .transform((v) => (v ? v : null));

/**
 * Checkbox / switch values arrive as "on", "true", "1" or are absent entirely.
 */
const checkbox = () =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === "true" || v === "on" || v === "1");

/**
 * Sanitize search input before it reaches a PostgREST `.or()` / `.ilike()`
 * filter. PostgREST treats `.`, `,`, `(`, `)` as filter syntax and `%`, `_`,
 * `*` as LIKE wildcards — all must be neutralised.
 */
export function sanitizeSearchInput(input: string): string {
  return input.replace(/[.,()!*%_\\:]/g, "").trim().slice(0, 100);
}

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
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: phoneSchema,
  role: z
    .enum(["owner", "manager", "accountant", "engineer", "supervisor", "store_manager", "worker", "client"])
    .default("worker"),
  department: optionalText(100),
  designation: optionalText(100),
  employee_type: z.enum(["daily_wage", "monthly_salary"]).default("daily_wage"),
  daily_rate: optionalNumber(0),
  monthly_salary: optionalNumber(0),
  ot_rate_per_hour: optionalNumber(0),
  date_of_joining: optionalDate(),
  address: optionalText(500),
  emergency_contact_name: optionalText(200),
  emergency_contact_phone: phoneSchema,
  manager_id: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? v : null)),
  bank_account_no: optionalText(50),
  bank_ifsc: optionalText(20),
  bank_name: optionalText(100),
  aadhar_number: optionalText(20),
});

export const updateEmployeeSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(200),
  phone: phoneSchema,
  department: optionalText(100),
  designation: optionalText(100),
  employee_type: z.enum(["daily_wage", "monthly_salary"]).optional(),
  daily_rate: optionalNumber(0),
  monthly_salary: optionalNumber(0),
  ot_rate_per_hour: optionalNumber(0),
  address: optionalText(500),
  emergency_contact_name: optionalText(200),
  emergency_contact_phone: phoneSchema,
  // Admin-only fields
  role: z.enum(["owner", "manager", "accountant", "engineer", "supervisor", "store_manager", "worker", "client"]).optional(),
  date_of_joining: optionalDate(),
  manager_id: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? v : null)),
  is_active: checkbox(),
  bank_account_no: optionalText(50),
  bank_ifsc: optionalText(20),
  bank_name: optionalText(100),
  aadhar_number: optionalText(20),
});

// ─── Customers (client companies — becomes `companies` in Phase 1) ──

export const createCompanySchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  legal_name: optionalText(200),
  // Primary Contact Info
  primary_contact_name: z.string().min(1, "Primary contact name is required").max(100),
  primary_contact_email: emailSchema,
  primary_contact_phone: phoneSchema,
  
  company_type: z.enum(['corporate','factory','industrial','commercial','government','residential']).default('corporate'),
  gst_number: optionalText(20),
  pan_number: optionalText(20),
  billing_address: optionalText(500),
  shipping_address: optionalText(500),
  city: optionalText(100),
  state: optionalText(100),
  state_code: optionalText(10),
  pincode: optionalText(10),
  payment_terms_days: optionalNumber(0),
  credit_limit: optionalNumber(0),
  tds_applicable: checkbox(),
  tds_percent: optionalNumber(0),
  retention_percent: optionalNumber(0, 100),
  status: z.enum(["prospect", "active", "inactive", "blacklisted"]).default("active"),
  notes: optionalText(2000),
});

export const updateCompanySchema = createCompanySchema;

// ─── Projects (becomes `contracts` in Phase 1) ───────────

export const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(300),
  client_company: z.string().min(1, "Client company is required").max(200),
  client_contact_name: optionalText(200),
  client_contact_phone: phoneSchema,
  client_gst: optionalText(20),
  district: optionalText(100),
  site_address: optionalText(500),
  site_gps_lat: optionalNumber(-90, 90),
  site_gps_lng: optionalNumber(-180, 180),
  geofence_radius_m: z.coerce.number().min(10).default(500),
  scope_description: optionalText(2000),
  rate_type: z
    .enum(["per_unit", "per_day", "lump_sum"])
    .optional()
    .transform((v) => v || null),
  rate_amount: optionalNumber(0),
  rate_unit: optionalText(50),
  start_date: optionalDate(),
  expected_end_date: optionalDate(),
  total_workers_required: optionalNumber(1),
  notes: optionalText(2000),
  status: z
    .enum(["not_started", "in_progress", "completed", "billed", "closed"])
    .default("not_started"),
});

export const updateProjectSchema = createProjectSchema.extend({
  progress_percent: optionalNumber(0, 100),
  actual_end_date: optionalDate(),
});

export const projectAssignmentSchema = z.object({
  project_id: z.string().uuid("Project is required"),
  employee_id: z.string().uuid("Employee is required"),
  role_in_project: z.enum(["supervisor", "worker"]).default("worker"),
  assigned_date: optionalDate(),
});

// ─── Attendance ──────────────────────────────────────────

export const attendanceSchema = z.object({
  employee_id: z.string().uuid("Employee is required"),
  project_id: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? v : null)),
  date: z.string().min(1, "Date is required"),
  status: z.enum(["present", "absent", "half_day", "leave", "holiday"]),
  check_in_gps_lat: optionalNumber(-90, 90),
  check_in_gps_lng: optionalNumber(-180, 180),
  check_in_photo_url: optionalText(500),
  check_out_gps_lat: optionalNumber(-90, 90),
  check_out_gps_lng: optionalNumber(-180, 180),
  notes: optionalText(2000),
  is_offline_entry: checkbox(),
});

export const batchAttendanceSchema = z.object({
  project_id: z.string().uuid("Site is required"),
  date: z.string().min(1, "Date is required"),
  records: z
    .array(
      z.object({
        employee_id: z.string().uuid(),
        status: z.enum(["present", "absent", "half_day", "leave", "holiday"]),
        overtime_hours: z.coerce.number().min(0).max(24).default(0),
      })
    )
    .min(1, "At least one record is required"),
});

export const attendanceCorrectionSchema = z.object({
  employee_id: z.string().uuid(),
  project_id: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? v : null)),
  date: z.string().min(1),
  status: z.enum(["present", "absent", "half_day", "leave", "holiday"]),
  working_hours: optionalNumber(0, 24),
  overtime_hours: optionalNumber(0, 24),
  correction_reason: z.string().min(1, "Reason is required").max(1000),
});

// ─── Leave requests ──────────────────────────────────────

export const leaveRequestSchema = z
  .object({
    leave_type: z.enum(["sick", "casual", "annual", "unpaid", "other"]),
    from_date: z.string().min(1, "From date is required"),
    to_date: z.string().min(1, "To date is required"),
    reason: z.string().min(1, "Reason is required").max(1000),
  })
  .refine((v) => v.to_date >= v.from_date, {
    message: "To date must be on or after the from date",
    path: ["to_date"],
  });

export const leaveStatusSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

// ─── Work logs ───────────────────────────────────────────

export const workLogSchema = z.object({
  project_id: z.string().uuid("Site is required"),
  date: z.string().min(1, "Date is required"),
  work_description: z
    .string()
    .min(1, "Work description is required")
    .max(5000),
  work_category: z
    .enum([
      "civil",
      "structure",
      "panel_installation",
      "electrical",
      "testing",
      "other",
    ])
    .default("other"),
  workers_present_count: optionalNumber(0),
  materials_used: optionalText(2000),
  problems: optionalText(2000),
  weather: z
    .enum(["good", "rainy", "extreme_heat"])
    .optional()
    .transform((v) => v || null),
  remarks: optionalText(2000),
});

export const workLogPhotoSchema = z.object({
  work_log_id: z.string().uuid("Work log is required"),
  photo_url: z.string().min(1, "Photo is required"),
  caption: optionalText(500),
  gps_lat: optionalNumber(-90, 90),
  gps_lng: optionalNumber(-180, 180),
  taken_at: z
    .string()
    .optional()
    .transform((v) => v || new Date().toISOString()),
});

// ─── Expenses ────────────────────────────────────────────

export const expenseItemSchema = z.object({
  description: z.string().min(1, "Description is required").max(500),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
});

// Category is validated as a plain string, not an enum: expense_categories is
// a lookup table the owner may extend without a migration, and the foreign key
// is the real guard.
export const expenseSchema = z.object({
  site_id: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? v : null)),
  expense_date: z
    .string()
    .optional()
    .transform((v) => v || new Date().toISOString().slice(0, 10)),
  category: z.string().min(1, "Category is required").max(50),
  title: z.string().min(1, "Title is required").max(300),
  description: optionalText(2000),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  head_count: optionalNumber(1),
  meal_type: z
    .enum(["breakfast", "lunch", "dinner", "tea", "snacks"])
    .optional()
    .transform((v) => v || null),
  payment_mode: z
    .enum(["cash", "upi", "bank_transfer", "card", "credit"])
    .default("cash"),
  vendor_name: optionalText(200),
  receipt_url: optionalText(500),
});

export const expenseApprovalSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  rejection_reason: optionalText(1000),
});

// ─── Salary advances ─────────────────────────────────────

export const salaryAdvanceSchema = z.object({
  employee_id: z.string().uuid("Employee is required"),
  project_id: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? v : null)),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  date: z.string().min(1, "Date is required"),
  reason: optionalText(1000),
});

// ─── Payroll ─────────────────────────────────────────────

export const generatePayrollSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

export const updatePayrollSchema = z.object({
  other_deductions: optionalNumber(0),
  deduction_notes: optionalText(1000),
  bonus: optionalNumber(0),
  bonus_notes: optionalText(1000),
  is_paid: checkbox(),
  paid_date: optionalDate(),
  paid_method: z
    .enum(["bank_transfer", "cash", "upi", "cheque"])
    .optional()
    .transform((v) => v || null),
  paid_reference: optionalText(100),
});

// ─── Quotations ──────────────────────────────────────────

// quotation_items.line_total is GENERATED ALWAYS; writing it raises 428C9.
export const quotationLineItemSchema = z.object({
  section: z
    .enum(["material", "installation", "transport", "labour", "other"])
    .default("material"),
  description: z.string().min(1, "Description is required").max(500),
  hsn_sac_code: optionalText(20),
  unit: z.string().min(1).max(50).default("nos"),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  unit_price: z.coerce.number().min(0, "Price cannot be negative"),
  sort_order: z.coerce.number().int().min(0).default(0),
});

// Mirrors the quotations table. total_amount is GENERATED ALWAYS and is
// deliberately absent — the database derives it from the other three.
export const quotationDataSchema = z.object({
  company_id: z.string().uuid("Client company is required"),
  title: z.string().min(1, "Title is required").max(300),
  description: optionalText(2000),
  capacity_kw: optionalNumber(0),
  panel_type: optionalText(100),
  inverter_type: optionalText(100),
  subtotal: z.coerce.number().min(0),
  gst_percent: z.coerce.number().min(0).max(100).default(18),
  gst_amount: z.coerce.number().min(0).default(0),
  discount_amount: z.coerce.number().min(0).default(0),
  warranty_terms: optionalText(2000),
  payment_terms: optionalText(2000),
  terms: optionalText(4000),
  valid_from: optionalDate(),
  valid_until: optionalDate(),
  notes: optionalText(2000),
  status: z
    .enum(["draft", "sent", "approved", "rejected", "expired", "converted"])
    .default("draft"),
})
  // Mirrors the database's own quotation_validity_window_sane constraint, so
  // the mistake is caught here with a field-level message rather than as a
  // raw constraint-violation error from Postgres.
  .refine(
    (v) => !v.valid_from || !v.valid_until || v.valid_until >= v.valid_from,
    { message: "Valid until cannot be before valid from", path: ["valid_until"] }
  );

export const quotationStatusSchema = z.object({
  status: z.enum([
    "draft",
    "sent",
    "approved",
    "rejected",
    "expired",
    "converted",
  ]),
});

// ─── Invoices ────────────────────────────────────────────

export const invoiceItemSchema = z.object({
  description: z.string().min(1, "Description is required").max(500),
  unit: z.string().min(1, "Unit is required").max(50).default("nos"),
  quantity: z.coerce.number().positive(),
  unit_price: z.coerce.number().min(0),
});

export const invoiceSchema = z.object({
  customer_id: z.string().uuid("Customer is required"),
  project_id: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? v : null)),
  quotation_id: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? v : null)),
  billing_period_start: optionalDate(),
  billing_period_end: optionalDate(),
  due_date: optionalDate(),
  tax_percent: z.coerce.number().min(0).max(100).default(18),
  discount_amount: z.coerce.number().min(0).default(0),
  tds_deducted: z.coerce.number().min(0).default(0),
  notes: optionalText(2000),
  items: jsonArray(invoiceItemSchema, "invoice items"),
});

export const paymentSchema = z.object({
  invoice_id: z.string().uuid("Invoice is required"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  payment_method: z.enum(["cash", "bank_transfer", "cheque", "upi", "card"]),
  payment_date: z.string().min(1, "Payment date is required"),
  reference_number: optionalText(100),
  tds_deducted: z.coerce.number().min(0).default(0),
  bank_account_id: optionalUuid(),
  notes: optionalText(2000),
});

// ─── Sites ───────────────────────────────────────────────
//
// site_code and company_id are omitted on purpose: the first is allocated by
// the database sequence, the second is derived from the parent contract.

export const siteSchema = z
  .object({
    contract_id: z.string().uuid("Parent contract is required"),
    name: z.string().min(1, "Site name is required").max(200),
    address: optionalText(500),
    district: optionalText(100),
    state: optionalText(100),
    pincode: optionalText(10),
    gps_lat: optionalNumber(-90, 90),
    gps_lng: optionalNumber(-180, 180),
    geofence_radius_m: z.coerce.number().int().positive().default(500),
    capacity_kw: optionalNumber(0),
    panel_count: optionalNumber(0),
    panel_type: optionalText(100),
    inverter_type: optionalText(100),
    site_engineer_id: optionalUuid(),
    supervisor_id: optionalUuid(),
    stage: z.string().min(1).max(50).default("planning"),
    progress_percent: z.coerce.number().int().min(0).max(100).default(0),
    planned_start_date: optionalDate(),
    planned_end_date: optionalDate(),
    actual_start_date: optionalDate(),
    actual_end_date: optionalDate(),
    allocated_value: z.coerce.number().min(0).default(0),
    workers_required: optionalNumber(0),
    status: z.enum(["active", "on_hold", "completed", "cancelled"]).default("active"),
    notes: optionalText(2000),
  })
  .refine(
    (v) =>
      !v.planned_end_date ||
      !v.planned_start_date ||
      v.planned_end_date >= v.planned_start_date,
    {
      message: "Planned end cannot be before the planned start",
      path: ["planned_end_date"],
    }
  );

// ─── Cash book / quick money entry ───────────────────────
//
// This is the highest-traffic form in the product: the owner records Rs 5 tea
// as readily as Rs 5,00,000 from a client, often one-handed on a phone. Every
// field beyond amount and direction therefore has a workable default.

export const cashEntrySchema = z
  .object({
    direction: z.enum(["in", "out"]),
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    entry_date: optionalDate(),
    category: z.string().min(1, "Category is required").max(50),
    payment_mode: z.enum(["cash", "upi", "bank", "card"]).default("cash"),
    bank_account_id: optionalUuid(),
    // Office overheads carry no site; cash_book enforces one or the other.
    site_id: optionalUuid(),
    is_office: checkbox(),
    description: z.string().min(1, "Say what this was for").max(500),
    counterparty: optionalText(200),
    employee_id: optionalUuid(),
    notes: optionalText(2000),
  })
  .refine((v) => v.is_office || !!v.site_id, {
    message: "Pick a site, or mark this as an office expense",
    path: ["site_id"],
  })
  .refine((v) => v.payment_mode !== "bank" || !!v.bank_account_id, {
    message: "Choose which bank account this moved through",
    path: ["bank_account_id"],
  })
  .refine((v) => v.category !== "worker_advance" || !!v.employee_id, {
    message: "Choose which worker received the advance",
    path: ["employee_id"],
  });

// ─── Contracts ───────────────────────────────────────────

export const contractSchema = z.object({
  company_id: z.string().uuid("Client company is required"),
  title: z.string().min(1, "Contract title is required").max(300),
  scope_description: optionalText(4000),
  contract_value: z.coerce.number().min(0).default(0),
  total_capacity_kw: optionalNumber(0),
  start_date: optionalDate(),
  deadline_date: optionalDate(),
  actual_end_date: optionalDate(),
  payment_terms_days: z.coerce.number().int().min(0).default(30),
  retention_percent: z.coerce.number().min(0).max(100).default(0),
  penalty_per_day: z.coerce.number().min(0).default(0),
  penalty_cap_percent: z.coerce.number().min(0).default(10),
  status: z
    .enum(["draft", "active", "on_hold", "completed", "closed", "cancelled"])
    .default("draft"),
  notes: optionalText(2000),
}).refine(
  (v) => !v.deadline_date || !v.start_date || v.deadline_date >= v.start_date,
  { message: "Deadline cannot be before the start date", path: ["deadline_date"] }
);

// ─── Submissions ─────────────────────────────────────────

export const submissionSchema = z.object({
  project_id: z.string().uuid("Site is required"),
  period_start: z.string().min(1, "Start date is required"),
  period_end: z.string().min(1, "End date is required"),
  include_attendance: checkbox(),
  include_work_logs: checkbox(),
  include_photos: checkbox(),
  include_expenses: checkbox(),
  include_invoice: checkbox(),
  invoice_id: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? v : null)),
  cover_note: optionalText(2000),
  format: z.enum(["pdf", "zip", "excel"]).default("pdf"),
});

// ─── Settings ────────────────────────────────────────────

export const companySettingsSchema = z.object({
  company_name: z.string().min(1, "Company name is required").max(200),
  address: optionalText(500),
  phone: phoneSchema,
  email: emailSchema,
  gst_number: optionalText(20),
  pan_number: optionalText(10),
  // Place of supply for our own side of every invoice: state_code is what
  // decides CGST+SGST vs IGST, so it has to be editable.
  state: optionalText(100),
  state_code: optionalText(2),
  invoice_prefix: z.string().max(10).default("INV"),
  quotation_prefix: z.string().max(10).default("QT"),
  expense_prefix: z.string().max(10).default("EXP"),
  contract_prefix: z.string().max(10).default("CON"),
  site_prefix: z.string().max(10).default("SITE"),
  default_gst_percent: z.coerce.number().min(0).max(100).default(18),
  shift_start_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)")
    .default("07:00"),
  shift_end_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)")
    .default("17:00"),
  ot_after_hours: z.coerce.number().min(1).max(24).default(8),
  financial_year_start_month: z.coerce.number().int().min(1).max(12).default(4),
  default_geofence_radius_m: z.coerce.number().min(10).default(500),
});

// ─── Bank accounts ───────────────────────────────────────

export const bankAccountSchema = z.object({
  account_name: z.string().min(1, "Give the account a name").max(120),
  bank_name: z.string().min(1, "Bank name is required").max(120),
  account_number: z.string().min(4, "Account number looks too short").max(40),
  // 4 letters, 0, then 6 alphanumerics — the RBI format.
  ifsc: z
    .string()
    .regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, "IFSC should look like HDFC0001234"),
  branch: optionalText(120),
  account_type: z.enum(["current", "savings", "od", "cc"]).default("current"),
  opening_balance: z.coerce.number().default(0),
  is_primary: checkbox(),
});

// ─── Documents ───────────────────────────────────────────

export const DOCUMENT_ENTITY_TYPES = [
  "employee",
  "company",
  "contract",
  "quotation",
  "invoice",
  "expense",
  "general",
] as const;

export const documentUploadSchema = z.object({
  name: z.string().min(1, "Document name is required").max(300),
  category: z
    .enum([
      "id_proof",
      "agreement",
      "permit",
      "photo",
      "report",
      "invoice",
      "other",
    ])
    .default("other"),
  entity_type: z.enum(DOCUMENT_ENTITY_TYPES).default("general"),
  entity_id: z
    .string()
    .optional()
    .transform((v) => (v && v !== "none" ? v : null)),
  notes: optionalText(1000),
});

// ─── Helpers ─────────────────────────────────────────────

/**
 * A JSON-encoded array delivered through a single FormData field.
 * Accepts either an already-parsed array (direct action invocation) or a
 * JSON string (FormData submission).
 */
function jsonArray<T extends z.ZodTypeAny>(item: T, label: string) {
  return z.preprocess(
    (raw) => {
      if (typeof raw !== "string") return raw;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    },
    z.array(item).min(1, `At least one ${label.replace(/s$/, "")} is required`)
  );
}

/**
 * Extract and validate form data against a Zod schema.
 *
 * Multi-value keys (checkbox groups) are collected into arrays; everything else
 * is passed through as a string for the schema's coercion layer to handle.
 * Empty strings are preserved so `optional*` helpers can map them to null.
 */
export function parseFormData<T extends z.ZodTypeAny>(
  schema: T,
  formData: FormData
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const raw: Record<string, unknown> = {};

  for (const key of new Set(formData.keys())) {
    const values = formData.getAll(key);
    const usable = values.filter((v) => !(v instanceof File));
    if (usable.length === 0) continue;
    raw[key] = usable.length > 1 ? usable.map(String) : String(usable[0]);
  }

  const result = schema.safeParse(raw);

  if (!result.success) {
    const firstError = result.error.issues[0];
    return {
      success: false,
      error: firstError
        ? `${firstError.path.join(".") || "Form"}: ${firstError.message}`
        : "Validation failed",
    };
  }

  return { success: true, data: result.data };
}
