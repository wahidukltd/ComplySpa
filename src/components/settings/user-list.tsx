"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeUser, resendInvitation, updateUserRole } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, MailWarning, Trash2, UserCog } from "lucide-react";
import { formatDateTime } from "@/lib/utils/date";
import { toast } from "sonner";

interface ClinicUser {
  id: string;
  email: string;
  role: string;
  created_at: string;
  auth_user_id: string | null;
}

interface UserListProps {
  users: ClinicUser[];
  currentUserId: string;
  currentUserRole: string;
}

const ROLE_STYLES: Record<string, { bg: string; text: string }> = {
  owner: { bg: "#F0F4F5", text: "#000000" },
  manager: { bg: "#FBF0E0", text: "#7A4E1F" },
  viewer: { bg: "#F2EFED", text: "#5A504C" },
};

export function UserList({ users, currentUserId, currentUserRole }: UserListProps) {
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleRemove(id: string) {
    setRemoving(id);
    const result = await removeUser(id);
    setRemoving(null);
    setConfirmId(null);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("User removed");
      router.refresh();
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
    const result = await resendInvitation(id);
    setResendingId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.emailAccepted) {
      toast.success("Invitation email was accepted for delivery again.");
    } else {
      toast.warning("The invitation email could not be sent. Try again shortly.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ color: "#000000" }}>Team Members</CardTitle>
      </CardHeader>
      <CardContent>
        {users.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>No team members yet.</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              const isPending = u.auth_user_id === null;
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
                                Are you sure you want to remove {u.email}? They will lose access to this clinic immediately.
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
