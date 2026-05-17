import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Printer } from "lucide-react";
import { toast } from "sonner";
import { BillStatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { CONTACT_LINE } from "@/lib/contact";
import { sendPaymentNotification } from "@/lib/sms.functions";
import { getUserFacingErrorMessage } from "@/lib/utils";
import logoUrl from "@/assets/logo.png";

export const Route = createFileRoute("/_authenticated/bills/$billId")({
  component: BillDetail,
});

type BillPaymentRow = {
  id: string;
  amount: number;
  paid_at: string;
  method: string;
  reference: string | null;
  receipt_number: string;
  kind: string | null;
};

function BillDetail() {
  const { billId } = Route.useParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const notifyPayment = useServerFn(sendPaymentNotification);
  const [supportsPaymentKinds, setSupportsPaymentKinds] = useState<boolean>(true);
  const [supportsAdvanceBalanceView, setSupportsAdvanceBalanceView] = useState<boolean>(true);

  const bill = useQuery({
    queryKey: ["bill", billId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select(
          "*, lands(id, land_code, plot_number, location_description, current_owner_id, landowners(id, full_name, phone, email))",
        )
        .eq("id", billId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const payments = useQuery<BillPaymentRow[]>({
    queryKey: ["bill-payments", billId],
    queryFn: async () => {
      const withKind: string = "id, amount, paid_at, method, reference, receipt_number, kind";
      const base: string = "id, amount, paid_at, method, reference, receipt_number";
      const r1 = await supabase
        .from("payments")
        .select(withKind)
        .eq("bill_id", billId)
        .order("paid_at", { ascending: false });
      if (!r1.error) {
        if (!supportsPaymentKinds) setSupportsPaymentKinds(true);
        return (r1.data ?? []) as unknown as BillPaymentRow[];
      }
      const msg = r1.error.message || "";
      if (!/column .*kind/i.test(msg)) throw r1.error;
      if (supportsPaymentKinds) setSupportsPaymentKinds(false);
      const r2 = await supabase
        .from("payments")
        .select(base)
        .eq("bill_id", billId)
        .order("paid_at", { ascending: false });
      if (r2.error) throw r2.error;
      return (r2.data ?? []).map((p) => ({
        ...(p as unknown as Record<string, unknown>),
        kind: null,
      })) as unknown as BillPaymentRow[];
    },
  });

  const land = bill.data?.lands as unknown as {
    id: string;
    land_code: string;
    plot_number: string | null;
    location_description: string | null;
    current_owner_id: string | null;
    landowners: {
      id: string;
      full_name: string;
      phone: string | null;
      email: string | null;
    } | null;
  } | null;
  const totalPaid = (payments.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = Math.max(0, Number(bill.data?.amount ?? 0) - totalPaid);
  const isFullyPaid = outstanding <= 0 && Number(bill.data?.amount ?? 0) > 0;
  const canPrint =
    (payments.data ?? []).length > 0 ||
    isFullyPaid ||
    bill.data?.status === "paid" ||
    bill.data?.status === "partial";

  const ownerId = land?.landowners?.id ?? land?.current_owner_id ?? null;
  const advance = useQuery<number>({
    queryKey: ["advance-balance", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landowner_advance_balances" as never)
        .select("balance")
        .filter("landowner_id", "eq", ownerId as string)
        .maybeSingle();
      if (error) {
        const msg = error.message || "";
        if (/landowner_advance_balances/i.test(msg) || /does not exist/i.test(msg)) {
          if (supportsAdvanceBalanceView) setSupportsAdvanceBalanceView(false);
          return 0;
        }
        throw error;
      }
      if (!supportsAdvanceBalanceView) setSupportsAdvanceBalanceView(true);
      return Number((data as unknown as { balance?: number | null } | null)?.balance ?? 0);
    },
  });

  const [form, setForm] = useState({
    amount: "",
    paid_at: new Date().toISOString().slice(0, 10),
    method: "cash" as "cash" | "momo" | "bank",
    reference: "",
  });

  // Prefill amount with outstanding once it's known and the user hasn't typed yet.
  const [amountTouched, setAmountTouched] = useState(false);
  useEffect(() => {
    if (!amountTouched && outstanding > 0 && form.amount === "") {
      setForm((f) => ({ ...f, amount: outstanding.toString() }));
    }
  }, [outstanding, amountTouched, form.amount]);

  const pay = useMutation({
    mutationFn: async () => {
      if (!form.amount) throw new Error("Amount required");
      const amt = Number(form.amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Enter a valid amount");
      if (!land?.id) throw new Error("Land record not available");

      const appliedToBill = Math.min(amt, outstanding);
      const credit = Math.max(0, amt - outstanding);

      const rows: Array<Record<string, unknown>> = [];

      if (appliedToBill > 0) {
        rows.push({
          bill_id: billId,
          kind: "bill",
          land_id: land.id,
          landowner_id: ownerId,
          amount: appliedToBill,
          paid_at: form.paid_at,
          method: form.method,
          reference: form.reference || null,
          recorded_by: user?.id,
        });
      }

      if (credit > 0) {
        if (!ownerId) {
          throw new Error("This land has no owner. Set an owner before saving advance.");
        }
        rows.push({
          bill_id: null,
          kind: "advance_deposit",
          land_id: land.id,
          landowner_id: ownerId,
          amount: credit,
          paid_at: form.paid_at,
          method: form.method,
          reference: form.reference || null,
          recorded_by: user?.id,
          notes: "Advance payment (credit)",
        });
      }

      if (rows.length === 0) throw new Error("Nothing to record");

      const selectInsertedClause: string = supportsPaymentKinds ? "id, kind" : "id";

      let insertedRows: Array<{ id: string; kind?: string | null }> = [];
      const r1 = await supabase
        .from("payments")
        .insert(rows as never)
        .select(selectInsertedClause);

      if (!r1.error) {
        insertedRows =
          (r1.data as unknown as Array<{ id: string; kind?: string | null }> | null) ?? [];
      } else {
        const msg = r1.error.message || "";
        const missingKindCol = /column .*kind/i.test(msg);
        const missingLandCol = /column .*land_id/i.test(msg);
        const missingOwnerCol = /column .*landowner_id/i.test(msg);
        const missingRecordedBy = /column .*recorded_by/i.test(msg);

        if (!(missingKindCol || missingLandCol || missingOwnerCol || missingRecordedBy)) {
          throw r1.error;
        }

        if (supportsPaymentKinds && missingKindCol) setSupportsPaymentKinds(false);

        const legacyPayload: Record<string, unknown> = {
          bill_id: billId,
          amount: appliedToBill,
          paid_at: form.paid_at,
          method: form.method,
          reference: form.reference || null,
          recorded_by: user?.id,
        };
        const r2 = await supabase
          .from("payments")
          .insert(legacyPayload as never)
          .select("id")
          .single();
        if (r2.error) {
          const msg2 = r2.error.message || "";
          if (/column .*recorded_by/i.test(msg2)) {
            const r3 = await supabase
              .from("payments")
              .insert({
                bill_id: billId,
                amount: appliedToBill,
                paid_at: form.paid_at,
                method: form.method,
                reference: form.reference || null,
              } as never)
              .select("id")
              .single();
            if (r3.error) throw r3.error;
            insertedRows = r3.data ? [{ id: (r3.data as { id: string }).id, kind: null }] : [];
          } else {
            throw r2.error;
          }
        } else {
          insertedRows = r2.data ? [{ id: (r2.data as { id: string }).id, kind: null }] : [];
        }
      }

      const billPaymentId =
        (insertedRows.find((r) => r.kind === "bill")?.id as string | undefined) ??
        (insertedRows.length === 1 ? insertedRows[0]?.id : undefined);
      if (billPaymentId) {
        try {
          const r = await notifyPayment({ data: { paymentId: billPaymentId } });
          if (!r.ok) {
            toast.warning("Payment recorded, but SMS not sent", {
              description: r.error ?? "SMS failed",
            });
          }
        } catch (e) {
          toast.warning("Payment recorded, but SMS not sent", {
            description: e instanceof Error ? e.message : "SMS failed",
          });
        }
      }
    },
    onSuccess: () => {
      const amt = Number(form.amount || 0);
      const appliedToBill = Math.min(amt, outstanding);
      const credit = Math.max(0, amt - outstanding);
      toast.success(
        credit > 0
          ? `Payment recorded · ${formatCurrency(appliedToBill)} applied, ${formatCurrency(credit)} saved as advance`
          : "Payment recorded",
      );
      setForm({ ...form, amount: "", reference: "" });
      setAmountTouched(false);
      qc.invalidateQueries({ queryKey: ["bill", billId] });
      qc.invalidateQueries({ queryKey: ["bill-payments", billId] });
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["recent-payments"] });
      qc.invalidateQueries({ queryKey: ["advance-balance"] });
      setTimeout(() => {
        window.location.reload();
      }, 200);
    },
    onError: (e: unknown) => toast.error(getUserFacingErrorMessage(e)),
  });

  const applyAdvance = useMutation({
    mutationFn: async () => {
      if (!ownerId) throw new Error("No landowner found for this land");
      const bal = advance.data ?? 0;
      if (bal <= 0) throw new Error("No advance balance available");
      if (outstanding <= 0) throw new Error("This bill has no outstanding amount");
      const useAmt = Math.min(outstanding, bal);
      const { error } = await supabase.from("payments").insert({
        bill_id: billId,
        kind: "advance_apply",
        land_id: land?.id ?? null,
        landowner_id: ownerId,
        amount: useAmt,
        paid_at: new Date().toISOString().slice(0, 10),
        method: "cash",
        reference: "Advance balance",
        recorded_by: user?.id,
        notes: "Applied from advance balance",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Advance applied to this bill");
      qc.invalidateQueries({ queryKey: ["bill", billId] });
      qc.invalidateQueries({ queryKey: ["bill-payments", billId] });
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["recent-payments"] });
      qc.invalidateQueries({ queryKey: ["advance-balance"] });
    },
    onError: (e: unknown) => toast.error(getUserFacingErrorMessage(e)),
  });

  return (
    <AppShell
      title={`Bill ${bill.data?.billing_year ?? ""}`}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/bills">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Invoice</span>
              {canPrint ? (
                <Button size="sm" variant="outline" onClick={() => window.print()}>
                  <Printer className="mr-1 h-4 w-4" /> Print
                </Button>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 print:p-8">
            <div className="print-only rounded-md border border-border p-4">
              <div className="flex items-center gap-3">
                <img src={logoUrl} alt="" className="h-12 w-12 object-contain" />
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Prampram Customary Lands Secretariat
                  </p>
                  <h2 className="mt-0.5 text-xl font-semibold">Ground Rent Invoice</h2>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Land</p>
                  <p className="font-medium">
                    {land?.land_code} · Plot {land?.plot_number ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {land?.location_description ?? ""}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Owner</p>
                  <p className="font-medium">{land?.landowners?.full_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{land?.landowners?.phone ?? ""}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Billing year</p>
                  <p className="font-medium">{bill.data?.billing_year}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Due date</p>
                  <p className="font-medium">{formatDate(bill.data?.due_date)}</p>
                </div>
              </div>
              <table className="mt-4 w-full text-sm">
                <tbody>
                  <tr className="border-t">
                    <td className="py-2">Annual ground rent</td>
                    <td className="py-2 text-right">{formatCurrency(bill.data?.amount ?? 0)}</td>
                  </tr>
                  <tr className="border-t">
                    <td className="py-2 text-muted-foreground">Paid to date</td>
                    <td className="py-2 text-right text-muted-foreground">
                      {formatCurrency(totalPaid)}
                    </td>
                  </tr>
                  <tr className="border-t font-semibold">
                    <td className="py-2">Outstanding</td>
                    <td className="py-2 text-right">{formatCurrency(outstanding)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-3">
                {bill.data && <BillStatusBadge status={bill.data.status} />}
              </div>
              <p className="mt-4 border-t pt-3 text-center text-xs text-muted-foreground">
                {CONTACT_LINE}
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Payments on this bill</CardTitle>
              </CardHeader>
              <CardContent>
                {(payments.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments yet.</p>
                ) : (
                  <ul className="divide-y">
                    {(payments.data ?? []).map((p) => (
                      <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                        <div>
                          <Link
                            to="/payments/$paymentId/receipt"
                            params={{ paymentId: p.id }}
                            className="font-mono text-xs text-primary hover:underline"
                          >
                            {p.receipt_number}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(p.paid_at)} · {p.method.toUpperCase()}
                            {p.reference ? ` · ${p.reference}` : ""}
                          </p>
                        </div>
                        <span className="font-medium">{formatCurrency(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isFullyPaid ? (
              <p className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
                This bill is fully paid. No further payments can be recorded.
              </p>
            ) : (
              <>
                <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Outstanding</span>
                    <span className="font-semibold">{formatCurrency(outstanding)}</span>
                  </div>
                  {!!ownerId && (
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-muted-foreground">Advance balance</span>
                      <span className="font-semibold">
                        {advance.isLoading ? "…" : formatCurrency(advance.data ?? 0)}
                      </span>
                    </div>
                  )}
                </div>
                {!!ownerId && (advance.data ?? 0) > 0 && outstanding > 0 && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => applyAdvance.mutate()}
                    disabled={applyAdvance.isPending || advance.isLoading}
                  >
                    {applyAdvance.isPending ? "Applying…" : "Use advance to pay this bill"}
                  </Button>
                )}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label>Amount (GHS)</Label>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => {
                        setAmountTouched(true);
                        setForm({ ...form, amount: outstanding.toString() });
                      }}
                    >
                      Pay full outstanding
                    </button>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => {
                      setAmountTouched(true);
                      setForm({ ...form, amount: e.target.value });
                    }}
                  />
                  {form.amount !== "" && Number(form.amount) > outstanding && outstanding > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Extra {formatCurrency(Math.max(0, Number(form.amount) - outstanding))} will be
                      saved as advance credit.
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Payment date</Label>
                  <Input
                    type="date"
                    value={form.paid_at}
                    onChange={(e) => setForm({ ...form, paid_at: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    You can backdate payments for past years.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Method</Label>
                  <Select
                    value={form.method}
                    onValueChange={(v) => setForm({ ...form, method: v as typeof form.method })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="momo">Mobile Money</SelectItem>
                      <SelectItem value="bank">Bank</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Reference</Label>
                  <Input
                    value={form.reference}
                    onChange={(e) => setForm({ ...form, reference: e.target.value })}
                    placeholder="Transaction ID, slip no., etc."
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => pay.mutate()}
                  disabled={
                    pay.isPending ||
                    !form.amount ||
                    Number(form.amount) <= 0 ||
                    !Number.isFinite(Number(form.amount))
                  }
                >
                  {pay.isPending ? "Recording…" : "Record payment"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
