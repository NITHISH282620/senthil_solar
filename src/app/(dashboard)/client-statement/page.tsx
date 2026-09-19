import { redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardList, ChevronRight, Building2 } from "lucide-react";
import { getCurrentUser } from "@/actions/auth";
import { getCompaniesWithStatements } from "@/actions/client-statement";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Client Statement",
};

const ALLOWED_ROLES = ["owner", "manager", "accountant"];

export default async function ClientStatementPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!ALLOWED_ROLES.includes(currentUser.role)) redirect("/dashboard");

  const { data: companies } = await getCompaniesWithStatements();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client Statement"
        description="View quotation details and payment comparison for each client"
      />

      {!companies || companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No active clients"
          description="Add clients first from the Companies section."
        />
      ) : (
        <div className="rounded-lg border divide-y">
          {companies.map((company) => (
            <Link
              key={company.id}
              href={`/client-statement/${company.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="h-9 w-9 rounded-full bg-orange-100 dark:bg-orange-950 flex items-center justify-center shrink-0">
                  <ClipboardList className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="font-medium text-sm">{company.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {company.company_code}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
