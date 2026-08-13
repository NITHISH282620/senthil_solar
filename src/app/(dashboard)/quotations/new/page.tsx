import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { getCompaniesForDropdown } from "@/actions/quotations";
import { QuotationForm } from "@/components/forms/quotation-form";
import { PageHeader } from "@/components/shared/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Quotation",
};

export default async function NewQuotationPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || !["owner", "manager"].includes(currentUser.role)) {
    redirect("/dashboard");
  }

  const { data: companies } = await getCompaniesForDropdown();

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Quotation"
        description="Create a quotation for a customer"
      />
      <QuotationForm companies={companies ?? []} />
    </div>
  );
}
