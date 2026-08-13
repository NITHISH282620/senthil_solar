import { ContractForm } from "@/components/forms/contract-form";
import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser } from "@/actions/auth";
import { getContract } from "@/actions/contracts";
import { getCompanies } from "@/actions/companies";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Edit Contract",
};

export default async function EditContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  const [currentUser, { data: contract, error }, { data: companies }] = await Promise.all([
    getCurrentUser(),
    getContract(id),
    getCompanies()
  ]);

  if (!currentUser || !["owner", "manager"].includes(currentUser.role)) {
    redirect(`/contracts/${id}`);
  }

  if (error || !contract) {
    notFound();
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Edit Contract"
        description={`Editing details for ${contract.contract_number}`}
        backHref={`/contracts/${id}`}
      />
      <ContractForm initialData={contract} companies={companies ?? []} />
    </div>
  );
}
