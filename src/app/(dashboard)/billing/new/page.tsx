import { PageHeader } from "@/components/shared/page-header";
import { InvoiceForm } from "@/components/forms/invoice-form";
import { getCustomersForDropdown } from "@/actions/quotations";
import { getProjects } from "@/actions/projects";
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
  const projectId =
    typeof resolvedParams.projectId === "string"
      ? resolvedParams.projectId
      : undefined;
  const customerId =
    typeof resolvedParams.customerId === "string"
      ? resolvedParams.customerId
      : undefined;

  const [customersRes, projectsRes, settingsRes] = await Promise.all([
    getCustomersForDropdown(),
    getProjects(),
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
          customers={customersRes.data ?? []}
          projects={(projectsRes.data ?? []).map((p) => ({
            id: p.id,
            project_code: p.project_code,
            name: p.name,
          }))}
          defaultTaxRate={settingsRes.data?.tax_rate ?? 18}
          prefilledProjectId={projectId}
          prefilledCustomerId={customerId}
        />
      </div>
    </div>
  );
}
