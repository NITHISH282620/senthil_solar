import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { getCompaniesForDropdown } from "@/actions/quotations";
import { getSite } from "@/actions/sites";
import { QuotationForm } from "@/components/forms/quotation-form";
import { PageHeader } from "@/components/shared/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Quotation",
};

interface PageProps {
  searchParams: Promise<{ site_id?: string }>;
}

export default async function NewQuotationPage({ searchParams }: PageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser || !["owner", "manager"].includes(currentUser.role)) {
    redirect("/dashboard");
  }

  const { site_id: siteId } = await searchParams;

  const [{ data: companies }, siteResult] = await Promise.all([
    getCompaniesForDropdown(),
    siteId ? getSite(siteId) : Promise.resolve({ data: null, error: null }),
  ]);

  const site = siteResult.data;
  const lockedSite = site
    ? {
        id: site.id,
        name: site.name,
        company_id: site.company_id,
        company_name: site.company?.name ?? "",
      }
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Quotation"
        description={
          lockedSite
            ? `Pricing the work for ${lockedSite.name}`
            : "Create a quotation for a customer"
        }
      />
      <QuotationForm companies={companies ?? []} lockedSite={lockedSite} />
    </div>
  );
}
