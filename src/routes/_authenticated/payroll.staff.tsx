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
import { formatCurrency } from "@/lib/format";
import { Loader2, Plus, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/payroll/staff")({
  component: PayrollStaffPage,
});

const PAGE_SIZE = 25;

type PayrollStaffRow = {
  id: string;
  full_name: string;
  employee_number: string | null;
  job_title: string | null;
  ssnit_number: string | null;
  tin_number: string | null;
  bank_name: string | null;
  bank_account: string | null;
  base_salary: number;
  user_id: string | null;
  active: boolean;
};

type StaffForm = {
  id?: string;
  full_name: string;
  employee_number: string;
  job_title: string;
  ssnit_number: string;
  tin_number: string;
  bank_name: string;
  bank_account: string;
  base_salary: string;
  user_id: string;
  active: boolean;
};

const empty: StaffForm = {
  full_name: "",
  employee_number: "",
  job_title: "",
  ssnit_number: "",
  tin_number: "",
  bank_name: "",
  bank_account: "",
  base_salary: "0",
  user_id: "",
  active: true,
};

function PayrollStaffPage() {
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(["admin", "finance"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<StaffForm>(empty);
  const [page, setPage] = useState(1);

  const { data: staff, isLoading } = useQuery<{ rows: PayrollStaffRow[]; count: number }>({
    queryKey: ["payroll_staff", page],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await supabase
        .from("payroll_staff")
        .select("*", { count: "exact" })
        .order("full_name")
        .range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as PayrollStaffRow[], count: count ?? 0 };
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles_simple"],
    enabled: canManage,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        full_name: form.full_name,
        employee_number: form.employee_number || null,
        job_title: form.job_title || null,
        ssnit_number: form.ssnit_number || null,
        tin_number: form.tin_number || null,
        bank_name: form.bank_name || null,
        bank_account: form.bank_account || null,
        base_salary: parseFloat(form.base_salary || "0"),
        user_id: form.user_id || null,
        active: form.active,
      };
      if (form.id) {
        const { error } = await supabase
          .from("payroll_staff")
          .update(payload as never)
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payroll_staff").insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["payroll_staff"] });
      setOpen(false);
      setForm(empty);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (s: PayrollStaffRow) => {
    setForm({
      id: s.id,
      full_name: s.full_name,
      employee_number: s.employee_number ?? "",
      job_title: s.job_title ?? "",
      ssnit_number: s.ssnit_number ?? "",
      tin_number: s.tin_number ?? "",
      bank_name: s.bank_name ?? "",
      bank_account: s.bank_account ?? "",
      base_salary: String(s.base_salary ?? 0),
      user_id: s.user_id ?? "",
      active: s.active,
    });
    setOpen(true);
  };

  return (
    <AppShell title="Payroll · Staff">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Staff</CardTitle>
            <CardDescription>Salary & profile records</CardDescription>
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
                  Add staff
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{form.id ? "Edit" : "Add"} staff</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>Full name</Label>
                    <Input
                      value={form.full_name}
                      onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Employee #</Label>
                    <Input
                      value={form.employee_number}
                      onChange={(e) => setForm({ ...form, employee_number: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Job title</Label>
                    <Input
                      value={form.job_title}
                      onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Base salary (GHS)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.base_salary}
                      onChange={(e) => setForm({ ...form, base_salary: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Linked user</Label>
                    <select
                      className="w-full h-10 rounded-md border bg-background px-2"
                      value={form.user_id}
                      onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                    >
                      <option value="">— none —</option>
                      {profiles?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name || p.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>SSNIT #</Label>
                    <Input
                      value={form.ssnit_number}
                      onChange={(e) => setForm({ ...form, ssnit_number: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>TIN</Label>
                    <Input
                      value={form.tin_number}
                      onChange={(e) => setForm({ ...form, tin_number: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Bank</Label>
                    <Input
                      value={form.bank_name}
                      onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Account #</Label>
                    <Input
                      value={form.bank_account}
                      onChange={(e) => setForm({ ...form, bank_account: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2">Name</th>
                    <th>Emp #</th>
                    <th>Title</th>
                    <th>Base salary</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(staff?.rows ?? []).map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="py-2 font-medium">{s.full_name}</td>
                      <td>{s.employee_number ?? "—"}</td>
                      <td>{s.job_title ?? "—"}</td>
                      <td>{formatCurrency(s.base_salary)}</td>
                      <td>
                        <Badge variant={s.active ? "default" : "outline"}>
                          {s.active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="text-right">
                        {canManage && (
                          <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(!staff || staff.rows.length === 0) && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-muted-foreground">
                        No staff yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {(() => {
                const total = staff?.count ?? 0;
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
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
