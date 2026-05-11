import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CardSkeleton } from "@/components/skeletons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, ShieldCheck, Tags, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/rent-packages")({
  component: RentPackagesPage,
});

type LandTypeRow = {
  id: string;
  name: string;
  label: string;
  active: boolean;
  sort_order: number;
};

type RentPackage = {
  id: string;
  name: string;
  land_type_id: string;
  annual_amount: number;
  description: string | null;
  active: boolean;
  updated_at: string;
};

const ghs = (n: number) =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2,
  }).format(n);

function RentPackagesPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();

  const typesQuery = useQuery({
    queryKey: ["land-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("land_types")
        .select("id, name, label, active, sort_order")
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LandTypeRow[];
    },
  });

  const query = useQuery({
    queryKey: ["rent-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rent_packages")
        .select("id, name, land_type_id, annual_amount, description, active, updated_at")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RentPackage[];
    },
  });

  if (!hasRole("admin")) {
    return (
      <AppShell title="Rent Packages">
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12">
            <ShieldCheck className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Admin access required.</p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const types = typesQuery.data ?? [];
  const grouped = new Map<string, RentPackage[]>();
  for (const p of query.data ?? []) {
    const arr = grouped.get(p.land_type_id) ?? [];
    arr.push(p);
    grouped.set(p.land_type_id, arr);
  }

  return (
    <AppShell
      title="Rent Packages"
      actions={
        <PackageDialog
          mode="create"
          types={types}
          onSaved={() => qc.invalidateQueries({ queryKey: ["rent-packages"] })}
        />
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About rent packages</CardTitle>
            <CardDescription>
              Configure the ground-rent rate per plot for each land type (and package variant). When
              recording a land, choose its type and a matching package — the system will calculate
              the annual rent using the parcel size (1 plot = 0.16 acres).
            </CardDescription>
          </CardHeader>
        </Card>

        {query.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <CardSkeleton lines={3} />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (query.data ?? []).length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Tags className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">No packages yet</p>
                <p className="text-xs text-muted-foreground">
                  Create your first rent package to start billing.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          types
            .filter((t) => grouped.has(t.id))
            .map((t) => (
              <Card key={t.id}>
                <CardHeader>
                  <CardTitle className="text-base">{t.label}</CardTitle>
                  <CardDescription>
                    {grouped.get(t.id)!.length} package
                    {grouped.get(t.id)!.length === 1 ? "" : "s"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                        <th className="pb-2">Package</th>
                        <th className="pb-2">Rate per plot</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2 text-right">Manage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.get(t.id)!.map((p) => (
                        <tr key={p.id} className="border-b last:border-0 align-top">
                          <td className="py-3">
                            <div className="font-medium">{p.name}</div>
                            {p.description && (
                              <div className="text-xs text-muted-foreground">{p.description}</div>
                            )}
                          </td>
                          <td className="py-3 font-mono">{ghs(Number(p.annual_amount))}</td>
                          <td className="py-3">
                            {p.active ? (
                              <Badge variant="secondary">Active</Badge>
                            ) : (
                              <Badge variant="outline">Inactive</Badge>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <PackageDialog
                                mode="edit"
                                pkg={p}
                                types={types}
                                onSaved={() =>
                                  qc.invalidateQueries({
                                    queryKey: ["rent-packages"],
                                  })
                                }
                              />
                              <DeletePackageDialog
                                pkg={p}
                                onDeleted={() =>
                                  qc.invalidateQueries({
                                    queryKey: ["rent-packages"],
                                  })
                                }
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ))
        )}
      </div>
    </AppShell>
  );
}

function PackageDialog({
  mode,
  pkg,
  types,
  onSaved,
}: {
  mode: "create" | "edit";
  pkg?: RentPackage;
  types: LandTypeRow[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(pkg?.name ?? "");
  const [landTypeId, setLandTypeId] = useState<string>(pkg?.land_type_id ?? types[0]?.id ?? "");
  const [amount, setAmount] = useState<string>(pkg ? String(pkg.annual_amount) : "");
  const [description, setDescription] = useState(pkg?.description ?? "");
  const [active, setActive] = useState(pkg?.active ?? true);

  const reset = () => {
    setName(pkg?.name ?? "");
    setLandTypeId(pkg?.land_type_id ?? types[0]?.id ?? "");
    setAmount(pkg ? String(pkg.annual_amount) : "");
    setDescription(pkg?.description ?? "");
    setActive(pkg?.active ?? true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        land_type_id: landTypeId,
        annual_amount: Number(amount),
        description: description.trim() || null,
        active,
      };
      if (mode === "create") {
        const { error } = await supabase.from("rent_packages").insert(payload);
        if (error) throw error;
      } else if (pkg) {
        const { error } = await supabase.from("rent_packages").update(payload).eq("id", pkg.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(mode === "create" ? "Package created" : "Package updated");
      onSaved();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const amt = Number(amount);
  const valid = name.trim().length > 0 && Number.isFinite(amt) && amt >= 0 && landTypeId.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" /> New package
          </Button>
        ) : (
          <Button size="sm" variant="outline">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create rent package" : "Edit rent package"}
          </DialogTitle>
          <DialogDescription>
            Set the rent rate per plot for a specific land type.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="pkg-name">Package name</Label>
            <Input
              id="pkg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard residential"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Land type</Label>
              <Select value={landTypeId} onValueChange={(v) => setLandTypeId(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pkg-amount">Rate per plot (GHS)</Label>
              <Input
                id="pkg-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pkg-desc">Description (optional)</Label>
            <Textarea
              id="pkg-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Notes about who or what this package applies to"
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <Label htmlFor="pkg-active" className="text-sm">
                Active
              </Label>
              <p className="text-xs text-muted-foreground">
                Inactive packages stay on existing lands but can't be picked for new ones.
              </p>
            </div>
            <Switch id="pkg-active" checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!valid || save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "create" ? "Create" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeletePackageDialog({ pkg, onDeleted }: { pkg: RentPackage; onDeleted: () => void }) {
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("rent_packages").delete().eq("id", pkg.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Package deleted");
      onDeleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this package?</AlertDialogTitle>
          <AlertDialogDescription>
            "{pkg.name}" will be removed. Lands currently linked to it will keep their billing
            amounts but lose the package reference.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => del.mutate()} disabled={del.isPending}>
            {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
