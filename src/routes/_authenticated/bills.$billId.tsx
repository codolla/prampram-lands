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
import logoUrl from "@/assets/logo.png";

export const Route = createFileRoute("/_authenticated/bills/$billId")({
  component: BillDetail,
});

function BillDetail() {
  const { billId } = Route.useParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const notifyPayment = useServerFn(sendPaymentNotification);

  const bill = useQuery({
    queryKey: ["bill", billId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select(
          "*, lands(id, land_code, plot_number, location_description, landowners(full_name, phone, email))",
        )
        .eq("id", billId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const payments = useQuery({
    queryKey: ["bill-payments", billId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, paid_at, method, reference, receipt_number")
        .eq("bill_id", billId)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const land = bill.data?.lands as unknown as {
    id: string;
    land_code: string;
    plot_number: string | null;
    location_description: string | null;
    landowners: { full_name: string; phone: string | null; email: string | null } | null;
  } | null;
  const totalPaid = (payments.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = Math.max(0, Number(bill.data?.amount ?? 0) - totalPaid);
  const isFullyPaid = outstanding <= 0 && Number(bill.data?.amount ?? 0) > 0;

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
      if (amt > outstanding + 0.005) {
        throw new Error(`Amount exceeds outstanding (${formatCurrency(outstanding)})`);
      }
      const { data: inserted, error } = await supabase
        .from("payments")
        .insert({
          bill_id: billId,
          amount: amt,
          paid_at: form.paid_at,
          method: form.method,
          reference: form.reference || null,
          recorded_by: user?.id,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (inserted?.id) {
        try {
          const r = await notifyPayment({ data: { paymentId: inserted.id } });
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
      toast.success("Payment recorded");
      setForm({ ...form, amount: "", reference: "" });
      setAmountTouched(false);
      qc.invalidateQueries({ queryKey: ["bill", billId] });
      qc.invalidateQueries({ queryKey: ["bill-payments", billId] });
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["recent-payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
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
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="mr-1 h-4 w-4" /> Print
              </Button>
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
                </div>
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
                    max={outstanding}
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => {
                      setAmountTouched(true);
                      setForm({ ...form, amount: e.target.value });
                    }}
                  />
                  {form.amount !== "" && Number(form.amount) > outstanding && (
                    <p className="text-xs text-destructive">Cannot exceed outstanding balance.</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={form.paid_at}
                    onChange={(e) => setForm({ ...form, paid_at: e.target.value })}
                  />
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
                    Number(form.amount) > outstanding
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
