"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentModal } from "./payment-modal";

interface PaymentModalWrapperProps {
  invoiceId: string;
  balanceDue: number;
}

export function PaymentModalWrapper({ invoiceId, balanceDue }: PaymentModalWrapperProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button 
        onClick={() => setIsOpen(true)}
        disabled={balanceDue <= 0}
      >
        <CreditCard className="mr-2 h-4 w-4" />
        Record Payment
      </Button>

      <PaymentModal
        invoiceId={invoiceId}
        balanceDue={balanceDue}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
