"use client";

import { useState, useCallback } from "react";
import { UserPlus, Trash2, Shield, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { 
  assignEmployeeToProject, 
  removeProjectAssignment, 
  getAvailableEmployeesForProject 
} from "@/actions/projects";
import type { ProjectWithRelations } from "@/actions/projects";
import type { Profile } from "@/types/database";
import { formatDate } from "@/lib/format";

interface ProjectTeamTabProps {
  project: ProjectWithRelations;
  currentUser: Profile | null;
}

export function ProjectTeamTab({ project, currentUser }: ProjectTeamTabProps) {
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [availableEmployees, setAvailableEmployees] = useState<{ id: string; full_name: string; employee_id: string; role: string; employee_type: string }[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  
  const canManageTeam = currentUser?.role === "admin" || currentUser?.role === "manager";
  
  const assignments = project.assignments || [];

  const loadEmployees = useCallback(async () => {
    setLoadingEmployees(true);
    const { data, error } = await getAvailableEmployeesForProject();
    if (error) {
      toast.error("Failed to load employees");
    } else if (data) {
      // Filter out already assigned
      const assignedIds = new Set(assignments.map(a => a.employee_id));
      setAvailableEmployees(data.filter(emp => !assignedIds.has(emp.id)));
    }
    setLoadingEmployees(false);
  }, [assignments]);

  function handleAssignOpenChange(open: boolean) {
    setIsAssignOpen(open);
    // Fetch on the open event rather than in an effect: this is a response to
    // a user interaction, not a synchronisation with external state.
    if (open && canManageTeam) void loadEmployees();
  }

  async function handleAssign(formData: FormData) {
    setLoading(true);
    formData.set("project_id", project.id);
    
    const result = await assignEmployeeToProject(formData);
    
    setLoading(false);
    
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Employee assigned to project");
      setIsAssignOpen(false);
    }
  }

  async function handleRemove(assignmentId: string) {
    if (!confirm("Are you sure you want to remove this employee from the project?")) return;
    
    const result = await removeProjectAssignment(assignmentId, project.id);
    
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Employee removed from project");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Project Team</CardTitle>
          <CardDescription>Manage workers and supervisors assigned to this project.</CardDescription>
        </div>
        {canManageTeam && (
          <Dialog open={isAssignOpen} onOpenChange={handleAssignOpenChange}>
            <DialogTrigger render={<Button size="sm" />}>
              <UserPlus className="h-4 w-4 mr-2" />
              Assign Member
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign Team Member</DialogTitle>
                <DialogDescription>
                  Select an employee to assign to {project.project_code}.
                </DialogDescription>
              </DialogHeader>
              
              <form action={handleAssign} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="employee_id">Employee</Label>
                  <Select name="employee_id" required disabled={loadingEmployees}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingEmployees ? "Loading..." : "Select employee"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableEmployees.length === 0 ? (
                        <SelectItem value="none" disabled>
                          No available employees found
                        </SelectItem>
                      ) : (
                        availableEmployees.map((emp) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.full_name} ({emp.employee_id})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="role_in_project">Role in Project</Label>
                  <Select name="role_in_project" defaultValue="worker" required>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="worker">Worker</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="pt-4 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsAssignOpen(false)} disabled={loading}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading || availableEmployees.length === 0}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Assign
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Project Role</TableHead>
              <TableHead>Assigned Date</TableHead>
              {canManageTeam && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManageTeam ? 4 : 3} className="h-24 text-center text-muted-foreground">
                  No team members assigned to this project yet.
                </TableCell>
              </TableRow>
            ) : (
              assignments.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell>
                    <div className="font-medium">{assignment.profile?.full_name}</div>
                    <div className="text-xs text-muted-foreground">{assignment.profile?.employee_id}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={assignment.role_in_project === "supervisor" ? "default" : "secondary"}>
                      {assignment.role_in_project === "supervisor" ? (
                        <Shield className="h-3 w-3 mr-1 inline" />
                      ) : (
                        <User className="h-3 w-3 mr-1 inline" />
                      )}
                      {assignment.role_in_project}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {assignment.assigned_date ? formatDate(assignment.assigned_date) : "—"}
                  </TableCell>
                  {canManageTeam && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemove(assignment.id)}
                        title="Remove from project"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
