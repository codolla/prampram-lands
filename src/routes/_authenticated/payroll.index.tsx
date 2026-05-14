import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/format";
import { Loader2, Plus, Receipt, Users, Settings2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/payroll/")({
  component: PayrollIndex,
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PAGE_SIZE = 25;

type PayrollRunRow = {
  id: string;
  period_year: number;
  period_month: number;
  status: string;
  total_gross: number;
  total_deductions: number;
  total_net: number;
};

type PayslipRow = {
  id: string;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  paid: boolean;
  paid_at: string | null;
  payroll_runs: { period_year: number; period_month: number; status: string } | null;
};

function PayrollIndex() {
  const { hasAnyRole, hasRole, user } = useAuth();
  const canManage = hasAnyRole(["admin", "developer", "finance"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [runsPage, setRunsPage] = useState(1);
  const [slipsPage, setSlipsPage] = useState(1);

  const { data: runs, isLoading } = useQuery<{ rows: PayrollRunRow[]; count: number }>({
    queryKey: ["payroll_runs", runsPage],
    enabled: canManage,
    queryFn: async () => {
      const from = (runsPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await supabase
        .from("payroll_runs")
        .select("*", { count: "exact" })
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as PayrollRunRow[], count: count ?? 0 };
    },
  });

  const { data: mySlips } = useQuery<{ rows: PayslipRow[]; count: number }>({
    queryKey: ["my_payslips", user?.id, slipsPage],
    enabled: !!user?.id,
    queryFn: async () => {
      const from = (slipsPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await supabase
        .from("payslips")
        .select("*, payroll_runs(period_year, period_month, status)", { count: "exact" })
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as PayslipRow[], count: count ?? 0 };
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("payroll_runs")
        .insert({ period_year: year, period_month: month } as never)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Payroll run created");
      qc.invalidateQueries({ queryKey: ["payroll_runs"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Payroll">
      <div className="space-y-6">
        {canManage && (
          <div className="grid gap-4 md:grid-cols-3">
            <Link to="/payroll/staff" className="block">
              <Card className="hover:border-primary transition">
                <CardHeader className="flex-row items-center gap-3 space-y-0">
                  <Users className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-base">Staff</CardTitle>
                    <CardDescription>Salaries & profiles</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
            <Link to="/payroll/components" className="block">
              <Card className="hover:border-primary transition">
                <CardHeader className="flex-row items-center gap-3 space-y-0">
                  <Settings2 className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-base">Components</CardTitle>
                    <CardDescription>Earnings & deductions</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
            <Card>
              <CardHeader className="flex-row items-center gap-3 space-y-0">
                <Receipt className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">Runs</CardTitle>
                  <CardDescription>{runs?.count ?? 0} total</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </div>
        )}

        {canManage && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Payroll runs</CardTitle>
                <CardDescription>One run per month</CardDescription>
              </div>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    New run
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create payroll run</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Year</Label>
                      <Input
                        type="number"
                        value={year}
                        onChange={(e) => setYear(parseInt(e.target.value))}
                      />
                    </div>
                    <div>
                      <Label>Month</Label>
                      <select
                        className="w-full h-10 rounded-md border bg-background px-2"
                        value={month}
                        onChange={(e) => setMonth(parseInt(e.target.value))}
                      >
                        {MONTHS.map((m, i) => (
                          <option key={i} value={i + 1}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => create.mutate()} disabled={create.isPending}>
                      {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Create
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-2">Period</th>
                        <th>Status</th>
                        <th>Gross</th>
                        <th>Deductions</th>
                        <th>Net</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(runs?.rows ?? []).map((r) => (
                        <tr key={r.id} className="border-t">
                          <td className="py-2">
                            {MONTHS[r.period_month - 1]} {r.period_year}
                          </td>
                          <td>
                            <Badge
                              variant={
                                r.status === "paid"
                                  ? "default"
                                  : r.status === "finalized"
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              {r.status}
                            </Badge>
                          </td>
                          <td>{formatCurrency(r.total_gross)}</td>
                          <td>{formatCurrency(r.total_deductions)}</td>
                          <td className="font-medium">{formatCurrency(r.total_net)}</td>
                          <td className="text-right">
                            <Link to="/payroll/runs/$runId" params={{ runId: r.id }}>
                              <Button variant="ghost" size="sm">
                                Open
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                      {(!runs || runs.rows.length === 0) && (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-muted-foreground">
                            No runs yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {(() => {
                    const total = runs?.count ?? 0;
                    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
                    if (totalPages <= 1) return null;
                    return (
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground">
                          Page {runsPage} of {totalPages} · {total} records
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={runsPage <= 1}
                            onClick={() => setRunsPage((p) => Math.max(1, p - 1))}
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={runsPage >= totalPages}
                            onClick={() => setRunsPage((p) => Math.min(totalPages, p + 1))}
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
        )}

        <Card>
          <CardHeader>
            <CardTitle>My payslips</CardTitle>
            <CardDescription>Your monthly pay history</CardDescription>
          </CardHeader>
          <CardContent>
            {!mySlips || mySlips.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payslips yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2">Period</th>
                      <th>Gross</th>
                      <th>Deductions</th>
                      <th>Net</th>
                      <th>Paid</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mySlips.rows.map((s) => {
                      const r = s.payroll_runs;
                      return (
                        <tr key={s.id} className="border-t">
                          <td className="py-2">
                            {r ? `${MONTHS[r.period_month - 1]} ${r.period_year}` : "—"}
                          </td>
                          <td>{formatCurrency(s.gross_pay)}</td>
                          <td>{formatCurrency(s.total_deductions)}</td>
                          <td className="font-medium">{formatCurrency(s.net_pay)}</td>
                          <td>
                            {s.paid ? (
                              formatDate(s.paid_at)
                            ) : (
                              <Badge variant="outline">Pending</Badge>
                            )}
                          </td>
                          <td className="text-right">
                            <Link to="/payroll/payslips/$payslipId" params={{ payslipId: s.id }}>
                              <Button variant="ghost" size="sm">
                                View
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(() => {
                  const total = mySlips.count ?? 0;
                  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
                  if (totalPages <= 1) return null;
                  return (
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="text-xs text-muted-foreground">
                        Page {slipsPage} of {totalPages} · {total} records
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={slipsPage <= 1}
                          onClick={() => setSlipsPage((p) => Math.max(1, p - 1))}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={slipsPage >= totalPages}
                          onClick={() => setSlipsPage((p) => Math.min(totalPages, p + 1))}
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
      </div>
    </AppShell>
  );
}
