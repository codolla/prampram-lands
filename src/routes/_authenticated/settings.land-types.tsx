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
import { TableSkeleton } from "@/components/skeletons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Layers, Loader2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/land-types")({
  component: LandTypesPage,
});

type LandType = {
  id: string;
  name: string;
  label: string;
  description: string | null;
  sort_order: number;
  active: boolean;
  updated_at: string;
};

function LandTypesPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["land-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("land_types")
        .select("id, name, label, description, sort_order, active, updated_at")
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LandType[];
    },
  });

  if (!hasRole("admin")) {
    return (
      <AppShell title="Land Types">
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12">
            <ShieldCheck className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Admin access required.</p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const types = query.data ?? [];

  return (
    <AppShell
      title="Land Types"
      actions={
        <TypeDialog
          mode="create"
          onSaved={() => qc.invalidateQueries({ queryKey: ["land-types"] })}
        />
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About land types</CardTitle>
            <CardDescription>
              Define the categories used when registering lands and rent
              packages (e.g. Residential, Commercial). Types in use can't be
              deleted — deactivate them instead to hide from new entries.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {query.isLoading ? (
              <TableSkeleton columns={4} rows={5} />
            ) : types.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Layers className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">No land types yet</p>
                <p className="text-xs text-muted-foreground">
                  Create one to start categorising lands.
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="pb-2">Order</th>
                    <th className="pb-2">Label</th>
                    <th className="pb-2">Key</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2 text-right">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {types.map((t) => (
                    <tr key={t.id} className="border-b last:border-0 align-top">
                      <td className="py-3 font-mono text-xs text-muted-foreground">
                        {t.sort_order}
                      </td>
                      <td className="py-3">
                        <div className="font-medium">{t.label}</div>
                        {t.description && (
                          <div className="text-xs text-muted-foreground">
                            {t.description}
                          </div>
                        )}
                      </td>
                      <td className="py-3 font-mono text-xs">{t.name}</td>
                      <td className="py-3">
                        {t.active ? (
                          <Badge variant="secondary">Active</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <TypeDialog
                            mode="edit"
                            type={t}
                            onSaved={() =>
                              qc.invalidateQueries({ queryKey: ["land-types"] })
                            }
                          />
                          <DeleteTypeDialog
                            type={t}
                            onDeleted={() =>
                              qc.invalidateQueries({ queryKey: ["land-types"] })
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function TypeDialog({
  mode,
  type,
  onSaved,
}: {
  mode: "create" | "edit";
  type?: LandType;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(type?.label ?? "");
  const [name, setName] = useState(type?.name ?? "");
  const [description, setDescription] = useState(type?.description ?? "");
  const [sortOrder, setSortOrder] = useState<string>(
    type ? String(type.sort_order) : "0",
  );
  const [active, setActive] = useState(type?.active ?? true);
  const [nameTouched, setNameTouched] = useState(false);

  const reset = () => {
    setLabel(type?.label ?? "");
    setName(type?.name ?? "");
    setDescription(type?.description ?? "");
    setSortOrder(type ? String(type.sort_order) : "0");
    setActive(type?.active ?? true);
    setNameTouched(false);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        label: label.trim(),
        name: (name.trim() || slugify(label)).toLowerCase(),
        description: description.trim() || null,
        sort_order: Number(sortOrder) || 0,
        active,
      };
      if (!payload.label) throw new Error("Label is required");
      if (!payload.name) throw new Error("Key is required");
      if (mode === "create") {
        const { error } = await supabase.from("land_types").insert(payload);
        if (error) throw error;
      } else if (type) {
        const { error } = await supabase
          .from("land_types")
          .update(payload)
          .eq("id", type.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(mode === "create" ? "Land type created" : "Land type updated");
      onSaved();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = label.trim().length > 0;

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
            <Plus className="mr-2 h-4 w-4" /> New land type
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
            {mode === "create" ? "Create land type" : "Edit land type"}
          </DialogTitle>
          <DialogDescription>
            Categories appear in the land registration form and rent package
            settings.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="lt-label">Label</Label>
            <Input
              id="lt-label"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (!nameTouched && mode === "create") {
                  setName(slugify(e.target.value));
                }
              }}
              placeholder="e.g. Residential"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="lt-name">Key</Label>
              <Input
                id="lt-name"
                value={name}
                onChange={(e) => {
                  setNameTouched(true);
                  setName(e.target.value.toLowerCase().replace(/\s+/g, "_"));
                }}
                placeholder="residential"
              />
              <p className="text-[11px] text-muted-foreground">
                Internal identifier. Lower-case, no spaces. Auto-filled from label.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lt-order">Sort order</Label>
              <Input
                id="lt-order"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lt-desc">Description (optional)</Label>
            <Textarea
              id="lt-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <Label htmlFor="lt-active" className="text-sm">Active</Label>
              <p className="text-xs text-muted-foreground">
                Inactive types are hidden from new lands and packages.
              </p>
            </div>
            <Switch id="lt-active" checked={active} onCheckedChange={setActive} />
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
          <Button onClick={() => save.mutate()} disabled={!valid || save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "create" ? "Create" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTypeDialog({
  type,
  onDeleted,
}: {
  type: LandType;
  onDeleted: () => void;
}) {
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("land_types")
        .delete()
        .eq("id", type.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Land type deleted");
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
          <AlertDialogTitle>Delete this land type?</AlertDialogTitle>
          <AlertDialogDescription>
            "{type.label}" will be removed. If any land or rent package still
            uses it, deletion will be blocked — deactivate instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => del.mutate()}
            disabled={del.isPending}
          >
            {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}