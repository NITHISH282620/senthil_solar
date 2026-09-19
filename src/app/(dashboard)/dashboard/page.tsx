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
  getSenthilDashboardMetrics,
} from "@/actions/dashboard";
import { getSiteOptions } from "@/actions/sites";
import { getExpenseCategories } from "@/actions/cash-book";
import { getBankAccounts } from "@/actions/bank-accounts";
import { getEmployees } from "@/actions/employees";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import { getServerDictionary } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Dashboard",
};

/** Roles that may see company-wide money. Everyone else gets the field view. */
const MONEY_ROLES = ["owner", "manager", "accountant"];

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const dict = await getServerDictionary();
  const seesMoney = MONEY_ROLES.includes(user.role);

  if (!seesMoney) {
    return <FieldDashboard name={user.full_name} dict={dict} />;
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
    { data: senthilMetrics },
  ] = await Promise.all([
    getDashboardToday(),
    getSiteProfitability({ limit: 5 }),
    getReceivables(5),
    getCashInHand(),
    getAttentionCounts(),
    getSiteOptions(),
    getExpenseCategories(),
    getEmployees({ status: "active" }),
    getSenthilDashboardMetrics(),
  ]);

  const { data: bankAccounts } = await getBankAccounts();

  const losingSites = (siteProfit ?? []).filter((s) => s.gross_profit < 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(dict, "dashboard.greeting", { name: user.full_name.split(" ")[0] })}
        description={t(dict, "dashboard.subtitle")}
      >
        <QuickMoneyLauncher
          bankAccounts={bankAccounts ?? []}
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
          label="Total Unpaid Money"
          value={formatCurrency(Number(senthilMetrics?.totalUnpaid ?? 0))}
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          tone="bad"
          href="/client-statement"
        />
        <Tile
          label="Total Advances Received"
          value={formatCurrency(Number(senthilMetrics?.totalAdvances ?? 0))}
          icon={<ArrowDownLeft className="h-4 w-4" />}
          tone="good"
          href="/payments-ledger"
        />
        <Tile
          label="Total Contracted Value"
          value={formatCurrency(Number(senthilMetrics?.totalContracted ?? 0))}
          icon={<Wallet className="h-4 w-4" />}
          href="/contracts"
        />
        <Tile
          label="Active Projects"
          value={String(senthilMetrics?.activeSitesCount ?? 0)}
          icon={<HardHat className="h-4 w-4" />}
          href="/sites"
        />
        <Tile
          label={t(dict, "dashboard.workersPresent")}
          value={String(today?.workers_present_today ?? 0)}
          hint={
            Number(today?.workers_absent_today ?? 0) > 0
              ? t(dict, "dashboard.absentCount", { count: today?.workers_absent_today ?? 0 })
              : t(dict, "dashboard.nobodyAbsent")
          }
          tone={Number(today?.workers_absent_today ?? 0) > 0 ? "bad" : "neutral"}
          icon={<Users className="h-4 w-4" />}
          href="/attendance"
        />
      </div>

      

      {/* Needs attention */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t(dict, "dashboard.needsAttention")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Attention
            label={t(dict, "dashboard.overdueInvoices")}
            count={Number(today?.overdue_invoices ?? 0)}
            icon={<AlertTriangle className="h-4 w-4" />}
            href="/billing?status=overdue"
          />
          <Attention
            label={t(dict, "dashboard.sitesPastDeadline")}
            count={Number(today?.delayed_sites ?? 0)}
            icon={<Clock className="h-4 w-4" />}
            href="/sites"
          />
          <Attention
            label={t(dict, "dashboard.sitesMissingAttendance")}
            count={Number(today?.sites_missing_attendance ?? 0)}
            icon={<Users className="h-4 w-4" />}
            href="/attendance"
          />
          <Attention
            label={t(dict, "dashboard.expensesToApprove")}
            count={Number(today?.pending_expense_approvals ?? 0)}
            icon={<Receipt className="h-4 w-4" />}
            href="/expenses?status=pending"
          />
          <Attention
            label={t(dict, "dashboard.openQuotations")}
            count={attention?.pendingQuotations ?? 0}
            icon={<FileText className="h-4 w-4" />}
            href="/quotations"
          />
          <Attention
            label={t(dict, "dashboard.advancesOutstanding")}
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
              {t(dict, "dashboard.siteProfitability")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(senthilMetrics?.siteBalances ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t(dict, "dashboard.noActiveSites")}
              </p>
            ) : (
              (senthilMetrics?.siteBalances ?? []).map((s) => (
                <Link
                  key={s.site_id}
                  href={`/client-statement/${s.site_id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {s.site_name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      Contract: {formatCurrency(Number(s.contract_value))} | Advances: {formatCurrency(Number(s.payments_received))}
                    </div>
                  </div>
                  <div className="text-right pl-2">
                    <div
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        Number(s.balance_due) > 0
                          ? "text-red-600"
                          : "text-emerald-600"
                      )}
                    >
                      {formatCurrency(Number(s.balance_due))}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Balance Due
                    </div>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Receivables */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><ArrowDownLeft className="h-4 w-4 text-emerald-600" /> Recent Client Advances</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(senthilMetrics?.recentPayments ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No recent payments found.
              </p>
            ) : (
              (senthilMetrics?.recentPayments ?? []).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {p.company_name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      Via: {p.notes?.replace("Excel import: ", "") || p.method}
                    </div>
                  </div>
                  <div className="text-right pl-2">
                    <div className="text-sm font-semibold tabular-nums text-emerald-600">
                      +{formatCurrency(Number(p.amount))}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(p.date).toLocaleDateString()}
                    </div>
                  </div>
                </div>
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
function FieldDashboard({ name, dict }: { name: string; dict: Dictionary }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={t(dict, "dashboard.fieldGreeting", { name: name.split(" ")[0] })}
        description={t(dict, "dashboard.fieldSubtitle")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/attendance/my-attendance">
          <Card className="transition-colors hover:border-primary/50">
            <CardContent className="p-6">
              <Users className="mb-2 h-5 w-5 text-muted-foreground" />
              <div className="font-medium">{t(dict, "dashboard.myAttendanceTile")}</div>
              <p className="text-sm text-muted-foreground">
                {t(dict, "dashboard.myAttendanceHint")}
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/expenses/new">
          <Card className="transition-colors hover:border-primary/50">
            <CardContent className="p-6">
              <Receipt className="mb-2 h-5 w-5 text-muted-foreground" />
              <div className="font-medium">{t(dict, "dashboard.recordExpenseTile")}</div>
              <p className="text-sm text-muted-foreground">
                {t(dict, "dashboard.recordExpenseHint")}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
