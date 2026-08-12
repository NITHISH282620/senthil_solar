"use client";

import Link from "next/link";
import { formatRelativeTime } from "@/lib/format";
import { StatusBadge } from "@/components/shared/status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Clock, MapPin } from "lucide-react";
import type { WorkOrderWithRelations } from "@/actions/work-orders";

interface WorkOrderKanbanProps {
  workOrders: WorkOrderWithRelations[];
}

const COLUMNS = [
  { id: "pending", title: "Pending", color: "bg-slate-100 dark:bg-slate-900/50" },
  { id: "scheduled", title: "Scheduled", color: "bg-blue-50 dark:bg-blue-950/30" },
  { id: "in_progress", title: "In Progress", color: "bg-amber-50 dark:bg-amber-950/30" },
  { id: "on_hold", title: "On Hold", color: "bg-red-50 dark:bg-red-950/30" },
  { id: "completed", title: "Completed", color: "bg-emerald-50 dark:bg-emerald-950/30" },
];

export function WorkOrderKanban({ workOrders }: WorkOrderKanbanProps) {
  // Simple read-only Kanban for now. Drag and drop can be added later if needed.
  // We group work orders by status.
  
  return (
    <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
      {COLUMNS.map((col) => {
        const columnWOs = workOrders.filter((wo) => wo.status === col.id);
        
        return (
          <div 
            key={col.id} 
            className={`flex-shrink-0 w-80 rounded-xl border ${col.color} p-4 flex flex-col snap-start`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold capitalize text-sm">{col.title}</h3>
              <span className="text-xs bg-background rounded-full px-2 py-0.5 border text-muted-foreground font-medium">
                {columnWOs.length}
              </span>
            </div>
            
            <div className="space-y-3 flex-1">
              {columnWOs.length === 0 ? (
                <div className="h-24 border-2 border-dashed border-muted rounded-lg flex items-center justify-center text-sm text-muted-foreground">
                  Empty
                </div>
              ) : (
                columnWOs.map((wo) => (
                  <Card key={wo.id} className="p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer relative overflow-hidden group">
                    {wo.priority === "urgent" && (
                      <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
                    )}
                    {wo.priority === "high" && (
                      <div className="absolute top-0 left-0 w-1 h-full bg-orange-500" />
                    )}
                    <Link href={`/work-orders/${wo.id}`} className="absolute inset-0 z-0">
                      <span className="sr-only">View work order</span>
                    </Link>
                    
                    <div className="relative z-10 flex flex-col gap-2 pointer-events-none">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {wo.work_order_number}
                        </span>
                        <StatusBadge status={wo.priority} className="text-[10px] h-4 px-1" />
                      </div>
                      
                      <h4 className="font-medium text-sm leading-tight line-clamp-2">
                        {wo.title}
                      </h4>
                      
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{wo.customer?.name}</span>
                      </div>
                      
                      {(wo.scheduled_date || wo.started_at) && (
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                          <Clock className="h-3 w-3" />
                          {wo.status === "in_progress" && wo.started_at
                            ? `Started ${formatRelativeTime(wo.started_at)}`
                            : wo.scheduled_date 
                              ? `Scheduled ${wo.scheduled_date.split("T")[0]}`
                              : ""}
                        </div>
                      )}
                      
                      {wo.assignments && wo.assignments.length > 0 && (
                        <div className="flex -space-x-2 overflow-hidden mt-3 pt-3 border-t">
                          {wo.assignments.map((assignment) => (
                            <Avatar key={assignment.id} className="inline-block h-6 w-6 border-2 border-background">
                              <AvatarFallback className="text-[10px] bg-primary/10">
                                {assignment.profile?.full_name?.charAt(0) || "U"}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
