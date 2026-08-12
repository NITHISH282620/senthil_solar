import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { getCustomersForDropdown } from "@/actions/quotations";
import { QuotationForm } from "@/components/forms/quotation-form";
import { PageHeader } from "@/components/shared/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Quotation",
};

export default async function NewQuotationPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    redirect("/dashboard");
  }

  const { data: customers } = await getCustomersForDropdown();

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Quotation"
        description="Create a quotation for a customer"
      />
      <QuotationForm customers={customers ?? []} />
    </div>
  );
}
