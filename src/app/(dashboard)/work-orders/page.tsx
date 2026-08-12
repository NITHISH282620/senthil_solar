import Link from "next/link";
import { Plus, Search, Filter, KanbanIcon, List as ListIcon } from "lucide-react";
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
import { WorkOrderKanban } from "@/components/shared/work-order-kanban";
import { getWorkOrders } from "@/actions/work-orders";
import { getCurrentUser } from "@/actions/auth";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Work Orders",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function WorkOrdersPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const search = typeof resolvedParams.search === "string" ? resolvedParams.search : undefined;
  const status = typeof resolvedParams.status === "string" ? resolvedParams.status : undefined;
  const type = typeof resolvedParams.type === "string" ? resolvedParams.type : undefined;
  const view = typeof resolvedParams.view === "string" ? resolvedParams.view : "list";

  const [currentUser, { data: workOrders }] = await Promise.all([
    getCurrentUser(),
    getWorkOrders({ search, status, type }),
  ]);

  const canCreate = currentUser?.role === "admin" || currentUser?.role === "manager";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Orders"
        description="Manage installations, maintenance, and other operations."
      >
        {canCreate && (
          <Link href="/work-orders/new" className={cn(buttonVariants())}>
            <Plus className="mr-2 h-4 w-4" />
            New Work Order
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
                placeholder="Search by title or WO number..."
                className="pl-9"
                defaultValue={search}
              />
            </div>
            <div className="flex gap-2">
              <Select name="status" defaultValue={status || "all"}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>

              <Select name="type" defaultValue={type || "all"}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="installation">Installation</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="repair">Repair</SelectItem>
                  <SelectItem value="inspection">Inspection</SelectItem>
                </SelectContent>
              </Select>
              
              <input type="hidden" name="view" value={view} />
              <Button type="submit" variant="secondary">Filter</Button>

              <div className="flex bg-muted rounded-md p-1 ml-2">
                <Link
                  href={`?view=list${search ? `&search=${search}` : ""}${status ? `&status=${status}` : ""}${type ? `&type=${type}` : ""}`}
                  className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all",
                    view === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                  )}
                >
                  <ListIcon className="h-4 w-4" />
                </Link>
                <Link
                  href={`?view=kanban${search ? `&search=${search}` : ""}${status ? `&status=${status}` : ""}${type ? `&type=${type}` : ""}`}
                  className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all",
                    view === "kanban" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                  )}
                >
                  <KanbanIcon className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {view === "kanban" ? (
        <WorkOrderKanban workOrders={workOrders ?? []} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Work Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workOrders?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No work orders found.
                  </TableCell>
                </TableRow>
              ) : (
                workOrders?.map((wo) => (
                  <TableRow key={wo.id}>
                    <TableCell>
                      <Link
                        href={`/work-orders/${wo.id}`}
                        className="font-medium hover:underline text-amber-600"
                      >
                        {wo.work_order_number}
                      </Link>
                      <div className="text-sm text-muted-foreground line-clamp-1">
                        {wo.title}
                      </div>
                    </TableCell>
                    <TableCell>
                      {wo.customer?.name}
                      {wo.customer?.city && (
                        <div className="text-xs text-muted-foreground">
                          {wo.customer.city}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">{wo.type}</TableCell>
                    <TableCell>
                      {wo.scheduled_date ? (
                        formatDate(wo.scheduled_date)
                      ) : (
                        <span className="text-muted-foreground text-sm">Not scheduled</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={wo.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
