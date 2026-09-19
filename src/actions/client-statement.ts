"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";

const ALLOWED_ROLES = ["owner", "manager", "accountant"];

export interface QuotationLineItem {
  id: string;
  section: string | null;
  description: string;
  unit: string | null;
  quantity: number;
  unit_price: number;
    total: number;
  sort_order: number;
}

export interface ClientQuotationDetail {
  quotation_id: string;
  quotation_number: string;
  title: string;
  status: string;
  capacity_kw: number | null;
  subtotal: number;
  discount_amount: number;
  gst_percent: number;
  gst_amount: number;
  total_amount: number;
  approved_amount: number;
  items: QuotationLineItem[];
}

export interface PaymentEntry {
  id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
}

export interface ClientStatementSummary {
  company_id: string;
  company_name: string;
  company_code: string;
  approved_amount: number;
  total_paid: number;
  balance_due: number;
  payments: PaymentEntry[];
  quotation: ClientQuotationDetail | null;
}

export async function getCompaniesWithStatements(): Promise<{
  data: { id: string; name: string; company_code: string }[] | null;
  error: string | null;
}> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !ALLOWED_ROLES.includes(currentUser.role)) {
    return { data: null, error: "Unauthorized" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("companies")
    .select("id, name, company_code")
    .is("deleted_at", null)
    .eq("status", "active")
    .order("name");

  if (error) return { data: null, error: error.message };
  return {
    data: data as { id: string; name: string; company_code: string }[],
    error: null,
  };
}

export async function getClientStatement(
  companyId: string
): Promise<{ data: ClientStatementSummary | null; error: string | null }> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !ALLOWED_ROLES.includes(currentUser.role)) {
    return { data: null, error: "Unauthorized" };
  }

  const supabase = await createClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, company_code")
    .eq("id", companyId)
    .single();

  if (companyError || !company) {
    return { data: null, error: "Company not found." };
  }

  const c = company as { id: string; name: string; company_code: string };

  // Pick the most recent converted/approved/sent quotation for this client
  const { data: quotations } = await supabase
    .from("quotations")
    .select(
      "id, quotation_number, title, status, capacity_kw, subtotal, discount_amount, gst_percent, gst_amount, total_amount"
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("status", ["converted", "approved", "sent"])
    .order("created_at", { ascending: false })
    .limit(1);

  let quotationDetail: ClientQuotationDetail | null = null;

  if (quotations && quotations.length > 0) {
    const q = quotations[0] as {
      id: string;
      quotation_number: string;
      title: string;
      status: string;
      capacity_kw: number | null;
      subtotal: number;
      discount_amount: number;
      gst_percent: number;
      gst_amount: number;
      total_amount: number;
    };

    const { data: items } = await supabase
      .from("quotation_items")
      .select(
        "id, section, description, unit, quantity, unit_price, sort_order"
      )
      .eq("quotation_id", q.id)
      .order("sort_order");

    const lineItems = ((items ?? []) as QuotationLineItem[]).map((item) => ({
      ...item,
      total: item.quantity * item.unit_price,
    }));

    // Try to find the matching contract value (DSK approved amount)
    const { data: contract } = await supabase
      .from("contracts")
      .select("contract_value")
      .eq("company_id", companyId)
      .eq("quotation_id", q.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const approvedAmount =
      (contract as { contract_value: number } | null)?.contract_value ??
      q.total_amount;

    quotationDetail = {
      quotation_id: q.id,
      quotation_number: q.quotation_number,
      title: q.title,
      status: q.status,
      capacity_kw: q.capacity_kw,
      subtotal: q.subtotal,
      discount_amount: q.discount_amount,
      gst_percent: q.gst_percent,
      gst_amount: q.gst_amount,
      total_amount: q.total_amount,
      approved_amount: approvedAmount,
      items: lineItems,
    };
  }

  // All inbound payments for this company, oldest first
  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select(
      "id, payment_date, amount, payment_method, reference_number, notes"
    )
    .eq("company_id", companyId)
    .eq("direction", "inbound")
    .is("deleted_at", null)
    .order("payment_date", { ascending: true });

  if (paymentsError) {
    return { data: null, error: paymentsError.message };
  }

  const paymentList = (payments ?? []) as PaymentEntry[];
  const totalPaid = paymentList.reduce((sum, p) => sum + Number(p.amount), 0);
  const approvedAmount = quotationDetail?.approved_amount ?? 0;
  const balanceDue = approvedAmount - totalPaid;

  return {
    data: {
      company_id: c.id,
      company_name: c.name,
      company_code: c.company_code,
      approved_amount: approvedAmount,
      total_paid: totalPaid,
      balance_due: balanceDue,
      payments: paymentList,
      quotation: quotationDetail,
    },
    error: null,
  };
}
