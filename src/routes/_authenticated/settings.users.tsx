import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth, type AppRole } from "@/lib/auth";
import { looksLikePhone, normalisePhone } from "@/lib/phone-auth";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/skeletons";
import { ShieldCheck, UserPlus, KeyRound, Pencil, Trash2, Loader2 } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

type DbRole = Exclude<AppRole, "developer">;

const ROLES: DbRole[] = ["admin", "manager", "frontdesk", "staff", "finance"];

const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Manager",
  frontdesk: "FrontDesk",
  staff: "Staff",
  finance: "Finance",
  developer: "Developer",
};

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  roles: AppRole[];
};

async function friendlyEdgeFunctionError(error: unknown, response?: Response): Promise<string> {
  const err = error as { name?: string; message?: string; context?: unknown };
  const name = err?.name ?? "";

  if (name === "FunctionsFetchError") {
    return "Could not reach the server. Check your internet connection and try again.";
  }

  if (name === "FunctionsRelayError") {
    return "Service is temporarily unavailable. Please try again.";
  }

  if (name === "FunctionsHttpError") {
    const res = (err.context ?? response) as Response | undefined;
    const status =
      typeof (res as { status?: unknown })?.status === "number" ? res?.status : undefined;
    const payload = res
      ? await res
          .clone()
          .json()
          .catch(() => null as unknown as null)
      : null;
    const serverMsg =
      (payload as { error?: string; message?: string; detail?: string } | null)?.error ??
      (payload as { error?: string; message?: string; detail?: string } | null)?.message ??
      (payload as { error?: string; message?: string; detail?: string } | null)?.detail ??
      null;

    if (status === 401) return "Your session has expired. Please sign in again.";
    if (status === 403) return serverMsg ?? "You do not have permission to do this.";
    if (status === 404) return "This action is currently unavailable. Please contact support.";
    if (status && status >= 500) return "Server error. Please try again.";
    return serverMsg ?? "Request failed. Please check your input and try again.";
  }

  if ((err?.message ?? "").includes("Edge Function returned a non-2xx status code")) {
    return "Action failed. Please try again.";
  }

  return err?.message ?? "Something went wrong. Please try again.";
}

async function callAdminUsers(payload: Record<string, unknown>) {
  const { data, error, response } = await supabase.functions.invoke("admin-users", {
    body: payload,
  });
  if (error) {
    throw new Error(await friendlyEdgeFunctionError(error, response));
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function UsersPage() {
  const { hasRole, user: currentUser } = useAuth();
  const isDeveloper = hasRole("developer");
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const data = useQuery<{ rows: UserRow[]; count: number }>({
    queryKey: ["users-roles", page],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const profilesRes = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, avatar_url", { count: "exact" })
        .order("full_name")
        .range(from, to);
      if (profilesRes.error) throw profilesRes.error;
      const ids = (profilesRes.data ?? []).map((p) => p.id);
      const rolesRes =
        ids.length === 0
          ? { data: [], error: null as unknown as null }
          : await supabase.from("user_roles").select("user_id, role").in("user_id", ids);
      if (rolesRes.error) throw rolesRes.error;
      const byUser = new Map<string, AppRole[]>();
      for (const r of rolesRes.data ?? []) {
        const arr = byUser.get(r.user_id) ?? [];
        arr.push(r.role as AppRole);
        byUser.set(r.user_id, arr);
      }
      const rows = (profilesRes.data ?? []).map((p) => ({
        ...p,
        roles: byUser.get(p.id) ?? [],
      })) as UserRow[];
      return { rows, count: profilesRes.count ?? 0 };
    },
  });

  const toggleRole = useMutation({
    mutationFn: async ({ userId, role, has }: { userId: string; role: DbRole; has: boolean }) => {
      if (has) {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", role);
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
        <div className="flex items-center gap-2">
          {!isDeveloper ? (
            <EnsureDefaultDeveloperButton
              onDone={() => qc.invalidateQueries({ queryKey: ["users-roles"] })}
            />
          ) : null}
          <CreateUserDialog onCreated={() => qc.invalidateQueries({ queryKey: ["users-roles"] })} />
        </div>
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
                {(data.data?.rows ?? []).map((u) => (
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
                          u.roles.map((r) => (
                            <Badge key={r} variant="secondary">
                              {ROLE_LABEL[r]}
                            </Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" disabled={toggleRole.isPending}>
                              Roles
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Assign roles</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {ROLES.map((r) => {
                              const has = u.roles.includes(r);
                              return (
                                <DropdownMenuCheckboxItem
                                  key={r}
                                  checked={has}
                                  onCheckedChange={() =>
                                    toggleRole.mutate({
                                      userId: u.id,
                                      role: r,
                                      has,
                                    })
                                  }
                                  disabled={toggleRole.isPending}
                                >
                                  {ROLE_LABEL[r]}
                                </DropdownMenuCheckboxItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
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
          {(() => {
            const total = data.data?.count ?? 0;
            const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
            if (totalPages <= 1) return null;
            return (
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} · {total} records
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </AppShell>
  );
}

function CreateUserDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const { hasRole } = useAuth();
  const isDeveloper = hasRole("developer");
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
        phone: phone.trim()
          ? looksLikePhone(phone.trim())
            ? normalisePhone(phone.trim())
            : (() => {
                throw new Error("Enter a valid phone number.");
              })()
          : undefined,
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
            The new user will be confirmed automatically and can sign in immediately.
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
              <Input id="new-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-phone">Phone</Label>
              <Input id="new-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Roles</Label>
            <div className="flex flex-wrap gap-3">
              {ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm capitalize">
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
          <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={
              create.isPending || !email.trim() || password.length < 8 || selectedRoles.length === 0
            }
          >
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnsureDefaultDeveloperButton({ onDone }: { onDone: () => void }) {
  const create = useMutation({
    mutationFn: () => callAdminUsers({ action: "ensure_default_developer" }),
    onSuccess: () => {
      toast.success("Developer account ensured");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Button size="sm" variant="outline" onClick={() => create.mutate()} disabled={create.isPending}>
      {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      Create developer
    </Button>
  );
}

function EditUserDialog({ user, onSaved }: { user: UserRow; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatar_url ?? null);

  const save = useMutation({
    mutationFn: async () => {
      // Profile fields via direct update (admin RLS allows it)
      const nextPhone = phone.trim();
      if (nextPhone && !looksLikePhone(nextPhone)) {
        throw new Error("Enter a valid phone number.");
      }
      const { error: pErr } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim() || null,
          phone: nextPhone ? normalisePhone(nextPhone) : null,
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
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ userId, email }: { userId: string; email: string | null }) {
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
            Set a new password for {email ?? "this user"}. Share it with them securely.
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
          <Button variant="outline" onClick={() => setOpen(false)} disabled={reset.isPending}>
            Cancel
          </Button>
          <Button onClick={() => reset.mutate()} disabled={reset.isPending || password.length < 8}>
            {reset.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
    mutationFn: () => callAdminUsers({ action: "delete_user", user_id: userId }),
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
            This permanently removes {email ?? "this user"} and their access. This cannot be undone.
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
            {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
