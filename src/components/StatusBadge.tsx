import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const LAND_TONE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  disputed: "bg-red-100 text-red-800 border-red-200",
  leased: "bg-amber-100 text-amber-800 border-amber-200",
};

const BILL_TONE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-800 border-slate-200",
  partial: "bg-amber-100 text-amber-800 border-amber-200",
  paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
  overdue: "bg-red-100 text-red-800 border-red-200",
};

export function LandStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("capitalize", LAND_TONE[status])}>
      {status}
    </Badge>
  );
}

export function BillStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("capitalize", BILL_TONE[status])}>
      {status}
    </Badge>
  );
}