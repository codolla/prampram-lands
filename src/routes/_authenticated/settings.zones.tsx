import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ZoneMapEditor, type LngLatRing } from "@/components/ZoneMapEditor";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useAuth } from "@/lib/auth";
import { Plus, Save, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/zones")({
  component: ZonesPage,
});

interface ZoneRow {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  ring: [number, number][] | null;
  created_at: string;
}

function ZonesPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const isAdmin = auth.hasRole("admin");
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftRing, setDraftRing] = useState<LngLatRing[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!auth.loading && !isAdmin) nav({ to: "/dashboard" });
  }, [auth.loading, isAdmin, nav]);

  const zones = useQuery({
    queryKey: ["staff-zones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_zones")
        .select("id, name, description, active, ring, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ZoneRow[];
    },
  });

  const selected = useMemo(
    () => zones.data?.find((z) => z.id === selectedId) ?? null,
    [zones.data, selectedId],
  );

  // When the selected zone changes, hydrate the editor.
  useEffect(() => {
    if (selected) {
      setName(selected.name);
      setDescription(selected.description ?? "");
      setActive(selected.active);
      setDraftRing((selected.ring ?? []).map(([lng, lat]) => ({ lng, lat })));
    } else {
      setName("");
      setDescription("");
      setActive(true);
      setDraftRing([]);
    }
  }, [selected]);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Zone name is required");
      if (draftRing.length < 3) throw new Error("Draw a polygon with 3+ points");
      const ringJson = draftRing.map((p) => [p.lng, p.lat]);
      const { data, error } = await supabase.rpc("upsert_staff_zone", {
        _id: (selectedId ?? undefined) as unknown as string,
        _name: name.trim(),
        _description: (description.trim() || undefined) as unknown as string,
        _active: active,
        _ring: ringJson as unknown as never,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      toast.success("Zone saved");
      setSelectedId(id);
      qc.invalidateQueries({ queryKey: ["staff-zones"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_zones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Zone deleted");
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["staff-zones"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const existingForMap = useMemo(
    () =>
      (zones.data ?? []).map((z) => ({
        id: z.id,
        name: z.name,
        active: z.active,
        highlight: z.id === selectedId,
        ring: (z.ring ?? []).map(([lng, lat]) => ({ lng, lat })),
      })),
    [zones.data, selectedId],
  );

  if (!isAdmin) return null;

  return (
    <AppShell title="Staff zones">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Zones</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setSelectedId(null)}>
              <Plus className="mr-1 h-4 w-4" /> New
            </Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {zones.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (zones.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No zones yet. Click "New" and draw one on the map.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {zones.data!.map((z) => (
                  <li key={z.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(z.id)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted ${
                        z.id === selectedId ? "bg-muted" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{z.name}</p>
                        {z.description && (
                          <p className="truncate text-xs text-muted-foreground">{z.description}</p>
                        )}
                      </div>
                      {!z.active && (
                        <Badge variant="outline" className="text-xs">
                          Inactive
                        </Badge>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{selectedId ? "Edit zone" : "New zone"}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Draw a polygon on the map. Lands whose boundary (or GPS point) falls inside this
                zone are auto-assigned to its staff.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Zone name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. North Prampram"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label>Active</Label>
                    <div className="flex h-9 items-center">
                      <Switch checked={active} onCheckedChange={setActive} />
                      <span className="ml-2 text-xs text-muted-foreground">
                        Inactive zones don't grant access.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional notes about this zone"
                />
              </div>
              <ZoneMapEditor
                initial={draftRing}
                existingZones={existingForMap}
                onChange={setDraftRing}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  <Save className="mr-1 h-4 w-4" />
                  {save.isPending ? "Saving…" : selectedId ? "Save changes" : "Create zone"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {draftRing.length} polygon point{draftRing.length === 1 ? "" : "s"}
                </p>
                {selectedId && (
                  <Button
                    variant="ghost"
                    className="ml-auto text-destructive"
                    onClick={() => {
                      if (
                        confirm("Delete this zone? Staff lose auto-coverage of lands inside it.")
                      ) {
                        remove.mutate(selectedId);
                      }
                    }}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Delete zone
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {selectedId && <ZoneStaffPanel zoneId={selectedId} />}
        </div>
      </div>
    </AppShell>
  );
}

function ZoneStaffPanel({ zoneId }: { zoneId: string }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState("");

  const staff = useQuery({
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

  const assignments = useQuery({
    queryKey: ["zone-staff", zoneId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_zone_assignments")
        .select("id, user_id")
        .eq("zone_id", zoneId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("staff_zone_assignments")
        .insert({ zone_id: zoneId, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Staff added to zone");
      setPending("");
      qc.invalidateQueries({ queryKey: ["zone-staff", zoneId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_zone_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["zone-staff", zoneId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assigned = assignments.data ?? [];
  const allStaff = staff.data ?? [];
  const available = allStaff.filter((s) => !assigned.some((a) => a.user_id === s.id));
  const nameFor = (uid: string) => allStaff.find((s) => s.id === uid)?.label ?? uid.slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Assigned staff</CardTitle>
        <p className="text-sm text-muted-foreground">
          Two or more staff can manage the same zone. They'll all see lands and landowners that fall
          inside it.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {assignments.isLoading || staff.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : assigned.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff assigned yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {assigned.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-3 py-2">
                <span className="text-sm">{nameFor(a.user_id)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove.mutate(a.id)}
                  disabled={remove.isPending}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label>Add staff</Label>
            <SearchableSelect
              value={pending || "__none__"}
              onValueChange={(v) => setPending(v === "__none__" ? "" : v)}
              searchPlaceholder="Search staff…"
              options={[
                { value: "__none__", label: "— Select staff —" },
                ...available.map((s) => ({ value: s.id, label: s.label })),
              ]}
            />
          </div>
          <Button
            onClick={() => pending && add.mutate(pending)}
            disabled={!pending || add.isPending}
          >
            <UserPlus className="mr-1 h-4 w-4" /> Assign
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
