import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/payroll/components")({
  component: ComponentsPage,
});

type Form = {
  id?: string;
  name: string;
  code: string;
  type: "earning" | "deduction";
  calc_type: "fixed" | "percent_of_base";
  default_amount: string;
  is_statutory: boolean;
  active: boolean;
};

const empty: Form = {
  name: "",
  code: "",
  type: "earning",
  calc_type: "fixed",
  default_amount: "0",
  is_statutory: false,
  active: true,
};

function ComponentsPage() {
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(["admin", "finance"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);

  const { data, isLoading } = useQuery({
    queryKey: ["payroll_components"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_components")
        .select("*")
        .order("type")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        code: form.code || null,
        type: form.type,
        calc_type: form.calc_type,
        default_amount: parseFloat(form.default_amount || "0"),
        is_statutory: form.is_statutory,
        active: form.active,
      };
      if (form.id) {
        const { error } = await supabase
          .from("payroll_components")
          .update(payload as never)
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payroll_components").insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["payroll_components"] });
      setOpen(false);
      setForm(empty);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Payroll · Components">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Pay components</CardTitle>
            <CardDescription>Earnings and deductions catalog</CardDescription>
          </div>
          {canManage && (
            <Dialog
              open={open}
              onOpenChange={(o) => {
                setOpen(o);
                if (!o) setForm(empty);
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{form.id ? "Edit" : "New"} component</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>Name</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Code</Label>
                    <Input
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <select
                      className="w-full h-10 rounded-md border bg-background px-2"
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value as Form["type"] })}
                    >
                      <option value="earning">Earning</option>
                      <option value="deduction">Deduction</option>
                    </select>
                  </div>
                  <div>
                    <Label>Calculation</Label>
                    <select
                      className="w-full h-10 rounded-md border bg-background px-2"
                      value={form.calc_type}
                      onChange={(e) =>
                        setForm({ ...form, calc_type: e.target.value as Form["calc_type"] })
                      }
                    >
                      <option value="fixed">Fixed amount</option>
                      <option value="percent_of_base">% of base salary</option>
                    </select>
                  </div>
                  <div>
                    <Label>{form.calc_type === "fixed" ? "Default amount" : "Default %"}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.default_amount}
                      onChange={(e) => setForm({ ...form, default_amount: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.is_statutory}
                      onCheckedChange={(v) => setForm({ ...form, is_statutory: v })}
                    />
                    <Label>Statutory</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.active}
                      onCheckedChange={(v) => setForm({ ...form, active: v })}
                    />
                    <Label>Active</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => save.mutate()} disabled={save.isPending}>
                    {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Name</th>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Calc</th>
                  <th>Default</th>
                  <th>Statutory</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data?.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="py-2 font-medium">{c.name}</td>
                    <td>{c.code ?? "—"}</td>
                    <td>
                      <Badge variant={c.type === "earning" ? "default" : "secondary"}>
                        {c.type}
                      </Badge>
                    </td>
                    <td>{c.calc_type === "fixed" ? "Fixed" : "% of base"}</td>
                    <td>
                      {c.calc_type === "fixed"
                        ? `GHS ${Number(c.default_amount).toFixed(2)}`
                        : `${c.default_amount}%`}
                    </td>
                    <td>{c.is_statutory ? <Badge variant="outline">Yes</Badge> : "—"}</td>
                    <td className="text-right">
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setForm({
                              id: c.id,
                              name: c.name,
                              code: c.code ?? "",
                              type: c.type,
                              calc_type: c.calc_type,
                              default_amount: String(c.default_amount),
                              is_statutory: c.is_statutory,
                              active: c.active,
                            });
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
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
