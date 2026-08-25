import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Search, Filter } from "lucide-react";
import { buttonVariants, Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
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
import { getInvoices } from "@/actions/invoices";
import { getCurrentUser } from "@/actions/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billing & Invoices",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * RLS already returns nothing here for a field role, so this leaks no data —
 * but rendering an empty page implies the access exists and that the business
 * has no invoices. Send them somewhere true instead.
 */
const MONEY_ROLES = ["owner", "manager", "accountant"];

export default async function BillingPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const search = typeof resolvedParams.search === "string" ? resolvedParams.search : undefined;
  const status = typeof resolvedParams.status === "string" ? resolvedParams.status : undefined;

  const [currentUser, { data: invoices }] = await Promise.all([
    getCurrentUser(),
    getInvoices({ search, status }),
  ]);

  if (!currentUser) redirect("/login");
  if (!MONEY_ROLES.includes(currentUser.role)) redirect("/dashboard");

  const canCreate = currentUser.role === "owner" || currentUser.role === "manager";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing & Invoices"
        description="Manage customer invoices and track payments."
      >
        {canCreate && (
          <Link href="/billing/new" className={cn(buttonVariants())}>
            <Plus className="mr-2 h-4 w-4" />
            Create Invoice
          </Link>
        )}
      </PageHeader>

      <Card>
        <CardContent className="p-4">
          <form className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                name="search"
                placeholder="Search by invoice number..."
                className="pl-9"
                defaultValue={search}
              />
            </div>
            <div className="flex gap-2">
              <Select name="status" defaultValue={status || "all"}>
                <SelectTrigger className="w-[160px]">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="partially_paid">Partially Paid</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
              
              <Button type="submit" variant="secondary">Filter</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date / Due</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No invoices found.
                </TableCell>
              </TableRow>
            ) : (
              invoices?.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <Link
                      href={`/billing/${invoice.id}`}
                      className="font-medium hover:underline text-amber-600"
                    >
                      {invoice.invoice_number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {invoice.company?.name}
                    {invoice.company?.company_code && (
                      <div className="text-xs text-muted-foreground">
                        {invoice.company.company_code}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{formatDate(invoice.created_at)}</div>
                    {invoice.due_date && (
                      <div className="text-xs text-muted-foreground">
                        Due: {formatDate(invoice.due_date)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(invoice.total_amount ?? 0)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatCurrency(invoice.balance_due ?? 0)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={invoice.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
