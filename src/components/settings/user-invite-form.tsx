"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteUser } from "@/lib/actions/settings";
import { inviteUserSchema } from "@/lib/validations/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

export function UserInviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("manager");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    const parsed = inviteUserSchema.safeParse({ email: trimmed, role });
    if (!parsed.success) {
      toast.error(parsed.error.issues.map((e) => e.message).join(", "));
      return;
    }
    setIsSubmitting(true);
    const result = await inviteUser(parsed.data);
    setIsSubmitting(false);

    if (result.error) {
      // e.g. "An invitation for this email is already pending" — never a lie.
      toast.error(result.error);
      return;
    }

    if (result.emailAccepted) {
      toast.success(`Invitation created. The invitation email was accepted for delivery to ${parsed.data.email}.`);
    } else {
      toast.warning("Invitation created, but the invitation email could not be sent. Use Resend to try again.");
    }
    setEmail("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border p-4 space-y-3" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-1">
          <Label htmlFor="invite-email">Email address</Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="colleague@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="w-32 space-y-1">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{ borderColor: "rgba(0,0,0,0.12)", color: "#000000", backgroundColor: "#FFFFFF" }}
          >
            <option value="manager">Manager</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <Button type="submit" disabled={isSubmitting || !email.trim()}>
          {isSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
          Invite
        </Button>
      </div>
      <p className="text-xs" style={{ color: "rgba(0,0,0,0.55)" }}>
        Invited colleagues sign up with this email and are linked to your clinic automatically.
      </p>
    </form>
  );
}
