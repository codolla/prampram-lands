import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth, type AppRole } from "@/lib/auth";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/skeletons";
import {
  ShieldCheck,
  UserPlus,
  KeyRound,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/settings/users")({
  component: UsersPage,
});

const ROLES: AppRole[] = ["admin", "staff", "finance"];

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  roles: AppRole[];
};

async function callAdminUsers(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: payload,
  });
  if (error) {
    // Try to extract a useful error message from the function response
    const ctx = (error as { context?: { error?: string } }).context;
    throw new Error(ctx?.error ?? error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function UsersPage() {
  const { hasRole, user: currentUser } = useAuth();
  const qc = useQueryClient();

  const data = useQuery({
    queryKey: ["users-roles"],
    queryFn: async () => {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, phone, avatar_url"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      const byUser = new Map<string, AppRole[]>();
      for (const r of rolesRes.data ?? []) {
        const arr = byUser.get(r.user_id) ?? [];
        arr.push(r.role as AppRole);
        byUser.set(r.user_id, arr);
      }
      return (profilesRes.data ?? []).map((p) => ({
        ...p,
        roles: byUser.get(p.id) ?? [],
      })) as UserRow[];
    },
  });

  const toggleRole = useMutation({
    mutationFn: async ({ userId, role, has }: { userId: string; role: AppRole; has: boolean }) => {
      if (has) {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["users-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!hasRole("admin")) {
    return (
      <AppShell title="Users & Roles">
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12">
            <ShieldCheck className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Admin access required.</p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Users & Roles"
      actions={
        <CreateUserDialog
          onCreated={() => qc.invalidateQueries({ queryKey: ["users-roles"] })}
        />
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All users</CardTitle>
        </CardHeader>
        <CardContent>
          {data.isLoading ? (
            <TableSkeleton columns={4} rows={5} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="pb-2">User</th>
                  <th className="pb-2">Email</th>
                  <th className="pb-2">Roles</th>
                  <th className="pb-2 text-right">Manage</th>
                </tr>
              </thead>
              <tbody>
                {(data.data ?? []).map((u) => (
                  <tr key={u.id} className="border-b last:border-0 align-top">
                    <td className="py-2 font-medium">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          {u.avatar_url ? (
                            <AvatarImage src={u.avatar_url} alt={u.full_name ?? ""} />
                          ) : null}
                          <AvatarFallback>
                            {(u.full_name ?? u.email ?? "U").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {u.full_name ?? "—"}
                      </div>
                    </td>
                    <td className="py-2 text-muted-foreground">{u.email ?? "—"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">No role</span>
                        ) : (
                          u.roles.map((r) => <Badge key={r} variant="secondary" className="capitalize">{r}</Badge>)
                        )}
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {ROLES.map((r) => {
                          const has = u.roles.includes(r);
                          return (
                            <Button
                              key={r}
                              size="sm"
                              variant={has ? "default" : "outline"}
                              onClick={() =>
                                toggleRole.mutate({
                                  userId: u.id,
                                  role: r,
                                  has,
                                })
                              }
                              disabled={toggleRole.isPending}
                              className="capitalize"
                            >
                              {r}
                            </Button>
                          );
                        })}
                        <EditUserDialog
                          user={u}
                          onSaved={() =>
                            qc.invalidateQueries({
                              queryKey: ["users-roles"],
                            })
                          }
                        />
                        <ResetPasswordDialog userId={u.id} email={u.email} />
                        {currentUser?.id !== u.id && (
                          <DeleteUserDialog
                            userId={u.id}
                            email={u.email}
                            onDeleted={() =>
                              qc.invalidateQueries({
                                queryKey: ["users-roles"],
                              })
                            }
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

function CreateUserDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>(["staff"]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      callAdminUsers({
        action: "create_user",
        email: email.trim(),
        password,
        full_name: fullName.trim() || undefined,
        phone: phone.trim() || undefined,
        avatar_url: avatarUrl,
        roles: selectedRoles,
      }),
    onSuccess: () => {
      toast.success("User created");
      onCreated();
      setOpen(false);
      setEmail("");
      setPassword("");
      setFullName("");
      setPhone("");
      setAvatarUrl(null);
      setSelectedRoles(["staff"]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleRole(r: AppRole, checked: boolean) {
    setSelectedRoles((prev) =>
      checked ? Array.from(new Set([...prev, r])) : prev.filter((x) => x !== r),
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-2 h-4 w-4" /> New user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            The new user will be confirmed automatically and can sign in
            immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <AvatarUpload
            value={avatarUrl}
            onChange={setAvatarUrl}
            folder="users"
            fallback={fullName || email || "U"}
          />
          <div className="grid gap-2">
            <Label htmlFor="new-email">Email</Label>
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password">Temporary password</Label>
            <Input
              id="new-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="new-name">Full name</Label>
              <Input
                id="new-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-phone">Phone</Label>
              <Input
                id="new-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Roles</Label>
            <div className="flex flex-wrap gap-3">
              {ROLES.map((r) => (
                <label
                  key={r}
                  className="flex items-center gap-2 text-sm capitalize"
                >
                  <Checkbox
                    checked={selectedRoles.includes(r)}
                    onCheckedChange={(v) => toggleRole(r, v === true)}
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={
              create.isPending ||
              !email.trim() ||
              password.length < 8 ||
              selectedRoles.length === 0
            }
          >
            {create.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  onSaved,
}: {
  user: UserRow;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatar_url ?? null);

  const save = useMutation({
    mutationFn: async () => {
      // Profile fields via direct update (admin RLS allows it)
      const { error: pErr } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
          avatar_url: avatarUrl,
        })
        .eq("id", user.id);
      if (pErr) throw pErr;

      // Email change requires admin auth update
      if (email.trim() && email.trim() !== (user.email ?? "")) {
        await callAdminUsers({
          action: "update_email",
          user_id: user.id,
          email: email.trim(),
        });
      }
    },
    onSuccess: () => {
      toast.success("User updated");
      onSaved();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setFullName(user.full_name ?? "");
          setPhone(user.phone ?? "");
          setEmail(user.email ?? "");
          setAvatarUrl(user.avatar_url ?? null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>Update profile information.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <AvatarUpload
            value={avatarUrl}
            onChange={setAvatarUrl}
            folder="users"
            entityId={user.id}
            fallback={fullName || email || "U"}
          />
          <div className="grid gap-2">
            <Label>Full name</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={save.isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  userId,
  email,
}: {
  userId: string;
  email: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");

  const reset = useMutation({
    mutationFn: () =>
      callAdminUsers({
        action: "reset_password",
        user_id: userId,
        password,
      }),
    onSuccess: () => {
      toast.success("Password reset");
      setPassword("");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" title="Reset password">
          <KeyRound className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for {email ?? "this user"}. Share it with them
            securely.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="reset-pw">New password</Label>
          <Input
            id="reset-pw"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={reset.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => reset.mutate()}
            disabled={reset.isPending || password.length < 8}
          >
            {reset.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Reset password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({
  userId,
  email,
  onDeleted,
}: {
  userId: string;
  email: string | null;
  onDeleted: () => void;
}) {
  const del = useMutation({
    mutationFn: () =>
      callAdminUsers({ action: "delete_user", user_id: userId }),
    onSuccess: () => {
      toast.success("User deleted");
      onDeleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive hover:text-destructive"
          title="Delete user"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete user?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes {email ?? "this user"} and their access.
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              del.mutate();
            }}
            disabled={del.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {del.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}