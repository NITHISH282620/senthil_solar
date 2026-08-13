import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { getCompany } from "@/actions/companies";
import { CompanyForm } from "@/components/forms/company-form";
import { PageHeader } from "@/components/shared/page-header";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Edit Company",
};

export default async function EditCompanyPage({ params }: PageProps) {
  const { id } = await params;
  const [{ data: company }, currentUser] = await Promise.all([
    getCompany(id),
    getCurrentUser(),
  ]);

  if (!company) {
    notFound();
  }

  if (!currentUser || !["owner", "manager"].includes(currentUser.role)) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Company"
        description={`Updating ${company.name}'s profile`}
      />
      <CompanyForm company={company} />
    </div>
  );
}
