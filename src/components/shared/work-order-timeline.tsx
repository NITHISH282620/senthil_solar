"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { formatRelativeTime } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Camera, Send, FileText, Activity, Loader2 } from "lucide-react";
import { addWorkOrderUpdate } from "@/actions/work-orders";
import { toast } from "sonner";
import type { WorkOrderUpdate } from "@/types/database";

interface WorkOrderTimelineProps {
  workOrderId: string;
  updates: (WorkOrderUpdate & {
    profile?: { full_name: string; avatar_url: string | null } | null;
  })[];
  currentStatus: string;
}

export function WorkOrderTimeline({
  workOrderId,
  updates,
  currentStatus,
}: WorkOrderTimelineProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(formData: FormData) {
    if (!content.trim()) return;
    
    setLoading(true);
    formData.set("work_order_id", workOrderId);
    formData.set("update_type", "note");
    
    try {
      const result = await addWorkOrderUpdate(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Note added successfully");
        setContent("");
        formRef.current?.reset();
        router.refresh();
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  function getUpdateIcon(type: string) {
    switch (type) {
      case "status_change":
        return <Activity className="h-4 w-4 text-blue-500" />;
      case "photo":
        return <Camera className="h-4 w-4 text-emerald-500" />;
      case "note":
      default:
        return <FileText className="h-4 w-4 text-amber-500" />;
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add Update</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={handleSubmit} className="space-y-4">
            <Textarea
              name="content"
              placeholder="Type your note here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={loading}
              className="min-h-[100px]"
            />
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" disabled>
                <Camera className="mr-2 h-4 w-4" />
                Add Photo
              </Button>
              <Button type="submit" disabled={loading || !content.trim()}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Post Update
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent pb-4">
        {updates.length === 0 ? (
          <div className="relative flex items-center justify-center py-8">
            <div className="bg-background px-4 text-sm text-muted-foreground">
              No updates yet.
            </div>
          </div>
        ) : (
          updates.map((update) => (
            <div key={update.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              
              <div className="flex items-center justify-center w-10 h-10 rounded-full border bg-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                {getUpdateIcon(update.update_type)}
              </div>
              
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border bg-card shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={update.profile?.avatar_url || undefined} />
                      <AvatarFallback className="text-[10px]">
                        {update.profile?.full_name?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">
                      {update.profile?.full_name || "Unknown User"}
                    </span>
                  </div>
                  <time className="text-xs text-muted-foreground">
                    {formatRelativeTime(update.created_at)}
                  </time>
                </div>
                
                {update.update_type === "status_change" ? (
                  <div className="text-sm flex items-center gap-2 mt-2">
                    Changed status to <StatusBadge status={update.content || "unknown"} />
                  </div>
                ) : update.update_type === "photo" && update.photo_url ? (
                  <div className="mt-3 rounded-lg overflow-hidden border">
                    {/* Use standard img for demo since domain isn't in next.config.js */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={update.photo_url} 
                      alt={update.content || "Work order photo"} 
                      className="w-full h-auto max-h-64 object-cover"
                    />
                    {update.content && (
                      <p className="p-3 text-sm bg-muted/50">{update.content}</p>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-foreground/90 whitespace-pre-wrap mt-2">
                    {update.content}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
