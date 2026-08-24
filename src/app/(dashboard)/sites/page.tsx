import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { buttonVariants, Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { getSites, getSiteStages } from "@/actions/sites";
import { getCurrentUser } from "@/actions/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sites",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SitesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const stage = typeof params.stage === "string" ? params.stage : undefined;

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const [{ data: sites }, { data: stages }] = await Promise.all([
    getSites({ search, stage }),
    getSiteStages(),
  ]);

  const canCreate = ["owner", "manager"].includes(currentUser.role);
  const stageLabel = new Map((stages ?? []).map((s) => [s.code, s.label]));
  const rows = sites ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sites"
        description="Every location under every contract."
      >
        {canCreate && (
          <Link href="/sites/new" className={cn(buttonVariants())}>
            <Plus className="mr-2 h-4 w-4" />
            New Site
          </Link>
        )}
      </PageHeader>

      <form className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="search"
            placeholder="Search sites…"
            defaultValue={search}
            className="pl-8"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No sites yet. Create a contract first, then add its sites.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((site) => (
            <Link key={site.id} href={`/sites/${site.id}`} className="block">
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{site.name}</h3>
                      <p className="truncate text-sm text-muted-foreground">
                        {site.company?.name ?? "—"}
                      </p>
                    </div>
                    <StatusBadge status={site.status} />
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-mono">{site.site_code}</span>
                    <span>{stageLabel.get(site.stage) ?? site.stage}</span>
                  </div>

                  <div className="space-y-1.5">
                    <Progress value={site.progress_percent} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{site.progress_percent}% complete</span>
                      {site.capacity_kw ? <span>{site.capacity_kw} kW</span> : null}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t pt-3 text-sm">
                    <span className="text-muted-foreground">
                      {site.planned_end_date
                        ? `Due ${formatDate(site.planned_end_date)}`
                        : "No deadline"}
                    </span>
                    {site.commercial ? (
                      <span className="font-medium">
                        {formatCurrency(Number(site.commercial.allocated_value))}
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
