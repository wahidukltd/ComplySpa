"use client";

import { useState } from "react";
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
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canManage = role === "owner" || role === "manager";

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    setIsSubmitting(true);
    const result = await addAlertRecipient({ email: email.trim() });
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Recipient added");
      setEmail("");
    }
    setIsSubmitting(false);
  }

  async function handleRemove(id: string) {
    const result = await removeAlertRecipient(id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Recipient removed");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ color: "#3D2A25" }}>Alert Recipients</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm" style={{ color: "#8B7D78" }}>
          These email addresses receive credential expiration alerts.
        </p>

        <div className="rounded-lg border p-3" style={{ borderColor: "#F6E3D6", backgroundColor: "#FFF8F2" }}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4" style={{ color: "#9C6B5D" }} />
            <span className="text-sm font-medium" style={{ color: "#3D2A25" }}>Owner (always receives alerts)</span>
          </div>
          <p className="text-sm mt-1" style={{ color: "#8B7D78" }}>{ownerEmail ?? "No email on file"}</p>
        </div>

        {recipients.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-lg border p-3" style={{ borderColor: "#D9B7A7" }}>
            <div className="flex items-center gap-2">
              <Mail className="size-4" style={{ color: "#9C6B5D" }} />
              <span className="text-sm" style={{ color: "#3D2A25" }}>{r.email}</span>
            </div>
            {canManage && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemove(r.id)}
                aria-label={`Remove ${r.email}`}
              >
                <Trash2 className="size-4" style={{ color: "#8B7D78" }} />
              </Button>
            )}
          </div>
        ))}

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
