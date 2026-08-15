"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { assignToSite, removeFromSite } from "@/actions/sites";
import type { SiteAssignmentRow } from "@/actions/sites";

interface SiteCrewProps {
  siteId: string;
  assignments: SiteAssignmentRow[];
  /** Everyone who could be assigned. */
  people: { id: string; full_name: string; employee_code: string }[];
  canManage: boolean;
}

const SITE_ROLES = [
  { value: "engineer", label: "Engineer" },
  { value: "supervisor", label: "Supervisor" },
  { value: "electrician", label: "Electrician" },
  { value: "helper", label: "Helper" },
  { value: "worker", label: "Worker" },
  { value: "driver", label: "Driver" },
];

export function SiteCrew({
  siteId,
  assignments,
  people,
  canManage,
}: SiteCrewProps) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [roleOnSite, setRoleOnSite] = useState("worker");

  const assignedIds = new Set(assignments.map((a) => a.employee_id));
  const available = people.filter((p) => !assignedIds.has(p.id));

  async function handleAssign() {
    if (!employeeId) {
      toast.error("Choose a person.");
      return;
    }

    setLoading("assign");
    const { error } = await assignToSite(siteId, employeeId, roleOnSite);

    if (error) {
      toast.error(error);
      setLoading(null);
      return;
    }

    toast.success("Assigned to this site");
    setEmployeeId("");
    setAdding(false);
    setLoading(null);
    router.refresh();
  }

  async function handleRemove(assignmentId: string) {
    setLoading(assignmentId);
    const { error } = await removeFromSite(assignmentId, siteId);

    if (error) {
      toast.error(error);
      setLoading(null);
      return;
    }

    toast.success("Removed from this site");
    setLoading(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nobody is assigned yet. People must be assigned here before they can
          mark attendance at this site.
        </p>
      ) : (
        <ul className="space-y-2">
          {assignments.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {a.employee?.full_name ?? "—"}
                </div>
                <div className="text-xs capitalize text-muted-foreground">
                  {a.role_on_site}
                  {a.employee?.employee_code
                    ? ` · ${a.employee.employee_code}`
                    : ""}
                </div>
              </div>
              {canManage && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => handleRemove(a.id)}
                  disabled={loading !== null}
                  aria-label={`Remove ${a.employee?.full_name ?? "person"}`}
                >
                  {loading === a.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage &&
        (adding ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={employeeId}
              onValueChange={(v) => setEmployeeId(v ?? "")}
            >
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Who?" />
              </SelectTrigger>
              <SelectContent>
                {available.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={roleOnSite}
              onValueChange={(v) => setRoleOnSite(v ?? "worker")}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SITE_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              size="sm"
              onClick={handleAssign}
              disabled={loading !== null || available.length === 0}
            >
              {loading === "assign" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Assign
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAdding(false)}
              disabled={loading !== null}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Assign someone
          </Button>
        ))}
    </div>
  );
}
