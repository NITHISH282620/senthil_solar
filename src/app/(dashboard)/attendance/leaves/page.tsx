import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { getLeaveRequests } from "@/actions/attendance";
import { getCurrentUser } from "@/actions/auth";
import { formatDate } from "@/lib/format";
import type { Metadata } from "next";
import { LeaveRequestActions } from "./leave-actions";
import { NewLeaveModal } from "./new-leave-modal";

export const metadata: Metadata = {
  title: "Leave Requests",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function LeavesPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "manager";
  
  const statusFilter = typeof resolvedParams.status === "string" ? resolvedParams.status : "all";

  const { data: leaves } = await getLeaveRequests({
    status: statusFilter,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <PageHeader 
          title="Leave Requests" 
          description={isAdmin ? "Manage team leave requests." : "View and submit your leave requests."}
        />
        
        <div className="flex-shrink-0">
          <NewLeaveModal />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Requests History</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b bg-muted/50">
              <tr>
                {isAdmin && <th className="px-4 py-3 font-medium">Employee</th>}
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Dates</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {isAdmin && <th className="px-4 py-3 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {leaves?.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 4} className="px-4 py-8 text-center text-muted-foreground">
                    No leave requests found.
                  </td>
                </tr>
              ) : (
                leaves?.map((leave) => (
                  <tr key={leave.id} className="hover:bg-muted/30">
                    {isAdmin && (
                      <td className="px-4 py-3 font-medium">
                        <div className="flex flex-col">
                          <span>{leave.employee?.full_name}</span>
                          <span className="text-xs text-muted-foreground">{leave.employee?.employee_id}</span>
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3 capitalize">
                      {leave.leave_type}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col text-xs">
                        <span>{formatDate(leave.from_date, "dd MMM yyyy")} -</span>
                        <span>{formatDate(leave.to_date, "dd MMM yyyy")}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate" title={leave.reason}>
                      {leave.reason}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={leave.status} />
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        {leave.status === "pending" ? (
                          <LeaveRequestActions leaveId={leave.id} />
                        ) : (
                          <span className="text-xs text-muted-foreground">Processed</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
