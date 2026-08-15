import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { QuickMoneyLauncher } from "@/components/shared/quick-money-launcher";
import { getCashBook, getCashSummary, getExpenseCategories } from "@/actions/cash-book";
import { getSiteOptions } from "@/actions/sites";
import { getEmployees } from "@/actions/employees";
import { getCurrentUser } from "@/actions/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cash Book",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/** Only the back office sees the whole company ledger. */
const LEDGER_ROLES = ["owner", "manager", "accountant"];

export default async function CashBookPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const direction =
    typeof params.direction === "string" ? params.direction : undefined;
  const siteId = typeof params.site === "string" ? params.site : undefined;

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!LEDGER_ROLES.includes(currentUser.role)) redirect("/unauthorized");

  const [
    { data: entries },
    { data: summary },
    { data: sites },
    { data: categories },
    { data: employees },
  ] = await Promise.all([
    getCashBook({ direction, site_id: siteId }),
    getCashSummary(),
    getSiteOptions(),
    getExpenseCategories(),
    getEmployees({ status: "active" }),
  ]);

  const rows = entries ?? [];

  // The running balance only means anything against the whole ledger. Under a
  // filter the visible rows are a subset, so the column is suppressed rather
  // than shown as a number that will not reconcile.
  const isFiltered = Boolean(siteId) || (!!direction && direction !== "all");

  const balanceByRow = new Map<string, number>();
  if (!isFiltered) {
    // Rows arrive newest-first, so walk back from the closing balance.
    let carried = summary?.balance ?? 0;
    for (const row of rows) {
      balanceByRow.set(row.id, carried);
      carried -= row.direction === "in" ? Number(row.amount) : -Number(row.amount);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Book"
        description="Every rupee in and out, with a running balance."
      >
        <QuickMoneyLauncher
          sites={sites ?? []}
          categories={categories ?? []}
          workers={(employees ?? []).map((e) => ({
            id: e.id,
            full_name: e.full_name,
          }))}
        />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          label="In hand"
          value={summary?.balance ?? 0}
          icon={<Wallet className="h-4 w-4" />}
          emphasis
        />
        <SummaryTile
          label="In today"
          value={summary?.todayIn ?? 0}
          icon={<ArrowDownLeft className="h-4 w-4 text-emerald-600" />}
        />
        <SummaryTile
          label="Out today"
          value={summary?.todayOut ?? 0}
          icon={<ArrowUpRight className="h-4 w-4 text-red-600" />}
        />
        <SummaryTile
          label="Net this month"
          value={(summary?.monthIn ?? 0) - (summary?.monthOut ?? 0)}
          icon={<Wallet className="h-4 w-4" />}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">In</TableHead>
                  <TableHead className="text-right">Out</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No entries yet. Use Money In or Money Out to record the
                      first one.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const amount = Number(row.amount);
                    const isIn = row.direction === "in";
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDate(row.entry_date)}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{row.description}</div>
                          {row.counterparty && (
                            <div className="text-xs text-muted-foreground">
                              {row.counterparty}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.is_office ? "Office" : row.site?.name ?? "—"}
                        </TableCell>
                        <TableCell className="capitalize text-muted-foreground">
                          {row.payment_mode}
                        </TableCell>
                        <TableCell className="text-right font-medium text-emerald-600">
                          {isIn ? formatCurrency(amount) : ""}
                        </TableCell>
                        <TableCell className="text-right font-medium text-red-600">
                          {!isIn ? formatCurrency(amount) : ""}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {isFiltered
                            ? "—"
                            : formatCurrency(balanceByRow.get(row.id) ?? 0)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon,
  emphasis,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-sm">{label}</span>
          {icon}
        </div>
        <div
          className={cn(
            "mt-1 font-semibold tabular-nums",
            emphasis ? "text-2xl" : "text-xl",
            value < 0 && "text-red-600"
          )}
        >
          {formatCurrency(value)}
        </div>
      </CardContent>
    </Card>
  );
}
