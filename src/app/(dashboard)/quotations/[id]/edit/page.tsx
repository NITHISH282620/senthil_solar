import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { getQuotation, getCustomersForDropdown } from "@/actions/quotations";
import { QuotationForm } from "@/components/forms/quotation-form";
import { PageHeader } from "@/components/shared/page-header";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Edit Quotation",
};

export default async function EditQuotationPage({ params }: PageProps) {
  const { id } = await params;
  const [{ data: quotation }, currentUser, { data: customers }] =
    await Promise.all([
      getQuotation(id),
      getCurrentUser(),
      getCustomersForDropdown(),
    ]);

  if (!quotation) {
    notFound();
  }

  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    redirect("/dashboard");
  }

  // Only draft/sent quotations can be edited
  if (!["draft", "sent"].includes(quotation.status)) {
    redirect(`/quotations/${id}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Quotation"
        description={`Editing ${quotation.quotation_number}`}
      />
      <QuotationForm quotation={quotation} customers={customers ?? []} />
    </div>
  );
}
