import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/format";
import { Loader2, Play, CheckCircle2, BadgeDollarSign } from "lucide-react";
import { generatePayrollRun } from "@/lib/payroll.functions";

export const Route = createFileRoute("/_authenticated/payroll/runs/$runId")({
  component: RunPage,
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function RunPage() {
  const { runId } = Route.useParams();
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(["admin", "finance"]);
  const qc = useQueryClient();

  const { data: run } = useQuery({
    queryKey: ["payroll_run", runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_runs")
        .select("*")
        .eq("id", runId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: slips, isLoading } = useQuery({
    queryKey: ["payslips_for_run", runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payslips")
        .select("*, payroll_staff(full_name, employee_number)")
        .eq("run_id", runId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const generate = useMutation({
    mutationFn: async () => generatePayrollRun({ data: { runId } }),
    onSuccess: (r) => {
      toast.success(`Generated ${r.count} payslips`);
      qc.invalidateQueries({ queryKey: ["payslips_for_run", runId] });
      qc.invalidateQueries({ queryKey: ["payroll_run", runId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const finalize = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("payroll_runs")
        .update({ status: "finalized", finalized_at: new Date().toISOString() } as never)
        .eq("id", runId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Finalized");
      qc.invalidateQueries({ queryKey: ["payroll_run", runId] });
    },
  });

  const markPaid = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      await supabase
        .from("payslips")
        .update({ paid: true, paid_at: now } as never)
        .eq("run_id", runId);
      const { error } = await supabase
        .from("payroll_runs")
        .update({ status: "paid", paid_at: now } as never)
        .eq("id", runId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked paid");
      qc.invalidateQueries({ queryKey: ["payroll_run", runId] });
      qc.invalidateQueries({ queryKey: ["payslips_for_run", runId] });
    },
  });

  if (!run)
    return (
      <AppShell title="Payroll run">
        <Loader2 className="h-5 w-5 animate-spin" />
      </AppShell>
    );

  return (
    <AppShell title={`Payroll · ${MONTHS[run.period_month - 1]} ${run.period_year}`}>
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>
                {MONTHS[run.period_month - 1]} {run.period_year}
              </CardTitle>
              <CardDescription>
                <Badge
                  variant={
                    run.status === "paid"
                      ? "default"
                      : run.status === "finalized"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {run.status}
                </Badge>
                {run.finalized_at && (
                  <span className="ml-2 text-xs">Finalized {formatDate(run.finalized_at)}</span>
                )}
                {run.paid_at && (
                  <span className="ml-2 text-xs">Paid {formatDate(run.paid_at)}</span>
                )}
              </CardDescription>
            </div>
            {canManage && (
              <div className="flex gap-2">
                {run.status === "draft" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => generate.mutate()}
                      disabled={generate.isPending}
                    >
                      {generate.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Generate
                    </Button>
                    <Button
                      onClick={() => finalize.mutate()}
                      disabled={!slips || slips.length === 0 || finalize.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Finalize
                    </Button>
                  </>
                )}
                {run.status === "finalized" && (
                  <Button onClick={() => markPaid.mutate()} disabled={markPaid.isPending}>
                    <BadgeDollarSign className="h-4 w-4 mr-2" />
                    Mark all paid
                  </Button>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Gross</div>
              <div className="text-lg font-semibold">{formatCurrency(run.total_gross)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Deductions</div>
              <div className="text-lg font-semibold">{formatCurrency(run.total_deductions)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Net</div>
              <div className="text-lg font-semibold">{formatCurrency(run.total_net)}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payslips</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2">Employee</th>
                    <th>Base</th>
                    <th>Earnings</th>
                    <th>Deductions</th>
                    <th>Net</th>
                    <th>Paid</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {slips?.map((s) => {
                    const ps = (
                      s as {
                        payroll_staff: { full_name: string; employee_number: string | null } | null;
                      }
                    ).payroll_staff;
                    return (
                      <tr key={s.id} className="border-t">
                        <td className="py-2 font-medium">
                          {ps?.full_name ?? "—"}
                          <div className="text-xs text-muted-foreground">{ps?.employee_number}</div>
                        </td>
                        <td>{formatCurrency(s.base_salary)}</td>
                        <td>{formatCurrency(s.total_earnings)}</td>
                        <td>{formatCurrency(s.total_deductions)}</td>
                        <td className="font-semibold">{formatCurrency(s.net_pay)}</td>
                        <td>
                          {s.paid ? <Badge>Paid</Badge> : <Badge variant="outline">Pending</Badge>}
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
                  {(!slips || slips.length === 0) && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-muted-foreground">
                        No payslips. Click Generate.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
