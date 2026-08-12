import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Pencil,
  MapPin,
  Clock,
  User,
  Users as UsersIcon,
  Activity,
  FileText,
  Calendar,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { AssignmentWrapper } from "@/components/shared/assignment-wrapper";
import { WorkOrderTimeline } from "@/components/shared/work-order-timeline";
import { DocumentVault } from "@/components/shared/document-vault";
import { getWorkOrder, getAvailableEmployees } from "@/actions/work-orders";
import { getDocuments } from "@/actions/documents";
import { getCurrentUser } from "@/actions/auth";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const { data } = await getWorkOrder(id);
  return {
    title: data ? `${data.work_order_number} | Work Order` : "Work Order",
  };
}

export default async function WorkOrderDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [{ data: wo }, { data: documents }, currentUser] = await Promise.all([
    getWorkOrder(id),
    getDocuments("work_order", id),
    getCurrentUser(),
  ]);

  if (!wo) {
    notFound();
  }

  const canEdit = currentUser?.role === "admin" || currentUser?.role === "manager";
  
  // We only fetch employees if user can edit (assign)
  let employees: { id: string; full_name: string; employee_id: string; role: string }[] = [];
  if (canEdit) {
    const { data } = await getAvailableEmployees();
    if (data) employees = data;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {wo.work_order_number}
            </h1>
            <StatusBadge status={wo.status} />
            <StatusBadge status={wo.priority} />
          </div>
          <p className="text-muted-foreground">{wo.title}</p>
        </div>
        
        <div className="flex gap-2">
          {canEdit && (
            <>
              <Link
                href={`/billing/new?workOrderId=${wo.id}`}
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                <FileText className="mr-2 h-4 w-4" />
                Generate Invoice
              </Link>
              <Link
                href={`/work-orders/${wo.id}/edit`}
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Customer
                  </div>
                  <div>
                    {wo.customer ? (
                      <Link 
                        href={`/customers/${wo.customer.id}`}
                        className="font-medium hover:underline text-amber-600"
                      >
                        {wo.customer.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Linked Quotation
                  </div>
                  <div>
                    {wo.quotation ? (
                      <Link 
                        href={`/quotations/${wo.quotation.id}`}
                        className="font-medium hover:underline text-amber-600"
                      >
                        {wo.quotation.quotation_number}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-2">
                  Description
                </div>
                <div className="whitespace-pre-wrap text-sm">
                  {wo.description || <span className="text-muted-foreground italic">No description provided.</span>}
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Site Address</div>
                    <div className="text-sm mt-1 whitespace-pre-wrap">
                      {wo.site_address || wo.customer?.address || "No address specified"}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Schedule</div>
                    <div className="text-sm mt-1">
                      {wo.scheduled_date ? formatDate(wo.scheduled_date) : "Not scheduled"}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <WorkOrderTimeline 
            workOrderId={wo.id}
            updates={wo.updates ?? []}
            currentStatus={wo.status}
          />

          <DocumentVault 
            entityType="work_order" 
            entityId={wo.id} 
            initialDocuments={documents ?? []} 
          />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <UsersIcon className="h-5 w-5 text-muted-foreground" />
                Team
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {wo.assignments && wo.assignments.length > 0 ? (
                <div className="space-y-3">
                  {wo.assignments.map((assignment) => (
                    <div key={assignment.id} className="flex items-center justify-between border-b last:border-0 pb-3 last:pb-0">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <User className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">
                            {assignment.profile?.full_name}
                          </div>
                          <div className="text-xs text-muted-foreground capitalize">
                            {assignment.role}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No team members assigned
                </div>
              )}

              {canEdit && (
                <AssignmentWrapper workOrderId={wo.id} employees={employees} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                Time Tracking
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Estimated</span>
                <span className="font-medium">{wo.estimated_hours ? `${wo.estimated_hours} hrs` : "-"}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Actual</span>
                <span className="font-medium">{wo.actual_hours ? `${wo.actual_hours} hrs` : "-"}</span>
              </div>
              <Separator />
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Started</span>
                <span>{wo.started_at ? formatDate(wo.started_at, "dd MMM yyyy HH:mm") : "-"}</span>
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Completed</span>
                <span>{wo.completed_at ? formatDate(wo.completed_at, "dd MMM yyyy HH:mm") : "-"}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
