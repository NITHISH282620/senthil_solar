import type { Database } from "./database.gen";

export type { Database } from "./database.gen";

// Export raw row types for convenience
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Company = Database["public"]["Tables"]["companies"]["Row"];
export type CompanyContact = Database["public"]["Tables"]["company_contacts"]["Row"];
export type Contract = Database["public"]["Tables"]["contracts"]["Row"];
export type ContractMilestone = Database["public"]["Tables"]["contract_milestones"]["Row"];
export type Site = Database["public"]["Tables"]["sites"]["Row"];
export type SiteStage = Database["public"]["Tables"]["site_stages"]["Row"];
export type SiteAssignment = Database["public"]["Tables"]["site_assignments"]["Row"];
export type SiteEvent = Database["public"]["Tables"]["site_events"]["Row"];
export type Quotation = Database["public"]["Tables"]["quotations"]["Row"];
export type QuotationItem = Database["public"]["Tables"]["quotation_items"]["Row"];
export type Attendance = Database["public"]["Tables"]["attendance"]["Row"];
export type LeaveRequest = Database["public"]["Tables"]["leave_requests"]["Row"];
export type SalaryAdvance = Database["public"]["Tables"]["salary_advances"]["Row"];
export type PayrollRun = Database["public"]["Tables"]["payroll_runs"]["Row"];
export type PayrollLine = Database["public"]["Tables"]["payroll_lines"]["Row"];
export type Expense = Database["public"]["Tables"]["expenses"]["Row"];
export type ExpenseCategory = Database["public"]["Tables"]["expense_categories"]["Row"];
export type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
export type InvoiceItem = Database["public"]["Tables"]["invoice_items"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type Document = Database["public"]["Tables"]["documents"]["Row"];
export type CompanySettings = Database["public"]["Tables"]["company_settings"]["Row"];
