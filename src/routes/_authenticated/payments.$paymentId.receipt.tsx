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
import { useAuth } from "@/lib/auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/payments/$paymentId/receipt")({
  component: ReceiptPage,
});

type PrintFormat = "thermal" | "a4";

function ReceiptPage() {
  const { paymentId } = Route.useParams();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const { hasAnyRole } = useAuth();
  const defaultFormat: PrintFormat = hasAnyRole(["admin", "manager"]) ? "a4" : "thermal";
  const [printFormat, setPrintFormat] = useState<PrintFormat>(defaultFormat);
  const { data, isLoading } = useQuery({
    queryKey: ["payment-receipt", paymentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(
          "*, bills(billing_year, amount, lands(land_code, plot_number, location_description, landowners(full_name, phone)))",
        )
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
    lands: {
      land_code: string;
      plot_number: string | null;
      location_description: string | null;
      landowners: { full_name: string; phone: string | null } | null;
    };
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

  const pageStyle =
    printFormat === "a4"
      ? `
@media print {
  @page { size: A4; margin: 0; }
  html, body { height: auto !important; }
  body { margin: 0 !important; background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #receipt-page { min-height: auto !important; padding: 0 !important; background: #fff !important; }
  #receipt-shell { width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
  #receipt { border: 0 !important; box-shadow: none !important; border-radius: 0 !important; padding: 12mm !important; }
}
`
      : `
@media print {
  @page { size: 80mm 200mm; margin: 0; }
  html, body { height: auto !important; }
  body { margin: 0 !important; background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #receipt-page { min-height: auto !important; padding: 0 !important; background: #fff !important; }
  #receipt-shell { width: 80mm !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
  #receipt { border: 0 !important; box-shadow: none !important; border-radius: 0 !important; padding: 3mm !important; }
}
`;

  return (
    <div id="receipt-page" className="min-h-screen bg-muted py-8 print:bg-white print:py-0">
      <style>{pageStyle}</style>
      <div
        id="receipt-shell"
        className={[
          "mx-auto space-y-3 px-4 print:px-0",
          printFormat === "a4" ? "max-w-2xl print:max-w-none print:w-full" : "max-w-[90mm]",
        ].join(" ")}
      >
        <div className="flex items-center justify-between print:hidden">
          <Button asChild variant="outline" size="sm">
            <Link to="/payments">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Select value={printFormat} onValueChange={(v) => setPrintFormat(v as PrintFormat)}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Paper size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="thermal">Thermal (80mm)</SelectItem>
                <SelectItem value="a4">A4</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="mr-1 h-4 w-4" /> Print
            </Button>
            <Button size="sm" onClick={downloadPdf} disabled={downloading}>
              <Download className="mr-1 h-4 w-4" />
              {downloading ? "Generating…" : "Download PDF"}
            </Button>
          </div>
        </div>
        <div
          id="receipt"
          ref={receiptRef}
          className={[
            "print-only rounded-md border border-border bg-card shadow-sm print:border-0 print:shadow-none",
            printFormat === "a4" ? "p-8" : "p-3",
          ].join(" ")}
        >
          <div className="border-b pb-4 text-center">
            <img
              src={logoUrl}
              alt=""
              className={[
                "mx-auto mb-2 object-contain",
                printFormat === "a4" ? "h-16 w-16" : "h-10 w-10",
              ].join(" ")}
            />
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Prampram Customary Lands Secretariat
            </p>
            <h1
              className={
                printFormat === "a4" ? "mt-1 text-2xl font-semibold" : "mt-1 text-lg font-semibold"
              }
            >
              Official Payment Receipt
            </h1>
            <p
              className={printFormat === "a4" ? "mt-1 font-mono text-sm" : "mt-1 font-mono text-xs"}
            >
              No. {data.receipt_number}
            </p>
          </div>
          <div
            className={[
              "grid gap-4 py-4 text-sm",
              printFormat === "a4" ? "grid-cols-2" : "grid-cols-1",
            ].join(" ")}
          >
            <Row label="Received from" value={bill.lands.landowners?.full_name ?? "—"} />
            <Row label="Phone" value={bill.lands.landowners?.phone ?? "—"} />
            <Row
              label="Land"
              value={`${bill.lands.land_code} · Plot ${bill.lands.plot_number ?? "—"}`}
            />
            <Row label="Location" value={bill.lands.location_description ?? "—"} />
            <Row label="Billing year" value={String(bill.billing_year)} />
            <Row label="Method" value={data.method.toUpperCase()} />
            <Row label="Reference" value={data.reference ?? "—"} />
            <Row label="Date" value={formatDate(data.paid_at)} />
          </div>
          <div className="border-t pt-4">
            <div className="flex items-end justify-between">
              <span className="text-sm text-muted-foreground">Amount paid</span>
              <span className={printFormat === "a4" ? "text-2xl font-bold" : "text-xl font-bold"}>
                {formatCurrency(data.amount)}
              </span>
            </div>
          </div>
          {printFormat === "a4" && (
            <div className="mt-12 grid grid-cols-2 gap-8 text-xs">
              <div className="border-t pt-2 text-muted-foreground">Cashier signature</div>
              <div className="border-t pt-2 text-muted-foreground">Payer signature</div>
            </div>
          )}
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
