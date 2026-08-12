import { PageHeader } from "@/components/shared/page-header";
import { WorkOrderForm } from "@/components/forms/work-order-form";
import { getCustomersForDropdown } from "@/actions/quotations";
import { getQuotations } from "@/actions/quotations";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Work Order",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function NewWorkOrderPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const quotationId = typeof resolvedParams.quotationId === "string" ? resolvedParams.quotationId : undefined;
  const customerId = typeof resolvedParams.customerId === "string" ? resolvedParams.customerId : undefined;

  const [customersRes, quotationsRes] = await Promise.all([
    getCustomersForDropdown(),
    getQuotations({ status: "approved" }), // Fetch approved quotations for linking
  ]);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Create Work Order" 
        description="Create a new work order or convert from an approved quotation."
      />
      <div className="max-w-3xl">
        <WorkOrderForm 
          customers={customersRes.data ?? []} 
          quotations={quotationsRes.data ?? []}
          prefilledQuotationId={quotationId}
          prefilledCustomerId={customerId}
        />
      </div>
    </div>
  );
}
