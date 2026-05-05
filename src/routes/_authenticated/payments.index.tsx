import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { TableSkeleton } from "@/components/skeletons";
import { ConfirmDelete, DeleteImpactWarning } from "@/components/ConfirmDelete";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/payments/")({
  component: PaymentsPage,
});

function PaymentsPage() {
  const qc = useQueryClient();
  const { hasAnyRole } = useAuth();
  const canDelete = hasAnyRole(["admin"]);
  const payments = useQuery({
    queryKey: ["payments-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, paid_at, method, receipt_number, reference, bills(billing_year, lands(land_code))")
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment deleted");
      qc.invalidateQueries({ queryKey: ["payments-all"] });
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Payments">
      <Card>
        <CardHeader><CardTitle className="text-base">All payments</CardTitle></CardHeader>
        <CardContent>
          {payments.isLoading ? (
            <TableSkeleton columns={6} rows={6} />
          ) : (payments.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="pb-2">Receipt</th>
                  <th className="pb-2">Land</th>
                  <th className="pb-2">Year</th>
                  <th className="pb-2">Method</th>
                  <th className="pb-2">Date</th>
                  <th className="pb-2 text-right">Amount</th>
                  {canDelete && <th className="pb-2"></th>}
                </tr>
              </thead>
              <tbody>
                {(payments.data ?? []).map((p) => {
                  const bill = p.bills as unknown as { billing_year: number; lands: { land_code: string } } | null;
                  return (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 font-mono text-xs">
                        <Link to="/payments/$paymentId/receipt" params={{ paymentId: p.id }} className="text-primary hover:underline">
                          {p.receipt_number}
                        </Link>
                      </td>
                      <td className="py-2">{bill?.lands?.land_code ?? "—"}</td>
                      <td className="py-2">{bill?.billing_year ?? "—"}</td>
                      <td className="py-2"><Badge variant="secondary" className="uppercase">{p.method}</Badge></td>
                      <td className="py-2 text-muted-foreground">{formatDate(p.paid_at)}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(p.amount)}</td>
                      {canDelete && (
                        <td className="py-2 text-right">
                          <ConfirmDelete
                            onConfirm={() => remove.mutateAsync(p.id)}
                            pending={remove.isPending}
                            title={`Delete payment ${p.receipt_number}?`}
                            description={
                              <>
                                This permanently removes the payment record and cannot be undone.
                                <DeleteImpactWarning kind="payment" />
                              </>
                            }
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}