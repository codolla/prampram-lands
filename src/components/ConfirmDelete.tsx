import { type ReactNode, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Trash2, AlertTriangle } from "lucide-react";

type EntityKind = "land" | "landowner" | "bill" | "payment";

const IMPACTS: Record<EntityKind, { intro: string; items: string[] }> = {
  land: {
    intro: "Deleting this land parcel will affect the following:",
    items: [
      "Polygon coordinates and uploaded photos linked to this land",
      "Ownership history records for this parcel",
      "Blocked if any bills exist for this land — delete those first",
      "Map view, dashboard counts, and reports will update",
    ],
  },
  landowner: {
    intro: "Deleting this landowner will affect the following:",
    items: [
      "Blocked if they currently own one or more lands — reassign first",
      "Past ownership history entries referencing this person",
      "Uploaded ID/contract documents tied to the landowner",
      "SMS reminders can no longer be sent to this contact",
    ],
  },
  bill: {
    intro: "Deleting this bill will affect the following:",
    items: [
      "Blocked if any payments have been recorded against it — delete those first",
      "The bill will no longer appear in reports or overdue reminders",
      "Dashboard outstanding balances will recalculate",
    ],
  },
  payment: {
    intro: "Deleting this payment will affect the following:",
    items: [
      "The printed receipt will no longer be retrievable",
      "The related bill's paid amount and status (paid / partial) will recalculate",
      "Collection totals on dashboards and reports will decrease",
    ],
  },
};

export function DeleteImpactWarning({
  kind,
  note,
}: {
  kind: EntityKind;
  note?: ReactNode;
}) {
  const impact = IMPACTS[kind];
  return (
    <div className="mt-3 space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-left text-xs text-destructive">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4" />
        <span>{impact.intro}</span>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-destructive/90">
        {impact.items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      {note ? <p className="pt-1 text-destructive/90">{note}</p> : null}
    </div>
  );
}

interface ConfirmDeleteProps {
  onConfirm: () => void | Promise<void>;
  title?: string;
  description?: ReactNode;
  confirmLabel?: string;
  trigger?: ReactNode;
  disabled?: boolean;
  pending?: boolean;
}

export function ConfirmDelete({
  onConfirm,
  title = "Delete this item?",
  description = "This action cannot be undone.",
  confirmLabel = "Delete",
  trigger,
  disabled,
  pending,
}: ConfirmDeleteProps) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button
            size="icon"
            variant="ghost"
            disabled={disabled}
            aria-label="Delete"
            onClick={(e) => e.stopPropagation()}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={async (e) => {
              e.preventDefault();
              await onConfirm();
              setOpen(false);
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? "Deleting…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}