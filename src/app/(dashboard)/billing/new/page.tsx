import { PageHeader } from "@/components/shared/page-header";
import { InvoiceForm } from "@/components/forms/invoice-form";
import { getCustomersForDropdown } from "@/actions/quotations";
import { getWorkOrders } from "@/actions/work-orders";
import { getCompanySettings } from "@/actions/settings";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Invoice",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function NewInvoicePage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const workOrderId = typeof resolvedParams.workOrderId === "string" ? resolvedParams.workOrderId : undefined;
  const customerId = typeof resolvedParams.customerId === "string" ? resolvedParams.customerId : undefined;

  // We can fetch work orders to allow linking
  const [customersRes, workOrdersRes, settingsRes] = await Promise.all([
    getCustomersForDropdown(),
    getWorkOrders(),
    getCompanySettings(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Create Invoice" 
        description="Generate a new invoice for a customer or work order."
      />
      <div className="max-w-4xl">
        <InvoiceForm 
          customers={customersRes.data ?? []} 
          workOrders={workOrdersRes.data ?? []}
          defaultTaxRate={settingsRes.data?.tax_rate ?? 18}
          prefilledWorkOrderId={workOrderId}
          prefilledCustomerId={customerId}
        />
      </div>
    </div>
  );
}
