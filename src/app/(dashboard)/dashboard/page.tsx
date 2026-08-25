import Link from "next/link";
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  HardHat,
  Users,
  AlertTriangle,
  Clock,
  FileText,
  Receipt,
  TrendingDown,
  HandCoins,
  Coins,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { QuickMoneyLauncher } from "@/components/shared/quick-money-launcher";
import { getCurrentUser } from "@/actions/auth";
import {
  getDashboardToday,
  getSiteProfitability,
  getReceivables,
  getCashInHand,
  getAttentionCounts,
} from "@/actions/dashboard";
import { getSiteOptions } from "@/actions/sites";
import { getExpenseCategories } from "@/actions/cash-book";
import { getEmployees } from "@/actions/employees";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
};

/** Roles that may see company-wide money. Everyone else gets the field view. */
const MONEY_ROLES = ["owner", "manager", "accountant"];

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const seesMoney = MONEY_ROLES.includes(user.role);

  if (!seesMoney) {
    return <FieldDashboard name={user.full_name} />;
  }

  const [
    { data: today },
    { data: siteProfit },
    { data: receivables },
    { data: cashInHand },
    { data: attention },
    { data: sites },
    { data: categories },
    { data: employees },
  ] = await Promise.all([
    getDashboardToday(),
    getSiteProfitability({ limit: 5 }),
    getReceivables(5),
    getCashInHand(),
    getAttentionCounts(),
    getSiteOptions(),
    getExpenseCategories(),
    getEmployees({ status: "active" }),
  ]);

  const losingSites = (siteProfit ?? []).filter((s) => s.gross_profit < 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good morning, ${user.full_name.split(" ")[0]}`}
        description="Where the work is, and where the money went."
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

      {/* Money and work, today */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Tile
          label="Cash in hand"
          value={formatCurrency(cashInHand)}
          icon={<Wallet className="h-4 w-4" />}
          tone={cashInHand < 0 ? "bad" : "neutral"}
          href="/cash"
        />
        <Tile
          label="In today"
          value={formatCurrency(Number(today?.cash_in_today ?? 0))}
          hint={`${formatCurrency(Number(today?.cash_in_yesterday ?? 0))} yesterday`}
          icon={<ArrowDownLeft className="h-4 w-4" />}
          tone="good"
          href="/cash?direction=in"
        />
        <Tile
          label="Out today"
          value={formatCurrency(Number(today?.cash_out_today ?? 0))}
          hint={`${formatCurrency(Number(today?.cash_out_yesterday ?? 0))} yesterday`}
          icon={<ArrowUpRight className="h-4 w-4" />}
          tone="bad"
          href="/cash?direction=out"
        />
        <Tile
          label="Clients owe"
          value={formatCurrency(Number(today?.total_outstanding ?? 0))}
          icon={<Receipt className="h-4 w-4" />}
          href="/billing"
        />
        <Tile
          label="Active sites"
          value={String(today?.active_sites ?? 0)}
          icon={<HardHat className="h-4 w-4" />}
          href="/sites"
        />
        <Tile
          label="Workers present"
          value={String(today?.workers_present_today ?? 0)}
          hint={
            Number(today?.workers_absent_today ?? 0) > 0
              ? `${today?.workers_absent_today} absent`
              : "nobody absent"
          }
          tone={Number(today?.workers_absent_today ?? 0) > 0 ? "bad" : "neutral"}
          icon={<Users className="h-4 w-4" />}
          href="/attendance"
        />
      </div>

      {/* What the business owes, and what it is holding for someone else.
          Both were computable and shown nowhere, which is how an overpaid
          Rs 50,000 stayed invisible. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Tile
          label="You owe your people"
          value={formatCurrency(Number(today?.owed_to_employees ?? 0))}
          hint="Approved claims and finalised wages not yet paid out"
          icon={<HandCoins className="h-4 w-4" />}
          tone={Number(today?.owed_to_employees ?? 0) > 0 ? "bad" : "neutral"}
          href="/employees"
        />
        <Tile
          label="Client credit you hold"
          value={formatCurrency(Number(today?.client_credit_held ?? 0))}
          hint="Money received that no invoice has claimed yet"
          icon={<Coins className="h-4 w-4" />}
          href="/billing"
        />
      </div>

      {/* Needs attention */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Needs attention</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Attention
            label="Overdue invoices"
            count={Number(today?.overdue_invoices ?? 0)}
            icon={<AlertTriangle className="h-4 w-4" />}
            href="/billing?status=overdue"
          />
          <Attention
            label="Sites past deadline"
            count={Number(today?.delayed_sites ?? 0)}
            icon={<Clock className="h-4 w-4" />}
            href="/sites"
          />
          <Attention
            label="Sites missing attendance"
            count={Number(today?.sites_missing_attendance ?? 0)}
            icon={<Users className="h-4 w-4" />}
            href="/attendance"
          />
          <Attention
            label="Expenses to approve"
            count={Number(today?.pending_expense_approvals ?? 0)}
            icon={<Receipt className="h-4 w-4" />}
            href="/expenses?status=pending"
          />
          <Attention
            label="Open quotations"
            count={attention?.pendingQuotations ?? 0}
            icon={<FileText className="h-4 w-4" />}
            href="/quotations"
          />
          <Attention
            label="Advances outstanding"
            count={attention?.outstandingAdvances ?? 0}
            icon={<Wallet className="h-4 w-4" />}
            href="/employees"
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Site profitability — worst first */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {losingSites.length > 0 && (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              Site profitability
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(siteProfit ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No active sites yet.
              </p>
            ) : (
              (siteProfit ?? []).map((s) => (
                <Link
                  key={s.site_id}
                  href={`/sites/${s.site_id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {s.site_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatCurrency(Number(s.total_cost))} spent of{" "}
                      {formatCurrency(Number(s.revenue_allocated))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        Number(s.gross_profit) < 0
                          ? "text-red-600"
                          : "text-emerald-600"
                      )}
                    >
                      {formatCurrency(Number(s.gross_profit))}
                    </div>
                    {s.margin_percent !== null && (
                      <div className="text-xs text-muted-foreground">
                        {Number(s.margin_percent)}% margin
                      </div>
                    )}
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Receivables */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Money owed to you</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(receivables ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing outstanding.
              </p>
            ) : (
              (receivables ?? []).map((r) => (
                <Link
                  key={r.invoice_id}
                  href={`/billing/${r.invoice_id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {r.company_name}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {r.invoice_number}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums">
                      {formatCurrency(Number(r.balance_due))}
                    </div>
                    {Number(r.days_overdue) > 0 && (
                      <div className="text-xs text-red-600">
                        {r.days_overdue} days overdue
                      </div>
                    )}
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  href,
}: {
  label: string;
  value: string;
  /** The comparison that turns a number into an answer: yesterday, or who is missing. */
  hint?: string;
  icon: React.ReactNode;
  tone?: "good" | "bad" | "neutral";
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:border-primary/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs">{label}</span>
            {icon}
          </div>
          <div
            className={cn(
              "mt-1 text-lg font-semibold tabular-nums",
              tone === "good" && "text-emerald-600",
              tone === "bad" && "text-red-600"
            )}
          >
            {value}
          </div>
          {hint ? (
            <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

function Attention({
  label,
  count,
  icon,
  href,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  href: string;
}) {
  const isClear = count === 0;
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors",
        isClear
          ? "text-muted-foreground"
          : "border-amber-500/40 bg-amber-500/5 hover:border-amber-500"
      )}
    >
      <span className="flex items-center gap-2 text-sm">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          !isClear && "text-amber-600 dark:text-amber-400"
        )}
      >
        {count}
      </span>
    </Link>
  );
}

/**
 * Workers, engineers and supervisors get their own work, never company money.
 * The access model is enforced in RLS; this only avoids rendering tiles that
 * would come back empty for them anyway.
 */
function FieldDashboard({ name }: { name: string }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hello, ${name.split(" ")[0]}`}
        description="Your work today."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/attendance/my-attendance">
          <Card className="transition-colors hover:border-primary/50">
            <CardContent className="p-6">
              <Users className="mb-2 h-5 w-5 text-muted-foreground" />
              <div className="font-medium">My attendance</div>
              <p className="text-sm text-muted-foreground">
                Check in, check out, and see this month.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/expenses/new">
          <Card className="transition-colors hover:border-primary/50">
            <CardContent className="p-6">
              <Receipt className="mb-2 h-5 w-5 text-muted-foreground" />
              <div className="font-medium">Record an expense</div>
              <p className="text-sm text-muted-foreground">
                Submit what you spent on site for approval.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
