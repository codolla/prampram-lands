import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { CONTACT_LINE } from "@/lib/contact";
import logoUrl from "@/assets/logo.png";
import { ReceiptSkeleton } from "@/components/skeletons";

export const Route = createFileRoute("/_authenticated/payments/$paymentId/receipt")({
  component: ReceiptPage,
});

function ReceiptPage() {
  const { paymentId } = Route.useParams();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["payment-receipt", paymentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, bills(billing_year, amount, lands(land_code, plot_number, location_description, landowners(full_name, phone)))")
        .eq("id", paymentId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-muted py-8">
        <div className="mx-auto max-w-2xl px-4">
          <ReceiptSkeleton />
        </div>
      </div>
    );
  }
  const bill = data.bills as unknown as {
    billing_year: number;
    amount: number;
    lands: { land_code: string; plot_number: string | null; location_description: string | null; landowners: { full_name: string; phone: string | null } | null };
  };

  const downloadPdf = async () => {
    if (!receiptRef.current) return;
    setDownloading(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
      const w = canvas.width * ratio;
      const h = canvas.height * ratio;
      pdf.addImage(imgData, "PNG", (pageWidth - w) / 2, 24, w, h);
      pdf.save(`receipt-${data.receipt_number}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted py-8 print:bg-white print:py-0">
      <div className="mx-auto max-w-2xl space-y-3 px-4 print:px-0">
        <div className="flex items-center justify-between print:hidden">
          <Button asChild variant="outline" size="sm">
            <Link to="/payments"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
          </Button>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="mr-1 h-4 w-4" /> Print
            </Button>
            <Button size="sm" onClick={downloadPdf} disabled={downloading}>
              <Download className="mr-1 h-4 w-4" />
              {downloading ? "Generating…" : "Download PDF"}
            </Button>
          </div>
        </div>
        <div ref={receiptRef} className="print-only rounded-md border border-border bg-card p-8 shadow-sm print:border-0 print:shadow-none">
          <div className="border-b pb-4 text-center">
            <img src={logoUrl} alt="" className="mx-auto mb-2 h-16 w-16 object-contain" />
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Prampram Customary Lands Secretariat</p>
            <h1 className="mt-1 text-2xl font-semibold">Official Payment Receipt</h1>
            <p className="mt-1 font-mono text-sm">No. {data.receipt_number}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 py-4 text-sm">
            <Row label="Received from" value={bill.lands.landowners?.full_name ?? "—"} />
            <Row label="Phone" value={bill.lands.landowners?.phone ?? "—"} />
            <Row label="Land" value={`${bill.lands.land_code} · Plot ${bill.lands.plot_number ?? "—"}`} />
            <Row label="Location" value={bill.lands.location_description ?? "—"} />
            <Row label="Billing year" value={String(bill.billing_year)} />
            <Row label="Method" value={data.method.toUpperCase()} />
            <Row label="Reference" value={data.reference ?? "—"} />
            <Row label="Date" value={formatDate(data.paid_at)} />
          </div>
          <div className="border-t pt-4">
            <div className="flex items-end justify-between">
              <span className="text-sm text-muted-foreground">Amount paid</span>
              <span className="text-2xl font-bold">{formatCurrency(data.amount)}</span>
            </div>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-8 text-xs">
            <div className="border-t pt-2 text-muted-foreground">Cashier signature</div>
            <div className="border-t pt-2 text-muted-foreground">Payer signature</div>
          </div>
          <p className="mt-6 border-t pt-3 text-center text-xs text-muted-foreground">
            {CONTACT_LINE}
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}