import { z } from "zod";

/**
 * The tool schemas sent to the model, and the zod validators the server runs
 * on whatever the model sends back.
 *
 * This is the entire surface the model has. It cannot see a table name, a
 * SQL keyword, or a raw id it invented — every argument here is either a
 * free-text search string (resolved server-side against real rows, never
 * trusted as an id) or a plain number/date/enum the zod schema re-validates
 * regardless of what the model claims. "The model decides WHICH TOOL to
 * call. The server decides WHETHER the action is allowed" — this file is
 * the boundary between those two sentences.
 */

// ─── Groq/OpenAI-style tool definitions (sent to the model) ─────────────────

export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "find_employee",
      description:
        "Look up an employee/worker by name or partial name. Use this before propose_cash_entry with category worker_advance, so you have a real employee id — never guess one.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Name or part of a name, in any language/script the owner used." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_site",
      description: "Look up a site by name or code. Use before any tool that takes a site.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Site name, code, or part of one." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_company",
      description: "Look up a client company by name. Use before find_invoice or propose_client_credit.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Company name or part of one." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_invoice",
      description:
        "Look up open (unpaid or partially paid) invoices, optionally for one company. Use this to resolve a payment to a specific invoice before propose_invoice_payment — never invent an invoice id or assume 'the only one'.",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string", description: "A company id already returned by find_company, if the owner named a client." },
          query: { type: "string", description: "Invoice number or part of one, if the owner gave one." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_today_summary",
      description: "Cash in hand, today's in/out, and receivables. Use for questions like 'how much cash do we have' or 'what came in today'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_expense",
      description:
        "Record a company expense (not a worker advance, not a client payment). Requires a real site_id from find_site unless it is an office expense.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string", description: "Id from find_site. Omit only for a genuine office/non-site cost." },
          is_office: { type: "boolean", description: "True only if this has no site — an office/overhead cost." },
          category: { type: "string", description: "e.g. materials, transport, food, tools, misc." },
          title: { type: "string", description: "Short description of what this was for." },
          amount: { type: "number", description: "Amount in rupees, exactly as stated — never rounded or guessed." },
          payment_mode: { type: "string", enum: ["cash", "upi", "bank_transfer", "card", "credit"] },
          vendor_name: { type: "string", description: "Who was paid, if named." },
          expense_date: { type: "string", description: "YYYY-MM-DD. Omit to use today." },
        },
        required: ["category", "title", "amount", "payment_mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_cash_entry",
      description:
        "Record money moving that is NOT an invoice payment and NOT a general expense: a worker advance (category worker_advance, requires employee_id from find_employee), a salary payout, or a miscellaneous cash-in. For a normal site/office cost use propose_expense instead.",
      parameters: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["in", "out"] },
          amount: { type: "number" },
          category: { type: "string", description: "e.g. worker_advance, salary, misc_income." },
          description: { type: "string", description: "What this was for." },
          site_id: { type: "string" },
          is_office: { type: "boolean" },
          payment_mode: { type: "string", enum: ["cash", "upi", "bank", "card"] },
          employee_id: { type: "string", description: "Required, from find_employee, when category is worker_advance." },
          counterparty: { type: "string" },
          entry_date: { type: "string", description: "YYYY-MM-DD. Omit to use today." },
          bank_account_id: { type: "string", description: "Only if the owner named a specific bank account. Otherwise the primary account is used automatically when payment_mode is bank." },
        },
        required: ["direction", "amount", "category", "description", "payment_mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_invoice_payment",
      description:
        "Record money received from a client AGAINST A SPECIFIC INVOICE. You must have called find_invoice first and picked exactly one real invoice_id — never guess which invoice, and if find_invoice returns more than one plausible match, ask the owner which one instead of calling this.",
      parameters: {
        type: "object",
        properties: {
          invoice_id: { type: "string", description: "Id from find_invoice. Required." },
          amount: { type: "number" },
          payment_method: { type: "string", enum: ["cash", "bank_transfer", "cheque", "upi", "card"] },
          payment_date: { type: "string", description: "YYYY-MM-DD. Omit to use today." },
          reference_number: { type: "string" },
          tds_deducted: { type: "number", description: "TDS withheld by the client, if mentioned. Default 0." },
        },
        required: ["invoice_id", "amount", "payment_method"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_client_credit",
      description:
        "Record money received from a client that is NOT against any specific invoice — an advance before billing, or an overpayment after the last invoice was already settled. Requires a real company_id from find_company.",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" },
          amount: { type: "number" },
          payment_method: { type: "string", enum: ["cash", "bank_transfer", "cheque", "upi", "card"] },
          payment_date: { type: "string" },
          reference_number: { type: "string" },
          bank_account_id: { type: "string", description: "Only if the owner named a specific bank account. Otherwise the primary account is used automatically for bank_transfer." },
        },
        required: ["company_id", "amount", "payment_method"],
      },
    },
  },
] as const;

// ─── zod re-validation of whatever the model actually returns ───────────────
// The JSON Schema above only tells the model what to send. It is not a
// guarantee of what it sends. Every arg is re-checked here before anything
// touches an existing server action.

export const findQuerySchema = z.object({
  query: z.string().trim().min(1).max(200),
});

export const findInvoiceArgsSchema = z.object({
  company_id: z.string().uuid().optional(),
  query: z.string().trim().max(200).optional(),
});

export const proposeExpenseArgsSchema = z.object({
  site_id: z.string().uuid().optional(),
  is_office: z.boolean().optional().default(false),
  category: z.string().trim().min(1).max(50),
  title: z.string().trim().min(1).max(300),
  amount: z.coerce.number().positive().max(10_000_000),
  payment_mode: z.enum(["cash", "upi", "bank_transfer", "card", "credit"]),
  vendor_name: z.string().trim().max(200).optional(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const proposeCashEntryArgsSchema = z
  .object({
    direction: z.enum(["in", "out"]),
    amount: z.coerce.number().positive().max(10_000_000),
    category: z.string().trim().min(1).max(50),
    description: z.string().trim().min(1).max(500),
    site_id: z.string().uuid().optional(),
    is_office: z.boolean().optional().default(false),
    payment_mode: z.enum(["cash", "upi", "bank", "card"]),
    employee_id: z.string().uuid().optional(),
    counterparty: z.string().trim().max(200).optional(),
    entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    bank_account_id: z.string().uuid().optional(),
  })
  .refine((v) => v.category !== "worker_advance" || !!v.employee_id, {
    message: "A worker advance needs a specific employee — resolve one with find_employee first.",
    path: ["employee_id"],
  });

export const proposeInvoicePaymentArgsSchema = z.object({
  invoice_id: z.string().uuid(),
  amount: z.coerce.number().positive().max(10_000_000),
  payment_method: z.enum(["cash", "bank_transfer", "cheque", "upi", "card"]),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reference_number: z.string().trim().max(100).optional(),
  tds_deducted: z.coerce.number().min(0).max(10_000_000).optional().default(0),
});

export const proposeClientCreditArgsSchema = z.object({
  company_id: z.string().uuid(),
  amount: z.coerce.number().positive().max(10_000_000),
  payment_method: z.enum(["cash", "bank_transfer", "cheque", "upi", "card"]),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reference_number: z.string().trim().max(100).optional(),
  bank_account_id: z.string().uuid().optional(),
});
