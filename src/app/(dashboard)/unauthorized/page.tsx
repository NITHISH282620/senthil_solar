import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-4xl font-bold text-gray-900">Profile Missing</h1>
        <p className="text-gray-600">
          Your authentication was successful, but your database profile is missing. 
          This usually happens if your account was created before the auto-profile trigger was added, 
          or if your profile was manually deleted.
        </p>
        
        <div className="pt-6">
          <Button asChild>
            <Link href="/auth/logout">Sign Out & Try Again</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
