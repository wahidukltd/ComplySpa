"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { removeUser, resendInvitation, updateUserRole } from "@/lib/actions/settings";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Loader2, MailWarning, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { formatDateTime } from "@/lib/utils/date";
import { toast } from "sonner";
import type { SeatSummary } from "@/lib/utils/seats";

interface ClinicUser {
  id: string;
  email: string;
  role: string;
  created_at: string;
  is_pending: boolean;
}

interface UserListProps {
  users: ClinicUser[];
  currentUserId: string;
  currentUserRole: string;
  seatSummary: SeatSummary;
  maxUsers: number;
  planLabel: string;
}

const ROLE_STYLES: Record<string, { bg: string; text: string }> = {
  owner: { bg: "#F0F4F5", text: "#000000" },
  manager: { bg: "#FBF0E0", text: "#7A4E1F" },
  viewer: { bg: "#F2EFED", text: "#5A504C" },
};

const ROLE_LEGEND: { role: string; description: string }[] = [
  { role: "Owner", description: "Full control — billing, team, settings, and all clinic data." },
  { role: "Manager", description: "Manages clinic data; read-only team view." },
  { role: "Viewer", description: "Read-only access to clinic data." },
];

function SeatSummaryCard({
  seatSummary,
  maxUsers,
  planLabel,
}: {
  seatSummary: SeatSummary;
  maxUsers: number;
  planLabel: string;
}) {
  const isSolo = maxUsers === 1;
  const pct = Math.min(100, (seatSummary.used / Math.max(1, maxUsers)) * 100);
  const barColor = seatSummary.atCapacity || seatSummary.overLimit ? "#C2853A" : "#6E97A7";

  return (
    <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium" style={{ color: "#000000" }}>
          {seatSummary.used} of {maxUsers} seats used
        </p>
        <span className="text-xs" style={{ color: "rgba(0,0,0,0.55)" }}>{planLabel}</span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={seatSummary.used}
        aria-valuemin={0}
        aria-valuemax={maxUsers}
        aria-label="Seats used"
        className="h-2 w-full rounded-full"
        style={{ backgroundColor: "#F0F4F5" }}
      >
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>

      {seatSummary.overLimit ? (
        <p className="text-sm" style={{ color: "#7A4E1F" }}>
          Currently over the {planLabel} seat limit — remove members to free seats.
        </p>
      ) : seatSummary.atCapacity ? (
        <p className="text-sm" style={{ color: "#7A4E1F" }}>All seats are in use.</p>
      ) : (
        <p className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
          {seatSummary.available} seat{seatSummary.available === 1 ? "" : "s"} available.
        </p>
      )}

      {seatSummary.pending > 0 && (
        <p className="text-xs" style={{ color: "#7A4E1F" }}>
          {seatSummary.pending} pending invitation{seatSummary.pending === 1 ? "" : "s"} — a pending invite holds a
          seat until the invitee signs up or the invite is removed. Accepting it keeps the seat in use.
        </p>
      )}

      {isSolo && (
        <div className="space-y-2 border-t pt-3" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
          <p className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
            Solo includes only the owner — upgrade to Practice to add up to 2 team members.
          </p>
          <Link
            href="/pricing?reason=plan_upgrade_required"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
          >
            Upgrade to Practice
          </Link>
        </div>
      )}

      <p className="text-xs" style={{ color: "rgba(0,0,0,0.45)" }}>
        Seats are held by members and pending invitations. Accepting an invitation keeps the seat in use; removing a
        member or an unaccepted invite frees one.
      </p>
    </div>
  );
}

export function UserList({ users, currentUserId, currentUserRole, seatSummary, maxUsers, planLabel }: UserListProps) {
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // External acceptances happen on the invitee's side — returning to this
  // tab refreshes the seat count (plan 2026-08-08; no realtime).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [router]);

  async function handleRemove(id: string) {
    setRemoving(id);
    try {
      const result = await removeUser(id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("User removed");
        router.refresh();
      }
    } catch {
      toast.error("Failed to remove user");
    } finally {
      setRemoving(null);
      setConfirmId(null);
    }
  }

  async function handleRoleChange(id: string, newRole: string) {
    try {
      const result = await updateUserRole(id, newRole as "manager" | "viewer");
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Role updated");
        router.refresh();
      }
    } catch {
      toast.error("Failed to update role");
    }
  }

  async function handleResend(id: string) {
    setResendingId(id);
    try {
      const result = await resendInvitation(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.emailAccepted) {
        toast.success("Invitation email was accepted for delivery again.");
      } else {
        toast.warning("The invitation email could not be sent. Try again shortly.");
      }
    } catch {
      toast.error("Failed to resend invitation");
    } finally {
      setResendingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ color: "#000000" }}>Team Members</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <SeatSummaryCard seatSummary={seatSummary} maxUsers={maxUsers} planLabel={planLabel} />

        <div className="space-y-1.5 rounded-lg border p-3" style={{ borderColor: "#F0F4F5", backgroundColor: "#FFFFFF" }}>
          <p className="text-xs font-medium mb-1" style={{ color: "rgba(0,0,0,0.55)" }}>Roles</p>
          {ROLE_LEGEND.map((r) => (
            <p key={r.role} className="text-xs flex items-center gap-2" style={{ color: "rgba(0,0,0,0.55)" }}>
              <ShieldCheck className="size-3.5 shrink-0" style={{ color: "#6E97A7" }} />
              <span className="font-medium" style={{ color: "#000000" }}>{r.role}</span>
              <span>{r.description}</span>
            </p>
          ))}
        </div>

        {users.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>No team members yet.</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              const isPending = u.is_pending;
              const roleStyle = ROLE_STYLES[u.role] ?? { bg: "#F2EFED", text: "#5A504C" };

              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3"
                  style={{ borderColor: "rgba(0,0,0,0.12)" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-full" style={{ backgroundColor: "#F0F4F5" }}>
                      <UserCog className="size-4" style={{ color: "#6E97A7" }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "#000000" }}>
                        {u.email}
                        {isSelf && <span className="ml-1 text-xs" style={{ color: "rgba(0,0,0,0.55)" }}>(you)</span>}
                        {isPending && (
                          <span className="ml-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium" style={{ backgroundColor: "#FBF0E0", color: "#7A4E1F" }}>
                            Pending invite
                          </span>
                        )}
                      </p>
                      <p className="text-xs" style={{ color: "rgba(0,0,0,0.55)" }}>
                        {isPending ? "Invited — hasn't signed up yet" : `Joined ${formatDateTime(u.created_at)}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge
                      className="text-xs font-normal"
                      style={{ backgroundColor: roleStyle.bg, color: roleStyle.text, border: "none" }}
                    >
                      {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                    </Badge>

                    {currentUserRole === "owner" && isPending && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        disabled={resendingId === u.id}
                        onClick={() => handleResend(u.id)}
                        aria-label={`Resend invitation to ${u.email}`}
                      >
                        {resendingId === u.id ? <Loader2 className="size-3.5 animate-spin" /> : <MailWarning className="size-3.5" />}
                        Resend invite
                      </Button>
                    )}

                    {currentUserRole === "owner" && !isSelf && u.role !== "owner" && (
                      <>
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          className="h-8 rounded-md border px-2 text-xs focus:outline-none focus:ring-2"
                          style={{ borderColor: "rgba(0,0,0,0.12)", color: "#000000", backgroundColor: "#FFFFFF" }}
                          aria-label={`Change role for ${u.email}`}
                        >
                          <option value="manager">Manager</option>
                          <option value="viewer">Viewer</option>
                        </select>

                        <Dialog open={confirmId === u.id} onOpenChange={(open) => setConfirmId(open ? u.id : null)}>
                          <DialogTrigger aria-label={`Remove ${u.email}`}>
                            <Trash2 className="size-4" style={{ color: "#B8443A" }} />
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Remove user</DialogTitle>
                              <DialogDescription>
                                Are you sure you want to remove {u.email}? They will lose access to this clinic
                                immediately, and their seat becomes available.
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <Button type="button" variant="outline" onClick={() => setConfirmId(null)}>
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                disabled={removing === u.id}
                                onClick={() => handleRemove(u.id)}
                              >
                                {removing === u.id ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                                Remove
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
