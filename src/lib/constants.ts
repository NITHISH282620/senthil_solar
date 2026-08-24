export const APP_NAME = "Sentil Solar Ops";
export const APP_DESCRIPTION = "Field Operations Management System";

export const ROLES = {
  OWNER: "owner",
  MANAGER: "manager",
  ACCOUNTANT: "accountant",
  ENGINEER: "engineer",
  SUPERVISOR: "supervisor",
  STORE_MANAGER: "store_manager",
  WORKER: "worker",
  CLIENT: "client",
} as const;

/** Assignable roles, ordered by authority. Mirrors the `roles` table. */
export const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "manager", label: "Manager" },
  { value: "accountant", label: "Accountant" },
  { value: "engineer", label: "Site Engineer" },
  { value: "supervisor", label: "Supervisor" },
  { value: "store_manager", label: "Store Manager" },
  { value: "worker", label: "Worker" },
  { value: "client", label: "Client Portal" },
] as const;

export const EMPLOYEE_TYPES = [
  { value: "daily_wage", label: "Daily Wage" },
  { value: "monthly_salary", label: "Monthly Salary" },
] as const;

export const ATTENDANCE_STATUSES = [
  { value: "present", label: "Present", color: "bg-emerald-500" },
  { value: "absent", label: "Absent", color: "bg-red-500" },
  { value: "half_day", label: "Half Day", color: "bg-amber-500" },
  { value: "leave", label: "Leave", color: "bg-blue-500" },
  { value: "holiday", label: "Holiday", color: "bg-violet-500" },
] as const;

export const PROJECT_STATUSES = [
  { value: "not_started", label: "Not Started", color: "bg-gray-500" },
  { value: "in_progress", label: "In Progress", color: "bg-blue-500" },
  { value: "completed", label: "Completed", color: "bg-emerald-500" },
  { value: "billed", label: "Billed", color: "bg-purple-500" },
  { value: "closed", label: "Closed", color: "bg-stone-500" },
] as const;

export const PROJECT_RATE_TYPES = [
  { value: "per_unit", label: "Per Unit" },
  { value: "per_day", label: "Per Day" },
  { value: "lump_sum", label: "Lump Sum" },
] as const;

export const WORK_CATEGORIES = [
  { value: "civil", label: "Civil Work" },
  { value: "structure", label: "Structure Installation" },
  { value: "panel_installation", label: "Panel Installation" },
  { value: "electrical", label: "Electrical Work" },
  { value: "testing", label: "Testing & Commissioning" },
  { value: "other", label: "Other" },
] as const;

export const WEATHER_CONDITIONS = [
  { value: "good", label: "Good/Clear" },
  { value: "rainy", label: "Rainy" },
  { value: "extreme_heat", label: "Extreme Heat" },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: "food", label: "Food", icon: "🍽️" },
  { value: "tea", label: "Tea/Snacks", icon: "🍵" },
  { value: "water", label: "Water", icon: "💧" },
  { value: "fuel", label: "Fuel", icon: "⛽" },
  { value: "travel", label: "Travel", icon: "🚌" },
  { value: "vehicle", label: "Vehicle/Transport", icon: "🚗" },
  { value: "equipment_rental", label: "Equipment Rental", icon: "🔧" },
  { value: "labour", label: "Local Labour", icon: "👷" },
  { value: "materials", label: "Materials", icon: "📦" },
  { value: "miscellaneous", label: "Miscellaneous", icon: "📋" },
] as const;

export const MEAL_TYPES = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "tea", label: "Tea/Snacks" },
  { value: "snacks", label: "Snacks" },
] as const;

export const EXPENSE_STATUSES = [
  { value: "pending", label: "Pending Approval", color: "bg-amber-500" },
  { value: "approved", label: "Approved", color: "bg-emerald-500" },
  { value: "rejected", label: "Rejected", color: "bg-red-500" },
] as const;

export const ADVANCE_STATUSES = [
  { value: "pending", label: "Pending Deduction", color: "bg-amber-500" },
  { value: "partially_deducted", label: "Partially Deducted", color: "bg-blue-500" },
  { value: "fully_deducted", label: "Fully Deducted", color: "bg-emerald-500" },
] as const;

export const INVOICE_STATUSES = [
  { value: "draft", label: "Draft", color: "bg-gray-500" },
  { value: "sent", label: "Sent", color: "bg-blue-500" },
  { value: "partially_paid", label: "Partially Paid", color: "bg-amber-500" },
  { value: "paid", label: "Paid", color: "bg-emerald-500" },
  { value: "overdue", label: "Overdue", color: "bg-red-500" },
] as const;

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
] as const;

export const PROJECT_DOC_TYPES = [
  { value: "work_order", label: "Client Work Order" },
  { value: "drawing", label: "Drawing/Design" },
  { value: "certificate", label: "Certificate" },
  { value: "letter", label: "Letter" },
  { value: "other", label: "Other" },
] as const;

// Pagination
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

// ─── Client companies ────────────────────────────────────

export const CUSTOMER_SOURCES = [
  { value: "referral", label: "Referral" },
  { value: "website", label: "Website" },
  { value: "walk_in", label: "Walk In" },
  { value: "social_media", label: "Social Media" },
  { value: "other", label: "Other" },
] as const;

export const CUSTOMER_STATUSES = [
  { value: "active", label: "Active", color: "bg-emerald-500" },
  { value: "prospect", label: "Prospect", color: "bg-blue-500" },
  { value: "inactive", label: "Inactive", color: "bg-stone-500" },
] as const;

// ─── Workforce ───────────────────────────────────────────

export const DEPARTMENTS = [
  { value: "operations", label: "Operations" },
  { value: "installation", label: "Installation" },
  { value: "electrical", label: "Electrical" },
  { value: "civil", label: "Civil" },
  { value: "stores", label: "Stores & Logistics" },
  { value: "accounts", label: "Accounts" },
  { value: "admin", label: "Administration" },
] as const;

export const QUOTATION_STATUSES = [
  { value: "draft", label: "Draft", color: "bg-gray-500" },
  { value: "sent", label: "Sent", color: "bg-blue-500" },
  { value: "approved", label: "Approved", color: "bg-emerald-500" },
  { value: "rejected", label: "Rejected", color: "bg-red-500" },
  { value: "expired", label: "Expired", color: "bg-amber-500" },
  { value: "converted", label: "Converted", color: "bg-purple-500" },
] as const;

export const LEAVE_TYPES = [
  { value: "sick", label: "Sick Leave" },
  { value: "casual", label: "Casual Leave" },
  { value: "annual", label: "Annual Leave" },
  { value: "unpaid", label: "Unpaid Leave" },
  { value: "other", label: "Other" },
] as const;

/**
 * Tables the audit trail covers, in the owner's words rather than the
 * schema's. Lives here and not in the server action because a "use server"
 * module may only export async functions.
 */
export const AUDITED_TABLES = [
  { value: "all", label: "Everything" },
  { value: "cash_book", label: "Cash book" },
  { value: "payments", label: "Client payments" },
  { value: "invoices", label: "Invoices" },
  { value: "expenses", label: "Expenses" },
  { value: "salary_advances", label: "Worker advances" },
  { value: "payroll_lines", label: "Payslips" },
  { value: "profiles", label: "Employees" },
  { value: "attendance", label: "Attendance" },
  { value: "sites", label: "Sites" },
  { value: "contracts", label: "Contracts" },
  { value: "companies", label: "Clients" },
] as const;
