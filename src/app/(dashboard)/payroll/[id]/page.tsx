import { notFound, redirect } from "next/navigation";
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
import { FinalisePayrollButton, PayPayrollButton } from "@/components/shared/payroll-actions";
import { getPayrollRun } from "@/actions/payroll";
import { getCurrentUser } from "@/actions/auth";
import { formatCurrency } from "@/lib/format";
import type { Metadata } from "next";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Payroll Run",
};

export default async function PayrollRunPage({ params }: PageProps) {
  const { id } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!["owner", "manager", "accountant"].includes(currentUser.role)) {
    redirect("/unauthorized");
  }

  const { data } = await getPayrollRun(id);
  if (!data) notFound();

  const { run, lines } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${MONTHS[run.period_month - 1]} ${run.period_year}`}
        description="Days come from attendance; deductions from outstanding advances."
        backHref="/payroll"
      >
        <div className="flex items-center gap-3">
          <StatusBadge status={run.status} />
          {currentUser.role === "owner" && (
            <>
              <FinalisePayrollButton runId={run.id} status={run.status} />
              <PayPayrollButton
                runId={run.id}
                status={run.status}
                netTotal={Number(run.total_net)}
              />
            </>
          )}
        </div>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <Summary label="Gross" value={Number(run.total_gross)} />
        <Summary
          label="Advance recovery"
          value={Number(run.total_deductions)}
          tone="bad"
        />
        <Summary label="Net payable" value={Number(run.total_net)} emphasis />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Wage mode</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead className="text-right">OT hrs</TableHead>
                  <TableHead className="text-right">Basic</TableHead>
                  <TableHead className="text-right">Overtime</TableHead>
                  <TableHead className="text-right">Advance</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No lines in this run.
                    </TableCell>
                  </TableRow>
                ) : (
                  lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <div className="font-medium">
                          {line.employee?.full_name ?? "—"}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {line.employee?.employee_code ?? ""}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize text-muted-foreground">
                        {line.wage_mode.replace("_", " ")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(line.present_days)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(line.overtime_hours)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(Number(line.basic_amount))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(Number(line.overtime_amount))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-red-600">
                        {Number(line.advance_deduction) > 0
                          ? `-${formatCurrency(Number(line.advance_deduction))}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatCurrency(Number(line.net_amount))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
  emphasis,
}: {
  label: string;
  value: number;
  tone?: "bad";
  emphasis?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div
          className={`mt-1 font-semibold tabular-nums ${
            emphasis ? "text-2xl" : "text-xl"
          } ${tone === "bad" ? "text-red-600" : ""}`}
        >
          {formatCurrency(value)}
        </div>
      </CardContent>
    </Card>
  );
}
