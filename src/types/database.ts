// Database types — Sentil Solar Field Operations Management System
// Manually defined to match our schema (migrations 001-016)
// In production, generate with: npx supabase gen types typescript

// ─── Enums / Literal Types ─────────────────────────────────

export type UserRole = "admin" | "manager" | "supervisor" | "employee";

export type EmployeeType = "daily_wage" | "monthly_salary";

export type ProjectStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "billed"
  | "closed";

export type ProjectRateType = "per_unit" | "per_day" | "lump_sum";

export type ProjectRole = "supervisor" | "worker";

export type AttendanceStatus =
  | "present"
  | "absent"
  | "half_day"
  | "leave";

export type WorkCategory =
  | "civil"
  | "structure"
  | "panel_installation"
  | "electrical"
  | "testing"
  | "other";

export type WeatherCondition = "good" | "rainy" | "extreme_heat";

export type ExpenseCategory =
  | "food"
  | "tea"
  | "water"
  | "fuel"
  | "travel"
  | "vehicle"
  | "equipment_rental"
  | "labour"
  | "materials"
  | "miscellaneous";

export type MealType =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "tea"
  | "snacks";

export type ExpenseApprovalStatus = "pending" | "approved" | "rejected";

export type AdvanceStatus = "pending" | "partially_deducted" | "fully_deducted";

export type PaymentMethod = "cash" | "upi" | "bank_transfer" | "cheque";

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "partially_paid"
  | "paid"
  | "overdue";

export type SubmissionFormat = "pdf" | "zip" | "excel";

export type ProjectDocType =
  | "work_order"
  | "drawing"
  | "certificate"
  | "letter"
  | "other";

// Legacy types kept for backward compatibility with existing pages
export type LeaveType = "sick" | "casual" | "annual" | "unpaid" | "other";
export type LeaveStatus = "pending" | "approved" | "rejected";
export type DocumentCategory = "id_proof" | "agreement" | "permit" | "photo" | "report" | "invoice" | "other";
export type DocumentEntityType = "employee" | "customer" | "work_order" | "expense" | "general";
export type AuditAction = "document_upload" | "document_delete" | "other";

// ─── Row types ──────────────────────────────────────────────

export interface Profile {
  id: string;
  employee_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  department: string | null;
  designation: string | null;
  employee_type: EmployeeType;
  daily_rate: number | null;
  monthly_salary: number | null;
  salary: number | null; // Legacy — use monthly_salary
  ot_rate_per_hour: number | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  aadhar_number: string | null;
  date_of_joining: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address: string | null;
  avatar_url: string | null;
  is_active: boolean;
  manager_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  project_code: string;
  name: string;
  client_company: string;
  client_contact_name: string | null;
  client_contact_phone: string | null;
  client_gst: string | null;
  district: string | null;
  site_address: string | null;
  site_gps_lat: number | null;
  site_gps_lng: number | null;
  geofence_radius_m: number;
  scope_description: string | null;
  rate_type: ProjectRateType | null;
  rate_amount: number | null;
  rate_unit: string | null;
  start_date: string | null;
  expected_end_date: string | null;
  actual_end_date: string | null;
  progress_percent: number;
  status: ProjectStatus;
  total_workers_required: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectAssignment {
  id: string;
  project_id: string;
  employee_id: string;
  role_in_project: ProjectRole;
  assigned_date: string;
  removed_date: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ProjectDocument {
  id: string;
  project_id: string;
  title: string;
  doc_type: ProjectDocType;
  file_url: string;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface Attendance {
  id: string;
  employee_id: string;
  project_id: string | null;
  date: string;
  status: AttendanceStatus;
  check_in: string | null; // Legacy column name
  check_out: string | null; // Legacy column name
  check_in_gps_lat: number | null;
  check_in_gps_lng: number | null;
  check_in_photo_url: string | null;
  check_out_gps_lat: number | null;
  check_out_gps_lng: number | null;
  working_hours: number | null;
  overtime_hours: number | null;
  is_late: boolean;
  marked_by: string | null;
  is_offline_entry: boolean;
  is_manually_corrected: boolean;
  correction_reason: string | null;
  location_lat: number | null; // Legacy
  location_lng: number | null; // Legacy
  notes: string | null;
  created_at: string;
}

export interface WorkLog {
  id: string;
  project_id: string;
  date: string;
  submitted_by: string;
  work_description: string;
  work_category: WorkCategory;
  workers_present_count: number | null;
  materials_used: string | null;
  problems: string | null;
  weather: WeatherCondition | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  photos?: WorkLogPhoto[];
  project?: Project;
  submitter?: Profile;
}

export interface WorkLogPhoto {
  id: string;
  work_log_id: string;
  photo_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  taken_at: string;
}

export interface Expense {
  id: string;
  expense_number: string;
  employee_id: string;
  project_id: string | null;
  date: string | null;
  category: ExpenseCategory;
  title: string;
  description: string | null;
  total_amount: number;
  head_count: number | null;
  meal_type: MealType | null;
  status: ExpenseApprovalStatus;
  work_order_id: string | null; // Legacy
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  receipt_url: string | null;
  notes: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  employee?: Profile;
  project?: Project;
}

export interface SalaryAdvance {
  id: string;
  employee_id: string;
  project_id: string | null;
  amount: number;
  date: string;
  reason: string | null;
  given_by: string | null;
  status: AdvanceStatus;
  amount_deducted: number;
  deducted_in_payroll_id: string | null;
  created_at: string;
  // Computed
  remaining_balance?: number;
  // Joined
  employee?: Profile;
  project?: Project;
}

export interface Payroll {
  id: string;
  employee_id: string;
  month: number;
  year: number;
  present_days: number;
  overtime_hours: number;
  daily_rate_used: number | null;
  ot_rate_used: number | null;
  gross_salary: number;
  total_advance_deduction: number;
  other_deductions: number;
  deduction_notes: string | null;
  bonus: number;
  bonus_notes: string | null;
  net_salary: number;
  is_paid: boolean;
  paid_date: string | null;
  paid_method: PaymentMethod | null;
  paid_reference: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  employee?: Profile;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string | null; // Legacy
  project_id: string | null;
  work_order_id: string | null; // Legacy
  quotation_id: string | null; // Legacy
  billing_period_start: string | null;
  billing_period_end: string | null;
  subtotal: number;
  tax_percent: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  tds_deducted: number;
  net_receivable: number | null;
  amount_paid: number;
  balance_due: number;
  status: InvoiceStatus;
  due_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  project?: Project;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  sort_order: number;
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  reference_number: string | null;
  tds_on_payment: number;
  notes: string | null;
  received_by: string | null;
  created_at: string;
  // Joined
  invoice?: Invoice;
}

export interface Submission {
  id: string;
  project_id: string;
  period_start: string;
  period_end: string;
  include_attendance: boolean;
  include_work_logs: boolean;
  include_photos: boolean;
  include_expenses: boolean;
  include_invoice: boolean;
  invoice_id: string | null;
  cover_note: string | null;
  file_url: string | null;
  format: SubmissionFormat;
  submitted_to_client: boolean;
  submitted_date: string | null;
  created_by: string | null;
  created_at: string;
  // Joined
  project?: Project;
  invoice?: Invoice;
}

export interface CompanySettings {
  id: string;
  company_name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  gst_number: string | null;
  pan_number: string | null;
  bank_name: string | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  invoice_prefix: string;
  quotation_prefix: string;
  work_order_prefix: string;
  expense_prefix: string;
  project_prefix: string;
  tax_rate: number;
  shift_start_time: string;
  shift_end_time: string;
  ot_after_hours: number;
  financial_year_start_month: number;
  default_geofence_radius: number;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: string | null;
  created_at: string;
}

// Legacy types kept for existing pages (will be deprecated)
export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  from_date: string;
  to_date: string;
  reason: string;
  status: LeaveStatus;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  customer_id: string;
  name: string;
  email: string | null;
  phone: string;
  alternate_phone: string | null;
  address: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
  gst_number: string | null;
  source: string | null;
  assigned_to: string | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkOrder {
  id: string;
  work_order_number: string;
  customer_id: string;
  quotation_id: string | null;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  status: string;
  scheduled_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  site_address: string | null;
  site_lat: number | null;
  site_lng: number | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  created_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  category: DocumentCategory | null;
  entity_type: DocumentEntityType | null;
  entity_id: string | null;
  uploaded_by: string | null;
  notes: string | null;
  created_at: string;
}

// ─── Database type for Supabase client generic ──────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at" | "updated_at">;
        Update: Partial<Omit<Profile, "id" | "created_at">>;
      };
      projects: {
        Row: Project;
        Insert: Omit<Project, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Project, "id" | "created_at">>;
      };
      project_assignments: {
        Row: ProjectAssignment;
        Insert: Omit<ProjectAssignment, "id" | "created_at">;
        Update: Partial<Omit<ProjectAssignment, "id" | "created_at">>;
      };
      project_documents: {
        Row: ProjectDocument;
        Insert: Omit<ProjectDocument, "id" | "uploaded_at">;
        Update: Partial<Omit<ProjectDocument, "id">>;
      };
      attendance: {
        Row: Attendance;
        Insert: Omit<Attendance, "id" | "created_at">;
        Update: Partial<Omit<Attendance, "id" | "created_at">>;
      };
      work_logs: {
        Row: WorkLog;
        Insert: Omit<WorkLog, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<WorkLog, "id" | "created_at">>;
      };
      work_log_photos: {
        Row: WorkLogPhoto;
        Insert: Omit<WorkLogPhoto, "id">;
        Update: Partial<Omit<WorkLogPhoto, "id">>;
      };
      expenses: {
        Row: Expense;
        Insert: Omit<Expense, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Expense, "id" | "created_at">>;
      };
      salary_advances: {
        Row: SalaryAdvance;
        Insert: Omit<SalaryAdvance, "id" | "created_at">;
        Update: Partial<Omit<SalaryAdvance, "id" | "created_at">>;
      };
      payroll: {
        Row: Payroll;
        Insert: Omit<Payroll, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Payroll, "id" | "created_at">>;
      };
      invoices: {
        Row: Invoice;
        Insert: Omit<Invoice, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Invoice, "id" | "created_at">>;
      };
      invoice_items: {
        Row: InvoiceItem;
        Insert: Omit<InvoiceItem, "id">;
        Update: Partial<Omit<InvoiceItem, "id">>;
      };
      payments: {
        Row: Payment;
        Insert: Omit<Payment, "id" | "created_at">;
        Update: Partial<Omit<Payment, "id" | "created_at">>;
      };
      submissions: {
        Row: Submission;
        Insert: Omit<Submission, "id" | "created_at">;
        Update: Partial<Omit<Submission, "id" | "created_at">>;
      };
      company_settings: {
        Row: CompanySettings;
        Insert: Omit<CompanySettings, "id" | "updated_at">;
        Update: Partial<Omit<CompanySettings, "id">>;
      };
      // Legacy tables (kept for backward compat, will be deprecated)
      customers: {
        Row: Customer;
        Insert: Omit<Customer, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Customer, "id" | "created_at">>;
      };
      leave_requests: {
        Row: LeaveRequest;
        Insert: Omit<LeaveRequest, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<LeaveRequest, "id" | "created_at">>;
      };
      documents: {
        Row: Document;
        Insert: Omit<Document, "id" | "created_at">;
        Update: Partial<Omit<Document, "id" | "created_at">>;
      };
      audit_logs: {
        Row: ActivityLog;
        Insert: Omit<ActivityLog, "id" | "created_at">;
        Update: Partial<Omit<ActivityLog, "id" | "created_at">>;
      };
      sequences: {
        Row: { name: string; current_value: number };
        Insert: { name: string; current_value?: number };
        Update: { name?: string; current_value?: number };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      next_sequence: {
        Args: { seq_name: string; prefix?: string };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
