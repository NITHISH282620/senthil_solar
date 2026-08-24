import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { getAuditTrail } from "@/actions/audit";
import { AUDITED_TABLES } from "@/lib/constants";
import { getCurrentUser } from "@/actions/auth";
import { formatDateTime } from "@/lib/format";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Audit Trail",
};

interface PageProps {
  searchParams: Promise<{ table?: string; action?: string }>;
}

/** Money columns are what an owner actually scans this page for. */
const NOTABLE = new Set([
  "amount",
  "role",
  "daily_rate",
  "monthly_salary",
  "status",
  "deleted_at",
  "is_locked",
  "amount_received",
  "amount_recovered",
  "allocated_value",
  "day_fraction",
]);

function describe(entry: {
  changed_fields: string[] | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  action: string;
}) {
  if (entry.action === "insert") return "created";
  if (entry.action === "delete") return "deleted";

  const fields = (entry.changed_fields ?? []).filter((f) => NOTABLE.has(f));
  const shown = fields.length > 0 ? fields : (entry.changed_fields ?? []);
  if (shown.length === 0) return "changed";

  return shown
    .slice(0, 3)
    .map((f) => {
      const before = entry.old_values?.[f];
      const after = entry.new_values?.[f];
      return `${f}: ${before ?? "—"} → ${after ?? "—"}`;
    })
    .join(", ");
}

export default async function AuditPage({ searchParams }: PageProps) {
  const { table = "all", action = "all" } = await searchParams;

  const currentUser = await getCurrentUser();
  if (!currentUser) return null;
  if (currentUser.role !== "owner") redirect("/unauthorized");

  const { data: entries } = await getAuditTrail({ table, action, limit: 200 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit trail"
        description="Who changed what, and what it was before. This record cannot be edited or deleted by anyone, including you."
      />

      <div className="flex flex-wrap gap-2">
        {AUDITED_TABLES.map((t) => (
          <Link
            key={t.value}
            href={`/audit?table=${t.value}&action=${action}`}
            scroll={false}
          >
            <Badge variant={t.value === table ? "default" : "outline"}>
              {t.label}
            </Badge>
          </Link>
        ))}
      </div>

      {!entries || entries.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nothing recorded yet"
          description="Changes to money, people and sites will appear here as they happen."
        />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDateTime(entry.created_at)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {entry.actor_name ?? "System"}
                      {entry.user_role ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({entry.user_role})
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {AUDITED_TABLES.find((t) => t.value === entry.table_name)?.label ??
                        entry.table_name}
                    </TableCell>
                    <TableCell className="text-sm font-mono text-xs">
                      {describe(entry)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
