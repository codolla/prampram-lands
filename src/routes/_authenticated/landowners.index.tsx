import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TableSkeleton } from "@/components/skeletons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Landmark, Plus, Search, Upload, User } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ConfirmDelete, DeleteImpactWarning } from "@/components/ConfirmDelete";
import { useAuth } from "@/lib/auth";
import { getUserFacingErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/landowners/")({
  component: LandownersPage,
});

const PAGE_SIZE = 25;

function LandownersPage() {
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const { hasAnyRole } = useAuth();
  const canDelete = hasAnyRole(["admin"]);
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["landowners", search, page],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("landowners")
        .select("id, full_name, phone, email, address, national_id, avatar_url, created_at", {
          count: "exact",
        })
        .order("full_name");
      if (search) q = q.ilike("full_name", `%${search}%`);
      const { data, count, error } = await q.range(from, to);
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    address: "",
    national_id: "",
    notes: "",
    avatar_url: "" as string | null | "",
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim()) throw new Error("Full name is required");
      const payload = {
        full_name: form.full_name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        national_id: form.national_id || null,
        notes: form.notes || null,
        avatar_url: form.avatar_url || null,
      };
      const { data, error } = await supabase
        .from("landowners")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      if (!data?.id) throw new Error("Failed to create landowner");
      return data as { id: string };
    },
    onSuccess: (row) => {
      toast.success("Landowner created");
      setOpen(false);
      setForm({
        full_name: "",
        phone: "",
        email: "",
        address: "",
        national_id: "",
        notes: "",
        avatar_url: "",
      });
      qc.invalidateQueries({ queryKey: ["landowners"] });
      navigate({
        to: "/lands",
        search: { register: true, ownerId: row.id },
      });
    },
    onError: (e: unknown) => toast.error(getUserFacingErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("landowners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Landowner deleted");
      qc.invalidateQueries({ queryKey: ["landowners"] });
    },
    onError: (e: unknown) => toast.error(getUserFacingErrorMessage(e)),
  });

  return (
    <AppShell
      title="Landowners"
      actions={
        <div className="flex items-center gap-2">
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Upload className="mr-1 h-4 w-4" /> Bulk import
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Bulk import landowners</DialogTitle>
                <DialogDescription>
                  Upload a CSV or Excel file with headers: full_name, phone, email, address,
                  national_id, notes
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => downloadCsvTemplate("landowners-import-template.csv")}
                  >
                    Download CSV example
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void downloadExcelTemplate("landowners-import-template.xlsx")}
                  >
                    Download Excel example
                  </Button>
                </div>
                <div className="space-y-1">
                  <Label>File</Label>
                  <Input
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setImportOpen(false);
                    setImportFile(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  disabled={!importFile || importing}
                  onClick={async () => {
                    if (!importFile) return;
                    setImporting(true);
                    try {
                      const parsed = await parseLandownersImportFile(importFile);
                      if (parsed.length === 0) throw new Error("No rows found in file");

                      const normalized = dedupeLandownerRows(parsed);
                      const existing = await findExistingLandowners(normalized);
                      const toInsert = normalized.filter((r) => {
                        const p = phoneKey(r.phone);
                        const e = emailKey(r.email);
                        const n = nationalIdKey(r.national_id);
                        if (p && existing.phones.has(p)) return false;
                        if (e && existing.emails.has(e)) return false;
                        if (n && existing.nationalIds.has(n)) return false;
                        return true;
                      });
                      const skipped = normalized.length - toInsert.length;

                      let created = 0;
                      for (const batch of chunk(toInsert, 200)) {
                        const { error } = await supabase.from("landowners").insert(batch);
                        if (error) throw error;
                        created += batch.length;
                      }

                      toast.success(`Imported ${created} landowner(s) · skipped ${skipped}`);
                      setImportOpen(false);
                      setImportFile(null);
                      qc.invalidateQueries({ queryKey: ["landowners"] });
                    } catch (e: unknown) {
                      toast.error(getUserFacingErrorMessage(e));
                    } finally {
                      setImporting(false);
                    }
                  }}
                >
                  {importing ? "Importing…" : "Import"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" /> New landowner
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New landowner</DialogTitle>
                <DialogDescription>
                  Add a person or entity that owns one or more parcels.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <AvatarUpload
                  value={form.avatar_url || null}
                  onChange={(url) => setForm({ ...form, avatar_url: url ?? "" })}
                  folder="landowners"
                  fallback={form.full_name || "L"}
                />
                <Field
                  label="Full name *"
                  value={form.full_name}
                  onChange={(v) => setForm({ ...form, full_name: v })}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Phone"
                    value={form.phone}
                    onChange={(v) => setForm({ ...form, phone: v })}
                  />
                  <Field
                    label="Email"
                    type="email"
                    value={form.email}
                    onChange={(v) => setForm({ ...form, email: v })}
                  />
                </div>
                <Field
                  label="Address"
                  value={form.address}
                  onChange={(v) => setForm({ ...form, address: v })}
                />
                <Field
                  label="National ID"
                  value={form.national_id}
                  onChange={(v) => setForm({ ...form, national_id: v })}
                />
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending ? "Saving…" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All landowners</CardTitle>
          <div className="relative mt-2 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton columns={6} rows={6} />
          ) : (data?.rows ?? []).length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="pb-2">Name</th>
                    <th className="pb-2">Phone</th>
                    <th className="pb-2">Email</th>
                    <th className="pb-2">National ID</th>
                    <th className="pb-2">Added</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.rows ?? []).map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        <Link
                          to="/landowners/$ownerId"
                          params={{ ownerId: o.id }}
                          className="flex items-center gap-2 text-primary hover:underline"
                        >
                          <Avatar className="h-7 w-7">
                            {o.avatar_url ? (
                              <AvatarImage src={o.avatar_url} alt={o.full_name} />
                            ) : null}
                            <AvatarFallback>{o.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          {o.full_name}
                        </Link>
                      </td>
                      <td className="py-2">{o.phone || "—"}</td>
                      <td className="py-2">{o.email || "—"}</td>
                      <td className="py-2">{o.national_id || "—"}</td>
                      <td className="py-2 text-muted-foreground">{formatDate(o.created_at)}</td>
                      <td className="py-2 text-right">
                        <Button asChild size="sm" variant="outline" className="mr-2">
                          <Link to="/lands" search={{ register: true, ownerId: o.id }}>
                            <Landmark className="mr-1 h-4 w-4" />
                            Register
                          </Link>
                        </Button>
                        {canDelete && (
                          <ConfirmDelete
                            onConfirm={() => remove.mutateAsync(o.id)}
                            pending={remove.isPending}
                            title={`Delete ${o.full_name}?`}
                            description={
                              <>
                                This permanently removes the landowner record and cannot be undone.
                                <DeleteImpactWarning kind="landowner" />
                              </>
                            }
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(() => {
            const total = data?.count ?? 0;
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

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} type={type} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <User className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">No landowners yet.</p>
    </div>
  );
}

type LandownerImportRow = {
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  national_id: string | null;
  notes: string | null;
};

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}

function downloadCsvTemplate(filename: string) {
  const rows: (string | number)[][] = [
    ["full_name", "phone", "email", "address", "national_id", "notes"],
    ["John Doe", "0244000000", "john@example.com", "Tema", "GHA-12345", ""],
  ];
  const csv = toCsv(rows);
  downloadBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

async function downloadExcelTemplate(filename: string) {
  const XLSX = await import("xlsx");
  const rows: (string | number)[][] = [
    ["full_name", "phone", "email", "address", "national_id", "notes"],
    ["John Doe", "0244000000", "john@example.com", "Tema", "GHA-12345", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Landowners");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  downloadBlob(
    filename,
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizeHeaderKey(raw: unknown): string {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  if (s === "fullname") return "full_name";
  if (s === "name") return "full_name";
  if (s === "nationalid") return "national_id";
  if (s === "national_idnumber") return "national_id";
  if (s === "phonenumber") return "phone";
  return s;
}

function normalizeOptAny(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function ensureHeadersPresent(keys: string[]) {
  if (!keys.includes("full_name")) throw new Error("File must include full_name header");
}

async function parseLandownersImportFile(file: File): Promise<LandownerImportRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    const text = await file.text();
    return parseLandownersCsv(text);
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: "array" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return [];
    const sheet = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (rawRows.length === 0) return [];

    const normalizedRows: LandownerImportRow[] = [];
    for (const row of rawRows) {
      const mapped: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        mapped[normalizeHeaderKey(k)] = v;
      }
      const fullName = String(mapped.full_name ?? "").trim();
      if (!fullName) continue;
      normalizedRows.push({
        full_name: fullName,
        phone: normalizeOptAny(mapped.phone),
        email: normalizeOptAny(mapped.email),
        address: normalizeOptAny(mapped.address),
        national_id: normalizeOptAny(mapped.national_id),
        notes: normalizeOptAny(mapped.notes),
      });
    }

    const keys = Object.keys(
      Object.fromEntries(Object.keys(rawRows[0] ?? {}).map((k) => [normalizeHeaderKey(k), true])),
    );
    ensureHeadersPresent(keys);
    return normalizedRows;
  }
  throw new Error("Unsupported file type. Upload CSV or Excel (.xlsx).");
}

function parseLandownersCsv(text: string): LandownerImportRow[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => (h ?? "").trim().toLowerCase());
  const idx = (key: string) => header.findIndex((h) => h === key);

  const mapIndex = {
    full_name: idx("full_name"),
    phone: idx("phone"),
    email: idx("email"),
    address: idx("address"),
    national_id: idx("national_id"),
    notes: idx("notes"),
  };

  if (mapIndex.full_name < 0) throw new Error("CSV must include full_name header");

  const out: LandownerImportRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const fullName = (r[mapIndex.full_name] ?? "").trim();
    if (!fullName) continue;
    out.push({
      full_name: fullName,
      phone: normalizeOpt(r[mapIndex.phone]),
      email: normalizeOpt(r[mapIndex.email]),
      address: normalizeOpt(r[mapIndex.address]),
      national_id: normalizeOpt(r[mapIndex.national_id]),
      notes: normalizeOpt(r[mapIndex.notes]),
    });
  }
  return out;
}

function normalizeOpt(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}

function phoneKey(phone: string | null): string {
  return (phone ?? "").replace(/\s+/g, "").toLowerCase();
}

function emailKey(email: string | null): string {
  return (email ?? "").replace(/\s+/g, "").toLowerCase();
}

function nationalIdKey(nationalId: string | null): string {
  return (nationalId ?? "").replace(/\s+/g, "").toLowerCase();
}

function nameKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

function dedupeKey(r: LandownerImportRow): string {
  const p = phoneKey(r.phone);
  const e = emailKey(r.email);
  const n = nationalIdKey(r.national_id);
  if (p) return `phone:${p}`;
  if (e) return `email:${e}`;
  if (n) return `national_id:${n}`;
  return `name:${nameKey(r.full_name)}`;
}

function dedupeLandownerRows(rows: LandownerImportRow[]): LandownerImportRow[] {
  const seen = new Set<string>();
  const out: LandownerImportRow[] = [];
  for (const r of rows) {
    const k = dedupeKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

async function findExistingLandowners(rows: LandownerImportRow[]): Promise<{
  phones: Set<string>;
  emails: Set<string>;
  nationalIds: Set<string>;
}> {
  const phones = rows.map((r) => r.phone).filter(Boolean) as string[];
  const emails = rows.map((r) => r.email).filter(Boolean) as string[];
  const nationalIds = rows.map((r) => r.national_id).filter(Boolean) as string[];

  const existing = {
    phones: new Set<string>(),
    emails: new Set<string>(),
    nationalIds: new Set<string>(),
  };

  for (const batch of chunk(phones, 150)) {
    const { data, error } = await supabase.from("landowners").select("phone").in("phone", batch);
    if (error) throw error;
    for (const o of data ?? []) existing.phones.add(phoneKey(o.phone ?? null));
  }

  for (const batch of chunk(emails, 150)) {
    const { data, error } = await supabase.from("landowners").select("email").in("email", batch);
    if (error) throw error;
    for (const o of data ?? []) existing.emails.add(emailKey(o.email ?? null));
  }

  for (const batch of chunk(nationalIds, 150)) {
    const { data, error } = await supabase
      .from("landowners")
      .select("national_id")
      .in("national_id", batch);
    if (error) throw error;
    for (const o of data ?? []) existing.nationalIds.add(nationalIdKey(o.national_id ?? null));
  }

  return existing;
}

function parseCsvRows(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };

  const pushRow = () => {
    const allEmpty = row.every((c) => (c ?? "").trim() === "");
    if (!allEmpty) out.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === ",") {
      pushCell();
      i += 1;
      continue;
    }

    if (ch === "\n") {
      pushCell();
      pushRow();
      i += 1;
      continue;
    }

    if (ch === "\r") {
      i += 1;
      continue;
    }

    cell += ch;
    i += 1;
  }

  pushCell();
  pushRow();
  return out;
}
