import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: string;
  statusMap?: Record<
    string,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  >;
  className?: string;
}

// Default status-to-variant mapping for common statuses
const defaultStatusMap: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  active: { label: "Active", variant: "default" },
  inactive: { label: "Inactive", variant: "secondary" },
  prospect: { label: "Prospect", variant: "outline" },
  draft: { label: "Draft", variant: "secondary" },
  sent: { label: "Sent", variant: "outline" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  expired: { label: "Expired", variant: "secondary" },
  converted: { label: "Converted", variant: "default" },
  not_started: { label: "Not Started", variant: "secondary" },
  pending: { label: "Pending", variant: "outline" },
  scheduled: { label: "Scheduled", variant: "outline" },
  in_progress: { label: "In Progress", variant: "default" },
  on_hold: { label: "On Hold", variant: "secondary" },
  completed: { label: "Completed", variant: "default" },
  billed: { label: "Billed", variant: "outline" },
  closed: { label: "Closed", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "destructive" },
  partially_paid: { label: "Partially Paid", variant: "outline" },
  paid: { label: "Paid", variant: "default" },
  overdue: { label: "Overdue", variant: "destructive" },
  reimbursed: { label: "Reimbursed", variant: "default" },
  present: { label: "Present", variant: "default" },
  absent: { label: "Absent", variant: "destructive" },
  half_day: { label: "Half Day", variant: "outline" },
  leave: { label: "Leave", variant: "secondary" },
  holiday: { label: "Holiday", variant: "secondary" },
  partially_deducted: { label: "Partially Deducted", variant: "outline" },
  fully_deducted: { label: "Fully Deducted", variant: "default" },
};

export function StatusBadge({
  status,
  statusMap = defaultStatusMap,
  className,
}: StatusBadgeProps) {
  const config = statusMap[status] || {
    label: status,
    variant: "secondary" as const,
  };

  return (
    <Badge variant={config.variant} className={cn("capitalize", className)}>
      {config.label}
    </Badge>
  );
}
