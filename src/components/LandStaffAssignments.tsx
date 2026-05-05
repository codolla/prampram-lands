import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { toast } from "sonner";
import { UserPlus, X } from "lucide-react";

/**
 * Per-land staff override list. Admins can pin specific staff to a land,
 * which grants them visibility/edit access regardless of zone coverage.
 */
export function LandStaffAssignments({ landId }: { landId: string }) {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [pendingUser, setPendingUser] = useState<string>("");

  // All staff users (id + display name) — only admins can read user_roles writes,
  // but everyone can read user_roles SELECT, and profiles is auth-readable.
  const staffQuery = useQuery({
    queryKey: ["staff-users"],
    queryFn: async () => {
      const { data: roleRows, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "staff");
      if (error) throw error;
      const ids = Array.from(new Set((roleRows ?? []).map((r) => r.user_id)));
      if (ids.length === 0) return [] as { id: string; label: string }[];
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone")
        .in("id", ids);
      if (pErr) throw pErr;
      return (profs ?? []).map((p) => ({
        id: p.id,
        label: p.full_name || p.email || p.phone || p.id.slice(0, 8),
      }));
    },
  });

  const assignmentsQuery = useQuery({
    queryKey: ["land-staff-assignments", landId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("land_staff_assignments")
        .select("id, user_id")
        .eq("land_id", landId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("land_staff_assignments")
        .insert({ land_id: landId, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Staff assigned");
      setPendingUser("");
      qc.invalidateQueries({ queryKey: ["land-staff-assignments", landId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("land_staff_assignments")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Staff unassigned");
      qc.invalidateQueries({ queryKey: ["land-staff-assignments", landId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (assignmentsQuery.isLoading || staffQuery.isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  const assigned = assignmentsQuery.data ?? [];
  const staff = staffQuery.data ?? [];
  const nameFor = (uid: string) =>
    staff.find((s) => s.id === uid)?.label ?? uid.slice(0, 8);

  const available = staff.filter((s) => !assigned.some((a) => a.user_id === s.id));

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Staff listed here can always see and edit this land, even if it falls
        outside their assigned zones. Zone-based assignments still apply on top.
      </p>

      {assigned.length === 0 ? (
        <p className="text-sm text-muted-foreground">No direct overrides.</p>
      ) : (
        <ul className="divide-y rounded-md border border-border">
          {assigned.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="text-sm">{nameFor(a.user_id)}</span>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove.mutate(a.id)}
                  disabled={remove.isPending}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label>Add staff</Label>
            <SearchableSelect
              value={pendingUser || "__none__"}
              onValueChange={(v) => setPendingUser(v === "__none__" ? "" : v)}
              searchPlaceholder="Search staff…"
              options={[
                { value: "__none__", label: "— Select staff —" },
                ...available.map((s) => ({ value: s.id, label: s.label })),
              ]}
            />
          </div>
          <Button
            onClick={() => pendingUser && add.mutate(pendingUser)}
            disabled={!pendingUser || add.isPending}
          >
            <UserPlus className="mr-1 h-4 w-4" />
            Assign
          </Button>
        </div>
      )}
    </div>
  );
}