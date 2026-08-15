import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { SiteForm } from "@/components/forms/site-form";
import { getContracts } from "@/actions/contracts";
import { getSiteStages } from "@/actions/sites";
import { getEmployees } from "@/actions/employees";
import { getCurrentUser } from "@/actions/auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Site",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function NewSitePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const contractId =
    typeof params.contract === "string" ? params.contract : undefined;

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!["owner", "manager"].includes(currentUser.role)) redirect("/sites");

  const [{ data: contracts }, { data: stages }, { data: people }] =
    await Promise.all([getContracts(), getSiteStages(), getEmployees({ status: "active" })]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="New Site"
        description="A site belongs to a contract and carries its own costs."
        backHref="/sites"
      />
      <SiteForm
        contracts={(contracts ?? []).map((c) => ({
          id: c.id,
          contract_number: c.contract_number,
          title: c.title,
        }))}
        stages={stages ?? []}
        people={(people ?? []).map((p) => ({ id: p.id, full_name: p.full_name }))}
        defaultContractId={contractId}
      />
    </div>
  );
}
