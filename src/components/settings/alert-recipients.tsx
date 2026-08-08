"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addAlertRecipient, removeAlertRecipient } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Trash2, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface AlertRecipient {
  id: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

interface AlertRecipientsProps {
  recipients: AlertRecipient[];
  ownerEmail: string | null;
  role: string;
}

export function AlertRecipients({ recipients, ownerEmail, role }: AlertRecipientsProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const canManage = role === "owner" || role === "manager";

  const isOwnerEmail = useMemo(
    () => ownerEmail !== null && email.trim().toLowerCase() === ownerEmail.toLowerCase(),
    [email, ownerEmail],
  );

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setIsSubmitting(true);
    const result = await addAlertRecipient({ email: trimmed });
    setIsSubmitting(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Recipient added");
      setEmail("");
      router.refresh();
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    try {
      const result = await removeAlertRecipient(id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Recipient removed");
        router.refresh();
      }
    } catch {
      toast.error("Failed to remove recipient");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ color: "#000000" }}>Alert Recipients</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
          These email addresses receive credential expiration alerts.
        </p>

        <div className="rounded-lg border p-3" style={{ borderColor: "#F0F4F5", backgroundColor: "#FFFFFF" }}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4" style={{ color: "#6E97A7" }} />
            <span className="text-sm font-medium" style={{ color: "#000000" }}>Owner (always receives alerts)</span>
          </div>
          <p className="text-sm mt-1" style={{ color: "rgba(0,0,0,0.55)" }}>{ownerEmail ?? "No email on file"}</p>
        </div>

        <p className="text-xs" style={{ color: "rgba(0,0,0,0.55)" }}>
          Additional recipients are external email addresses — not ComplySpa user accounts. The owner receives alerts
          automatically and cannot be removed.
        </p>

        {recipients.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
            No additional recipients yet — add an address to route expiration alerts to more people.
          </p>
        ) : (
          recipients.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border p-3" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
              <div className="flex items-center gap-2">
                <Mail className="size-4" style={{ color: "#6E97A7" }} />
                <span className="text-sm" style={{ color: "#000000" }}>{r.email}</span>
              </div>
              {canManage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={removingId === r.id}
                  onClick={() => handleRemove(r.id)}
                  aria-label={`Remove ${r.email}`}
                >
                  {removingId === r.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" style={{ color: "rgba(0,0,0,0.55)" }} />}
                </Button>
              )}
            </div>
          ))
        )}

        {canManage && (
          <form onSubmit={handleAdd} className="flex items-end gap-3 pt-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="recipient-email">Add recipient</Label>
              <Input
                id="recipient-email"
                type="email"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {isOwnerEmail && (
                <p className="text-xs" style={{ color: "#7A4E1F" }} role="note">
                  The owner already receives alerts automatically — this address is redundant.
                </p>
              )}
            </div>
            <Button type="submit" disabled={isSubmitting || !email.trim()}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Add"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
