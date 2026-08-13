import { PageHeader } from "@/components/shared/page-header";
import { InvoiceForm } from "@/components/forms/invoice-form";
import { getCompaniesForDropdown } from "@/actions/quotations";
import { getContracts } from "@/actions/contracts";
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
  const contractId =
    typeof resolvedParams.contractId === "string"
      ? resolvedParams.contractId
      : undefined;
  const companyId =
    typeof resolvedParams.companyId === "string"
      ? resolvedParams.companyId
      : undefined;

  const [companiesRes, contractsRes, settingsRes] = await Promise.all([
    getCompaniesForDropdown(),
    getContracts(),
    getCompanySettings(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Invoice"
        description="Generate a new invoice for a client company or project."
      />
      <div className="max-w-4xl">
        <InvoiceForm
          companies={companiesRes.data ?? []}
          contracts={(contractsRes.data ?? []).map((c) => ({
            id: c.id,
            contract_number: c.contract_number,
            title: c.title,
          }))}
          defaultGstRate={settingsRes.data?.default_gst_percent ?? 18}
          prefilledContractId={contractId}
          prefilledCompanyId={companyId}
        />
      </div>
    </div>
  );
}
