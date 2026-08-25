import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, FileText } from "lucide-react";
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
import { getQuotations } from "@/actions/quotations";
import { getCurrentUser } from "@/actions/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { QUOTATION_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quotations",
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

export default async function QuotationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [{ data: quotations }, currentUser] = await Promise.all([
    getQuotations(params),
    getCurrentUser(),
  ]);

  if (!currentUser) redirect("/login");
  if (!CLIENT_ROLES.includes(currentUser.role)) redirect("/dashboard");

  const canCreate =
    currentUser.role === "owner" || currentUser.role === "manager";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotations"
        description="Create and manage customer quotations"
      >
        {canCreate && (
          <Link href="/quotations/new" className={cn(buttonVariants())}>
            <Plus className="mr-2 h-4 w-4" />
            New Quotation
          </Link>
        )}
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form className="flex-1 flex gap-3">
          <Input
            name="search"
            placeholder="Search by title or number..."
            defaultValue={params.search ?? ""}
            className="max-w-sm"
          />
          <Select name="status" defaultValue={params.status ?? ""}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {QUOTATION_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
      </div>

      {/* Table */}
      {!quotations || quotations.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No quotations found"
          description="Create your first quotation for a customer."
        >
          {canCreate && (
            <Link href="/quotations/new" className={cn(buttonVariants())}>
              <Plus className="mr-2 h-4 w-4" />
              New Quotation
            </Link>
          )}
        </EmptyState>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quotation</TableHead>
                <TableHead className="hidden sm:table-cell">Number</TableHead>
                <TableHead className="hidden md:table-cell">Customer</TableHead>
                <TableHead className="hidden lg:table-cell">
                  Valid Until
                </TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotations.map((qt) => (
                <TableRow key={qt.id}>
                  <TableCell>
                    <Link
                      href={`/quotations/${qt.id}`}
                      className="hover:underline"
                    >
                      <p className="font-medium">{qt.title}</p>
                      {qt.capacity_kw && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {qt.capacity_kw} kW System
                        </div>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell font-mono text-sm">
                    {qt.quotation_number}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {qt.company?.name ?? "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {formatDate(qt.valid_until)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(qt.total_amount ?? 0)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={qt.status} />
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
