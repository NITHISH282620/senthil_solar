import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, MapPin, Zap, Users, Building2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { QuickMoneyLauncher } from "@/components/shared/quick-money-launcher";
import { getSite, getSiteStages } from "@/actions/sites";
import { getSiteProfit } from "@/actions/dashboard";
import { getExpenseCategories } from "@/actions/cash-book";
import { getEmployees } from "@/actions/employees";
import { getCurrentUser } from "@/actions/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const { data } = await getSite(id);
  return { title: data?.name ?? "Site" };
}

/** Only the back office sees a site's money. */
const MONEY_ROLES = ["owner", "manager", "accountant"];

export default async function SiteDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [{ data: site }, currentUser, { data: stages }] = await Promise.all([
    getSite(id),
    getCurrentUser(),
    getSiteStages(),
  ]);

  if (!site) notFound();

  const seesMoney = !!currentUser && MONEY_ROLES.includes(currentUser.role);
  const canEdit = !!currentUser && ["owner", "manager"].includes(currentUser.role);

  // Only fetch money and picker data for the people allowed to act on it.
  const [{ data: profit }, { data: categories }, { data: employees }] =
    seesMoney
      ? await Promise.all([
          getSiteProfit(id),
          getExpenseCategories(),
          getEmployees({ status: "active" }),
        ])
      : [{ data: null }, { data: null }, { data: null }];

  const stageLabel =
    (stages ?? []).find((s) => s.code === site.stage)?.label ?? site.stage;

  return (
    <div className="space-y-6">
      <PageHeader title={site.name} backHref="/sites">
        <div className="flex flex-wrap items-center gap-2">
          {seesMoney && (
            <QuickMoneyLauncher
              variant="compact"
              lockedSiteId={site.id}
              sites={[]}
              categories={categories ?? []}
              workers={(employees ?? []).map((e) => ({
                id: e.id,
                full_name: e.full_name,
              }))}
            />
          )}
          {canEdit && (
            <Link
              href={`/sites/${site.id}/edit`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          )}
        </div>
      </PageHeader>

      {/* Identity and progress */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-sm text-muted-foreground">
              {site.site_code}
            </span>
            <StatusBadge status={site.status} />
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
              {stageLabel}
            </span>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {site.company && (
              <Link
                href={`/companies/${site.company.id}`}
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <Building2 size={14} />
                {site.company.name}
              </Link>
            )}
            {site.contract && (
              <Link
                href={`/contracts/${site.contract.id}`}
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                {site.contract.contract_number}
              </Link>
            )}
            {site.capacity_kw ? (
              <span className="flex items-center gap-1.5">
                <Zap size={14} />
                {site.capacity_kw} kW
              </span>
            ) : null}
            {site.address && (
              <span className="flex items-center gap-1.5">
                <MapPin size={14} />
                {site.address}
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            <Progress value={site.progress_percent} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{site.progress_percent}% complete</span>
              <span>
                {site.planned_end_date
                  ? `Due ${formatDate(site.planned_end_date)}`
                  : "No deadline set"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profitability — the reason this page exists */}
      {seesMoney && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profitability</CardTitle>
          </CardHeader>
          <CardContent>
            {!profit ? (
              <p className="text-sm text-muted-foreground">
                No financial data for this site yet.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Figure
                    label="Allocated revenue"
                    value={Number(profit.revenue_allocated)}
                  />
                  <Figure label="Actual cost" value={Number(profit.total_cost)} />
                  <Figure
                    label="Gross profit"
                    value={Number(profit.gross_profit)}
                    tone={Number(profit.gross_profit) < 0 ? "bad" : "good"}
                    caption={
                      profit.margin_percent !== null
                        ? `${Number(profit.margin_percent)}% margin`
                        : undefined
                    }
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <CostLine label="Materials" value={Number(profit.material_cost)} />
                  <CostLine label="Labour" value={Number(profit.labour_cost)} />
                  <CostLine
                    label="Site expenses"
                    value={Number(profit.expense_cost)}
                  />
                  <Separator />
                  <CostLine
                    label="Total cost"
                    value={Number(profit.total_cost)}
                    emphasis
                  />
                </div>

                {Number(profit.revenue_allocated) === 0 && (
                  <p className="text-xs text-muted-foreground">
                    This site has no allocated value, so margin cannot be
                    computed. Set its share of the contract value to track
                    profit.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Team and dates */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow
              label="Site engineer"
              value={site.engineer?.full_name ?? "Unassigned"}
            />
            <InfoRow
              label="Supervisor"
              value={site.supervisor?.full_name ?? "Unassigned"}
            />
            <InfoRow
              label="Workers assigned"
              value={
                profit ? String(profit.assigned_workers) : site.workers_required
                  ? `${site.workers_required} required`
                  : "—"
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow
              label="Planned start"
              value={formatDate(site.planned_start_date)}
            />
            <InfoRow
              label="Planned end"
              value={formatDate(site.planned_end_date)}
            />
            <InfoRow
              label="Actual start"
              value={formatDate(site.actual_start_date)}
            />
            <InfoRow
              label="Actual end"
              value={formatDate(site.actual_end_date)}
            />
          </CardContent>
        </Card>
      </div>

      {site.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{site.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
  caption,
}: {
  label: string;
  value: number;
  tone?: "good" | "bad";
  caption?: string;
}) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "good" && "text-emerald-600",
          tone === "bad" && "text-red-600"
        )}
      >
        {formatCurrency(value)}
      </div>
      {caption && (
        <div className="text-xs text-muted-foreground">{caption}</div>
      )}
    </div>
  );
}

function CostLine({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between text-sm",
        emphasis && "font-semibold"
      )}
    >
      <span className={cn(!emphasis && "text-muted-foreground")}>{label}</span>
      <span className="tabular-nums">{formatCurrency(value)}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
      <span className="w-36 shrink-0 text-sm text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}
