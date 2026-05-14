import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { Loader2, Printer, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/payroll/payslips/$payslipId")({
  component: PayslipPage,
});

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type Line = { name: string; amount: number; code: string | null };

function PayslipPage() {
  const { payslipId } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["payslip", payslipId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payslips")
        .select("*, payroll_staff(*), payroll_runs(period_year, period_month, status)")
        .eq("id", payslipId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading || !data)
    return (
      <AppShell title="Payslip">
        <Loader2 className="h-5 w-5 animate-spin" />
      </AppShell>
    );

  const staff = (
    data as {
      payroll_staff: {
        full_name: string;
        employee_number: string | null;
        job_title: string | null;
        ssnit_number: string | null;
        tin_number: string | null;
        bank_name: string | null;
        bank_account: string | null;
      } | null;
    }
  ).payroll_staff;
  const run = (data as { payroll_runs: { period_year: number; period_month: number } | null })
    .payroll_runs;
  const breakdown = (data.breakdown ?? {}) as { earnings?: Line[]; deductions?: Line[] };

  return (
    <AppShell title="Payslip">
      <div className="space-y-4 max-w-3xl mx-auto">
        <div className="flex justify-between print:hidden">
          <Link to="/payroll">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <Button onClick={() => window.print()} variant="outline" size="sm">
            <Printer className="h-4 w-4 mr-2" />
            Print / PDF
          </Button>
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-2xl">Payslip</CardTitle>
                <CardDescription>
                  {run ? `${MONTHS[run.period_month - 1]} ${run.period_year}` : "—"}
                </CardDescription>
              </div>
              <Badge variant={data.paid ? "default" : "outline"}>
                {data.paid ? `Paid ${formatDate(data.paid_at)}` : "Pending"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Employee</div>
                <div className="font-semibold">{staff?.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  {staff?.job_title} · {staff?.employee_number}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">SSNIT / TIN</div>
                <div>
                  {staff?.ssnit_number ?? "—"} / {staff?.tin_number ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {staff?.bank_name} {staff?.bank_account}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Earnings</h3>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b">
                      <td className="py-1">Basic salary</td>
                      <td className="text-right">{formatCurrency(data.base_salary)}</td>
                    </tr>
                    {breakdown.earnings?.map((l, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-1">{l.name}</td>
                        <td className="text-right">{formatCurrency(l.amount)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="pt-2 font-semibold">Gross</td>
                      <td className="text-right pt-2 font-semibold">
                        {formatCurrency(data.gross_pay)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Deductions</h3>
                <table className="w-full text-sm">
                  <tbody>
                    {breakdown.deductions?.map((l, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-1">{l.name}</td>
                        <td className="text-right">{formatCurrency(l.amount)}</td>
                      </tr>
                    ))}
                    {(!breakdown.deductions || breakdown.deductions.length === 0) && (
                      <tr>
                        <td className="text-muted-foreground py-1">None</td>
                        <td></td>
                      </tr>
                    )}
                    <tr>
                      <td className="pt-2 font-semibold">Total</td>
                      <td className="text-right pt-2 font-semibold">
                        {formatCurrency(data.total_deductions)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-muted/40 rounded-lg p-4 flex items-center justify-between">
              <span className="text-sm font-medium">Net pay</span>
              <span className="text-2xl font-bold">{formatCurrency(data.net_pay)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
