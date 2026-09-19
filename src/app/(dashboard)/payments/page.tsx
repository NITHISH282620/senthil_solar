import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { getPaymentsLedger } from "@/actions/dashboard";
import { getContracts } from "@/actions/contracts";
import { getCompaniesForDropdown } from "@/actions/quotations";
import { getCurrentUser } from "@/actions/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Payments Ledger",
};

const MONEY_ROLES = ["owner", "manager", "accountant"];

interface PageProps {
  searchParams: Promise<{ contract_id?: string; company_id?: string }>;
}

/**
 * The digital replacement for the owner's old paper notebook — every active
 * site in one place, Approved / Received / Balance, sites owed the most
 * money at the top. Sites under the same contract still each get their own
 * row, exactly like the notebook tracked them.
 */
export default async function PaymentsLedgerPage({ searchParams }: PageProps) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!MONEY_ROLES.includes(currentUser.role)) redirect("/dashboard");

  const rawParams = await searchParams;
  const contractId =
    rawParams.contract_id && rawParams.contract_id !== "all" ? rawParams.contract_id : undefined;
  const companyId =
    rawParams.company_id && rawParams.company_id !== "all" ? rawParams.company_id : undefined;

  const [{ data: rows }, { data: contracts }, { data: companies }] = await Promise.all([
    getPaymentsLedger({ contractId, companyId }),
    getContracts(),
    getCompaniesForDropdown(),
  ]);

  const totals = (rows ?? []).reduce(
    (acc, r) => {
      acc.approved += Number(r.revenue_allocated) || 0;
      acc.received += Number(r.client_received) || 0;
      acc.balance += Number(r.client_balance_due) || 0;
      return acc;
    },
    { approved: 0, received: 0, balance: 0 }
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments Ledger"
        description="Every active site: what was approved, what's come in, what's still owed."
      />

      <form className="flex flex-wrap gap-2" action="/payments">
        <Select name="contract_id" defaultValue={contractId ?? "all"}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All contracts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All contracts</SelectItem>
            {(contracts ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.contract_number} — {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select name="company_id" defaultValue={companyId ?? "all"}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {(companies ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {(contractId || companyId) && (
          <Link href="/payments" className={cn(buttonVariants({ variant: "ghost" }))}>
            Clear
          </Link>
        )}
      </form>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Approved</p>
            <p className="text-xl font-semibold">{formatCurrency(totals.approved)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Received</p>
            <p className="text-xl font-semibold text-emerald-600">
              {formatCurrency(totals.received)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className="text-xl font-semibold text-red-600">
              {formatCurrency(totals.balance)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead className="text-right">Approved</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Total Spent</TableHead>
                <TableHead>Last Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!rows || rows.length === 0) ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No active sites with a priced quotation yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.site_id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">
                      <Link href={`/sites/${r.site_id}`} className="hover:underline">
                        {r.site_name}
                      </Link>
                      <div className="text-xs text-muted-foreground font-mono">
                        {r.site_code}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.company_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {r.contract_number ?? "Standalone"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(Number(r.revenue_allocated))}
                    </TableCell>
                    <TableCell className="text-right text-emerald-600">
                      {formatCurrency(Number(r.client_received))}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium",
                        Number(r.client_balance_due) > 0 && "text-red-600"
                      )}
                    >
                      {formatCurrency(Number(r.client_balance_due))}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatCurrency(Number(r.total_cost))}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.last_payment_date ? formatDate(r.last_payment_date) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
