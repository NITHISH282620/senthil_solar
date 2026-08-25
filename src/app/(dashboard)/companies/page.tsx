import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Building2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { getCompanies } from "@/actions/companies";
import { getCurrentUser } from "@/actions/auth";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Companies",
};

interface PageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
  }>;
}

/**
 * RLS returns nothing here for a field role, so no data leaks — but an empty
 * page implies the access exists. Redirect instead of pretending.
 */
const CLIENT_ROLES = ["owner", "manager", "accountant"];

export default async function CompaniesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [{ data: companies }, currentUser] = await Promise.all([
    getCompanies(params),
    getCurrentUser(),
  ]);

  if (!currentUser) redirect("/login");
  if (!CLIENT_ROLES.includes(currentUser.role)) redirect("/dashboard");

  const canCreate =
    currentUser.role === "owner" || currentUser.role === "manager";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        description="Manage your client companies and commercial partners"
      >
        {canCreate && (
          <Link href="/companies/new" className={cn(buttonVariants())}>
            <Plus className="mr-2 h-4 w-4" />
            Add Company
          </Link>
        )}
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form className="flex-1 flex flex-wrap gap-3">
          <Input
            name="search"
            placeholder="Search by name, code, city..."
            defaultValue={params.search ?? ""}
            className="max-w-sm"
          />
          <Select name="status" defaultValue={params.status ?? ""}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="prospect">Prospect</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="blacklisted">Blacklisted</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
      </div>

      {/* Table */}
      {!companies || companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No companies found"
          description="Start by adding your first client company."
        >
          {canCreate && (
            <Link href="/companies/new" className={cn(buttonVariants())}>
              <Plus className="mr-2 h-4 w-4" />
              Add Company
            </Link>
          )}
        </EmptyState>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead className="hidden sm:table-cell">Code</TableHead>
                <TableHead className="hidden md:table-cell">Primary Contact</TableHead>
                <TableHead className="hidden md:table-cell">City</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((comp) => (
                <TableRow key={comp.id}>
                  <TableCell>
                    <Link
                      href={`/companies/${comp.id}`}
                      className="hover:underline"
                    >
                      <p className="font-medium">{comp.name}</p>
                      {comp.company_type && (
                        <p className="text-xs text-muted-foreground capitalize">
                          {comp.company_type}
                        </p>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell font-mono text-sm">
                    {comp.company_code}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {comp.primary_contact ? (
                      <div>
                        <p className="text-sm font-medium">
                          {comp.primary_contact.name}
                        </p>
                        {comp.primary_contact.phone && (
                          <p className="text-xs text-muted-foreground">
                            {formatPhone(comp.primary_contact.phone)}
                          </p>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {comp.city ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={comp.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
