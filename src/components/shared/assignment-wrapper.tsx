"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssignmentModal } from "./assignment-modal";

interface AssignmentWrapperProps {
  workOrderId: string;
  employees: { id: string; full_name: string; employee_id: string; role: string }[];
}

export function AssignmentWrapper({ workOrderId, employees }: AssignmentWrapperProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button 
        variant="outline" 
        className="w-full mt-2" 
        onClick={() => setIsOpen(true)}
      >
        <Plus className="mr-2 h-4 w-4" />
        Assign Employee
      </Button>

      <AssignmentModal
        workOrderId={workOrderId}
        employees={employees}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
