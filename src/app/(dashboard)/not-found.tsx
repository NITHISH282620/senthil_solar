import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="rounded-full bg-muted p-4">
        <FileQuestion className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Not found</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          This record does not exist, or you do not have access to it.
        </p>
      </div>
      <Button render={<Link href="/dashboard" />}>Back to dashboard</Button>
    </div>
  );
}
