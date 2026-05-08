import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { TableSkeleton } from "@/components/skeletons";
import { ConfirmDelete, DeleteImpactWarning } from "@/components/ConfirmDelete";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/payments/")({
  component: PaymentsPage,
});

const PAGE_SIZE = 25;

type PaymentRow = {
  id: string;
  amount: number;
  paid_at: string;
  method: string;
  receipt_number: string;
  reference: string | null;
  kind: string | null;
  bills: { billing_year: number; lands: { land_code: string } } | null;
  lands: { land_code: string } | null;
};

function PaymentsPage() {
  const qc = useQueryClient();
  const { hasAnyRole } = useAuth();
  const canSeePayments = hasAnyRole(["admin", "manager"]);
  const canDelete = hasAnyRole(["admin"]);
  const [page, setPage] = useState(1);
  const payments = useQuery<{ rows: PaymentRow[]; count: number }>({
    queryKey: ["payments-all", page],
    enabled: canSeePayments,
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const selectClause: string =
        "id, amount, paid_at, method, receipt_number, reference, kind, bills(billing_year, lands(land_code)), lands:land_id(land_code)";
      const ranged = await supabase
        .from("payments")
        .select(selectClause, { count: "exact" })
        .order("paid_at", { ascending: false })
        .range(from, to);
      if (ranged.error) throw ranged.error;
      return {
        rows: (ranged.data ?? []) as unknown as PaymentRow[],
        count: ranged.count ?? 0,
      };
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

  if (!canSeePayments) {
    return (
      <AppShell title="Payments">
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Access restricted.
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Payments">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All payments</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.isLoading ? (
            <TableSkeleton columns={6} rows={6} />
          ) : (payments.data?.rows ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded.</p>
          ) : (
            <>
              <div className="grid gap-2 md:hidden">
                {(payments.data?.rows ?? []).map((p) => {
                  const bill = p.bills;
                  const landCode = bill?.lands?.land_code ?? p.lands?.land_code ?? "—";
                  const yearLabel =
                    bill?.billing_year ?? (p.kind === "advance_deposit" ? "Advance" : "—");
                  const methodLabel = p.kind === "advance_apply" ? "advance" : p.method;
                  return (
                    <div key={p.id} className="rounded-md border border-border bg-background p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to="/payments/$paymentId/receipt"
                            params={{ paymentId: p.id }}
                            className="block truncate font-mono text-xs text-primary hover:underline"
                          >
                            {p.receipt_number}
                          </Link>
                          <div className="mt-1 text-sm font-medium">{landCode}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {formatDate(p.paid_at)} · {yearLabel}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold">{formatCurrency(p.amount)}</div>
                          <Badge variant="secondary" className="mt-1 uppercase">
                            {methodLabel}
                          </Badge>
                        </div>
                      </div>
                      {canDelete ? (
                        <div className="mt-2 flex justify-end">
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
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto md:block">
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
                    {(payments.data?.rows ?? []).map((p) => {
                      const bill = p.bills;
                      const landCode = bill?.lands?.land_code ?? p.lands?.land_code ?? "—";
                      const yearLabel =
                        bill?.billing_year ?? (p.kind === "advance_deposit" ? "Advance" : "—");
                      const methodLabel = p.kind === "advance_apply" ? "advance" : p.method;
                      return (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="py-2 font-mono text-xs">
                            <Link
                              to="/payments/$paymentId/receipt"
                              params={{ paymentId: p.id }}
                              className="text-primary hover:underline"
                            >
                              {p.receipt_number}
                            </Link>
                          </td>
                          <td className="py-2">{landCode}</td>
                          <td className="py-2">{yearLabel}</td>
                          <td className="py-2">
                            <Badge variant="secondary" className="uppercase">
                              {methodLabel}
                            </Badge>
                          </td>
                          <td className="py-2 text-muted-foreground">{formatDate(p.paid_at)}</td>
                          <td className="py-2 text-right font-medium">
                            {formatCurrency(p.amount)}
                          </td>
                          {canDelete && (
                            <td className="py-2 text-right">
                              <ConfirmDelete
                                onConfirm={() => remove.mutateAsync(p.id)}
                                pending={remove.isPending}
                                title={`Delete payment ${p.receipt_number}?`}
                                description={
                                  <>
                                    This permanently removes the payment record and cannot be
                                    undone.
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
              </div>
            </>
          )}
          {(() => {
            const total = payments.data?.count ?? 0;
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
        </CardContent>
      </Card>
    </AppShell>
  );
}
