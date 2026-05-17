import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Landmark, Plus, Search, Trash2, Upload, User } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ConfirmDelete, DeleteImpactWarning } from "@/components/ConfirmDelete";
import { useAuth } from "@/lib/auth";
import { getUserFacingErrorMessage } from "@/lib/utils";
import { looksLikePhone, normalisePhone } from "@/lib/phone-auth";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/landowners/")({
  validateSearch: (search: Record<string, unknown>) => {
    const q = typeof search.q === "string" ? search.q : "";
    const modeRaw = typeof search.mode === "string" ? search.mode : "";
    const mode =
      modeRaw === "linked" || modeRaw === "unlinked" || modeRaw === "all" ? modeRaw : "unlinked";
    const pageRaw = typeof search.page === "string" ? Number(search.page) : search.page;
    const page = Number.isFinite(pageRaw) && Number(pageRaw) > 0 ? Math.floor(Number(pageRaw)) : 1;
    const pageSizeRaw =
      typeof search.pageSize === "string" ? Number(search.pageSize) : search.pageSize;
    const size = Number.isFinite(pageSizeRaw) ? Math.floor(Number(pageSizeRaw)) : PAGE_SIZE;
    const pageSize = size === 10 || size === 25 || size === 50 || size === 100 ? size : PAGE_SIZE;
    return { q, mode, page, pageSize };
  },
  component: LandownersPage,
});

const PAGE_SIZE = 25;

const ID_TYPE_LABEL: Record<string, string> = {
  ghana_card: "Ghana Card",
  nhis: "Health insurance",
  drivers_license: "Driver’s license",
  passport: "Passport",
};

function formatIdentity(type: string | null, number: string | null): string {
  if (!number) return "—";
  const label = type ? (ID_TYPE_LABEL[type] ?? type) : "ID";
  return `${label}: ${number}`;
}

type LandownerListRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  identity_type: string | null;
  identity_number: string | null;
  avatar_url: string | null;
  created_at: string;
  has_land: boolean;
  total_count: number;
};

type LandownersSearch = {
  q: string;
  mode: "unlinked" | "linked" | "all";
  page: number;
  pageSize: number;
};

function normalizeLandownersSearch(
  prev: unknown,
  patch: Partial<LandownersSearch>,
): LandownersSearch {
  const p = (prev ?? {}) as Partial<LandownersSearch>;
  const mode: LandownersSearch["mode"] =
    p.mode === "linked" || p.mode === "all" || p.mode === "unlinked" ? p.mode : "unlinked";

  return {
    q: typeof p.q === "string" ? p.q : "",
    mode,
    page: Number.isFinite(Number(p.page)) && Number(p.page) > 0 ? Number(p.page) : 1,
    pageSize:
      Number.isFinite(Number(p.pageSize)) && Number(p.pageSize) > 0
        ? Number(p.pageSize)
        : PAGE_SIZE,
    ...patch,
  };
}

function LandownersPage() {
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const routeSearch = Route.useSearch() as unknown as LandownersSearch;
  const search = routeSearch.q ?? "";
  const filterMode = routeSearch.mode ?? "unlinked";
  const page = routeSearch.page ?? 1;
  const pageSize = routeSearch.pageSize ?? PAGE_SIZE;
  const { hasAnyRole } = useAuth();
  const canRowDelete = hasAnyRole(["admin", "developer"]);
  const canBulkDelete = hasAnyRole(["developer"]);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const stats = useQuery({
    queryKey: ["landowners-stats", search],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "landowners_search_stats" as never,
        { search_text: search } as never,
      );
      if (error) throw error;
      const row = (data as unknown as Array<Record<string, unknown>> | null)?.[0] ?? {};
      return {
        linkedCount: Number(row.linked_count ?? 0),
        unlinkedCount: Number(row.unlinked_count ?? 0),
        totalCount: Number(row.total_count ?? 0),
      };
    },
  });

  const landowners = useQuery<{ rows: LandownerListRow[]; count: number }>({
    queryKey: ["landowners", search, filterMode, page, pageSize],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "landowners_search" as never,
        {
          search_text: search,
          filter_mode: filterMode,
          page_number: page,
          page_size: pageSize,
        } as never,
      );
      if (error) throw error;
      const rows = (data ?? []) as unknown as LandownerListRow[];
      const count = Number(rows[0]?.total_count ?? 0);
      return { rows, count };
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    address: "",
    identity_type: "" as "" | "ghana_card" | "nhis" | "drivers_license" | "passport",
    identity_number: "",
    staff_id: "",
    notes: "",
    avatar_url: "" as string | null | "",
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim()) throw new Error("Full name is required");
      if (form.phone.trim() && !looksLikePhone(form.phone.trim()))
        throw new Error("Enter a valid phone number");
      if (!form.identity_type) throw new Error("Select an identity type");
      if (!form.identity_number.trim()) throw new Error("Identity number is required");

      const staffRef = form.staff_id.trim();
      let staffRow: { id: string } | null = null;
      if (staffRef) {
        const { data, error } = await supabase
          .from("payroll_staff")
          .select("id")
          .eq("employee_number", staffRef)
          .maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error("Staff ID not found");
        staffRow = { id: data.id };
      }

      const payload = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim() ? normalisePhone(form.phone.trim()) : null,
        email: form.email || null,
        address: form.address || null,
        identity_type: form.identity_type,
        identity_number: form.identity_number.trim(),
        national_id: null,
        notes: form.notes || null,
        avatar_url: form.avatar_url || null,
      };
      const { data, error } = await supabase
        .from("landowners")
        .insert(payload as never)
        .select("id")
        .single();
      if (error) throw error;
      if (!data?.id) throw new Error("Failed to create landowner");

      if (payload.phone) {
        const { error: phoneErr } = await supabase
          .from("landowner_phones" as never)
          .upsert([{ landowner_id: data.id, phone: payload.phone, is_primary: true }] as never, {
            onConflict: "landowner_id,phone",
          });
        if (phoneErr) throw phoneErr;
      }

      if (staffRow?.id) {
        const { error: assistErr } = await supabase
          .from("registration_assists" as never)
          .insert([{ staff_id: staffRow.id, landowner_id: data.id, amount: 10 }] as never);
        if (assistErr) throw assistErr;
      }

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
        identity_type: "",
        identity_number: "",
        staff_id: "",
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

  const removeSelected = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from("landowners").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted selected landowners");
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["landowners"] });
    },
    onError: (e: unknown) => toast.error(getUserFacingErrorMessage(e)),
  });

  const removeNoPhone = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("landowners").delete().or("phone.is.null,phone.eq.");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted landowners without phone numbers");
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["landowners"] });
    },
    onError: (e: unknown) => toast.error(getUserFacingErrorMessage(e)),
  });

  const rows = landowners.data?.rows ?? [];
  const pageIds = rows.map((r) => r.id);
  const pageSelectedCount = pageIds.reduce((n, id) => n + (selectedIds.has(id) ? 1 : 0), 0);
  const allOnPageSelected = pageIds.length > 0 && pageSelectedCount === pageIds.length;

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
                  identity_type, identity_number, notes
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

                      let skippedNoPhone = 0;
                      let skippedNoIdentity = 0;
                      const withPhone = parsed.filter((r) => {
                        if (!r.phone) {
                          skippedNoPhone += 1;
                          return false;
                        }
                        const idNum = r.identity_number ?? r.national_id;
                        if (!idNum) {
                          skippedNoIdentity += 1;
                          return false;
                        }
                        return true;
                      });

                      const normalized = dedupeLandownerRows(withPhone);
                      const skippedDuplicates = withPhone.length - normalized.length;

                      const existing = await findExistingLandowners(normalized);
                      const toInsert = normalized.filter((r) => {
                        const p = phoneKey(r.phone);
                        const e = emailKey(r.email);
                        const n = identityNumberKey(r.identity_number ?? r.national_id);
                        if (p && existing.phones.has(p)) return false;
                        if (e && existing.emails.has(e)) return false;
                        if (n && existing.identityNumbers.has(n)) return false;
                        return true;
                      });
                      const skippedExisting = normalized.length - toInsert.length;

                      let created = 0;
                      for (const batch of chunk(toInsert, 200)) {
                        const insertRows = batch.map((r) => {
                          const idType = r.identity_type;
                          const idNum = (r.identity_number ?? r.national_id) as string;
                          return idType
                            ? {
                                full_name: r.full_name,
                                phone: r.phone,
                                email: r.email,
                                address: r.address,
                                identity_type: idType,
                                identity_number: idNum,
                                national_id: null,
                                notes: r.notes,
                              }
                            : {
                                full_name: r.full_name,
                                phone: r.phone,
                                email: r.email,
                                address: r.address,
                                identity_type: null,
                                identity_number: null,
                                national_id: idNum,
                                notes: r.notes,
                              };
                        });
                        const { error } = await supabase
                          .from("landowners")
                          .insert(insertRows as never);
                        if (error) throw error;
                        created += batch.length;
                      }

                      toast.success(
                        `Imported ${created} landowner(s) · skipped ${skippedDuplicates + skippedExisting + skippedNoPhone + skippedNoIdentity}`,
                      );
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
          {canBulkDelete && (
            <ConfirmDelete
              onConfirm={() => removeNoPhone.mutateAsync()}
              pending={removeNoPhone.isPending}
              title="Delete all landowners without phone numbers?"
              description={
                <>
                  This permanently deletes all landowners where phone is empty or missing.
                  <DeleteImpactWarning kind="landowner" />
                </>
              }
              confirmLabel="Delete no-phone"
              trigger={
                <Button size="sm" variant="outline">
                  <Trash2 className="mr-1 h-4 w-4" /> Delete no-phone
                </Button>
              }
            />
          )}

          <Button asChild size="sm" variant="outline">
            <Link to="/lands">
              <Landmark className="mr-1 h-4 w-4" />
              Lands
            </Link>
          </Button>

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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Identity type *</Label>
                    <Select
                      value={form.identity_type}
                      onValueChange={(v) =>
                        setForm({
                          ...form,
                          identity_type: v as
                            | "ghana_card"
                            | "nhis"
                            | "drivers_license"
                            | "passport",
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ghana_card">Ghana Card</SelectItem>
                        <SelectItem value="nhis">Health insurance</SelectItem>
                        <SelectItem value="drivers_license">Driver’s license</SelectItem>
                        <SelectItem value="passport">Passport</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Field
                    label="Identity number *"
                    value={form.identity_number}
                    onChange={(v) => setForm({ ...form, identity_number: v })}
                  />
                </div>
                <Field
                  label="Staff ID (optional)"
                  value={form.staff_id}
                  onChange={(v) => setForm({ ...form, staff_id: v })}
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
      <div className="mb-4 flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:overflow-visible md:pb-0">
        <button
          type="button"
          onClick={() =>
            navigate({
              search: (prev) => ({
                ...normalizeLandownersSearch(prev, { mode: "unlinked", page: 1 }),
              }),
            })
          }
          className="min-w-56 cursor-pointer text-left md:min-w-0"
        >
          <Card
            className={`transition ${
              filterMode === "unlinked" ? "border-primary/40" : "hover:border-primary/25"
            }`}
          >
            <CardHeader className="space-y-0">
              <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                Unlinked owners
              </p>
              <CardTitle className="mt-2 text-3xl tabular-nums">
                {stats.isLoading ? "—" : (stats.data?.unlinkedCount ?? 0).toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
        </button>
        <button
          type="button"
          onClick={() =>
            navigate({
              search: (prev) => ({
                ...normalizeLandownersSearch(prev, { mode: "linked", page: 1 }),
              }),
            })
          }
          className="min-w-56 cursor-pointer text-left md:min-w-0"
        >
          <Card
            className={`transition ${
              filterMode === "linked" ? "border-primary/40" : "hover:border-primary/25"
            }`}
          >
            <CardHeader className="space-y-0">
              <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                Registered owners
              </p>
              <CardTitle className="mt-2 text-3xl tabular-nums">
                {stats.isLoading ? "—" : (stats.data?.linkedCount ?? 0).toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
        </button>
        <button
          type="button"
          onClick={() =>
            navigate({
              search: (prev) => ({
                ...normalizeLandownersSearch(prev, { mode: "all", page: 1 }),
              }),
            })
          }
          className="min-w-56 cursor-pointer text-left md:min-w-0"
        >
          <Card
            className={`transition ${
              filterMode === "all" ? "border-primary/40" : "hover:border-primary/25"
            }`}
          >
            <CardHeader className="space-y-0">
              <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                All owners
              </p>
              <CardTitle className="mt-2 text-3xl tabular-nums">
                {stats.isLoading ? "—" : (stats.data?.totalCount ?? 0).toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {filterMode === "unlinked"
              ? "Unlinked owners"
              : filterMode === "linked"
                ? "Registered owners"
                : "All landowners"}
          </CardTitle>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, phone, or email…"
                className="pl-9"
                value={search}
                onChange={(e) =>
                  navigate({
                    search: (prev) => ({
                      ...normalizeLandownersSearch(prev, { q: e.target.value, page: 1 }),
                    }),
                  })
                }
              />
            </div>
            <Select
              value={String(pageSize)}
              onValueChange={(v) =>
                navigate({
                  search: (prev) => ({
                    ...normalizeLandownersSearch(prev, { pageSize: Number(v), page: 1 }),
                  }),
                })
              }
            >
              <SelectTrigger className="w-35">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / page</SelectItem>
                <SelectItem value="25">25 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
                <SelectItem value="100">100 / page</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {landowners.isLoading ? (
            <TableSkeleton columns={canBulkDelete ? 7 : 6} rows={6} />
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {canBulkDelete && selectedIds.size > 0 && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-2 text-sm">
                  <div className="text-muted-foreground">Selected {selectedIds.size} item(s)</div>
                  <ConfirmDelete
                    onConfirm={() => removeSelected.mutateAsync(Array.from(selectedIds))}
                    pending={removeSelected.isPending}
                    title="Delete selected landowners?"
                    description={
                      <>
                        This permanently removes the selected landowner records and cannot be
                        undone.
                        <DeleteImpactWarning kind="landowner" />
                      </>
                    }
                    confirmLabel="Delete selected"
                  />
                </div>
              )}

              <div className="grid gap-2 md:hidden">
                {rows.map((o) => (
                  <div key={o.id} className="rounded-md border border-border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          to="/landowners/$ownerId"
                          params={{ ownerId: o.id }}
                          className="flex min-w-0 items-center gap-2 text-primary hover:underline"
                        >
                          <Avatar className="h-8 w-8">
                            {o.avatar_url ? (
                              <AvatarImage src={o.avatar_url} alt={o.full_name} />
                            ) : null}
                            <AvatarFallback>{o.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="truncate font-medium">{o.full_name}</span>
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full border border-border bg-muted/30 px-2 py-0.5">
                            {o.has_land ? "Registered" : "Unlinked"}
                          </span>
                          <span>{formatDate(o.created_at)}</span>
                        </div>
                        <div className="mt-2 space-y-1 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Phone</span>
                            <span className="font-medium">
                              {o.phone
                                ? looksLikePhone(o.phone)
                                  ? normalisePhone(o.phone)
                                  : o.phone
                                : "—"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Email</span>
                            <span className="truncate font-medium">{o.email || "—"}</span>
                          </div>
                        </div>
                      </div>

                      {canBulkDelete ? (
                        <Checkbox
                          checked={selectedIds.has(o.id)}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedIds);
                            if (checked) next.add(o.id);
                            else next.delete(o.id);
                            setSelectedIds(next);
                          }}
                          aria-label={`Select ${o.full_name}`}
                        />
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/lands" search={{ register: true, ownerId: o.id }}>
                          <Landmark className="mr-1 h-4 w-4" />
                          {o.has_land ? "Add land" : "Register land"}
                        </Link>
                      </Button>
                      {canRowDelete && (
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
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      {canBulkDelete && (
                        <th className="pb-2 pr-2">
                          <Checkbox
                            checked={allOnPageSelected}
                            onCheckedChange={(checked) => {
                              const next = new Set(selectedIds);
                              if (checked) {
                                for (const id of pageIds) next.add(id);
                              } else {
                                for (const id of pageIds) next.delete(id);
                              }
                              setSelectedIds(next);
                            }}
                            aria-label="Select all on page"
                          />
                        </th>
                      )}
                      <th className="pb-2">Name</th>
                      <th className="pb-2">Phone</th>
                      <th className="pb-2">Email</th>
                      <th className="pb-2">Identity</th>
                      <th className="pb-2">Added</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((o) => (
                      <tr key={o.id} className="border-b last:border-0">
                        {canBulkDelete && (
                          <td className="py-2 pr-2">
                            <Checkbox
                              checked={selectedIds.has(o.id)}
                              onCheckedChange={(checked) => {
                                const next = new Set(selectedIds);
                                if (checked) next.add(o.id);
                                else next.delete(o.id);
                                setSelectedIds(next);
                              }}
                              aria-label={`Select ${o.full_name}`}
                            />
                          </td>
                        )}
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
                              <AvatarFallback>
                                {o.full_name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {o.full_name}
                          </Link>
                        </td>
                        <td className="py-2">
                          {o.phone
                            ? looksLikePhone(o.phone)
                              ? normalisePhone(o.phone)
                              : o.phone
                            : "—"}
                        </td>
                        <td className="py-2">{o.email || "—"}</td>
                        <td className="py-2">
                          {formatIdentity(o.identity_type, o.identity_number)}
                        </td>
                        <td className="py-2 text-muted-foreground">{formatDate(o.created_at)}</td>
                        <td className="py-2 text-right">
                          <Button asChild size="sm" variant="outline" className="mr-2">
                            <Link to="/lands" search={{ register: true, ownerId: o.id }}>
                              <Landmark className="mr-1 h-4 w-4" />
                              {o.has_land ? "Add land" : "Register land"}
                            </Link>
                          </Button>
                          {canRowDelete && (
                            <ConfirmDelete
                              onConfirm={() => remove.mutateAsync(o.id)}
                              pending={remove.isPending}
                              title={`Delete ${o.full_name}?`}
                              description={
                                <>
                                  This permanently removes the landowner record and cannot be
                                  undone.
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
            </>
          )}
          {(() => {
            const total = landowners.data?.count ?? 0;
            const totalPages = Math.max(1, Math.ceil(total / pageSize));
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
                    onClick={() =>
                      navigate({
                        search: (prev) => ({
                          ...normalizeLandownersSearch(prev, { page: Math.max(1, page - 1) }),
                        }),
                      })
                    }
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() =>
                      navigate({
                        search: (prev) => ({
                          ...normalizeLandownersSearch(prev, {
                            page: Math.min(totalPages, page + 1),
                          }),
                        }),
                      })
                    }
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
  identity_type: "ghana_card" | "nhis" | "drivers_license" | "passport" | null;
  identity_number: string | null;
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
    ["full_name", "phone", "email", "address", "identity_type", "identity_number", "notes"],
    ["John Doe", "0244000000", "john@example.com", "Tema", "ghana_card", "GHA-12345", ""],
  ];
  const csv = toCsv(rows);
  downloadBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

async function downloadExcelTemplate(filename: string) {
  const XLSX = await import("xlsx");
  const rows: (string | number)[][] = [
    ["full_name", "phone", "email", "address", "identity_type", "identity_number", "notes"],
    ["John Doe", "0244000000", "john@example.com", "Tema", "ghana_card", "GHA-12345", ""],
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
  if (s === "idtype") return "identity_type";
  if (s === "identitytype") return "identity_type";
  if (s === "idnumber") return "identity_number";
  if (s === "identitynumber") return "identity_number";
  if (s === "phonenumber") return "phone";
  return s;
}

function normalizeOptAny(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function normalizeIdentityTypeAny(
  v: unknown,
): "ghana_card" | "nhis" | "drivers_license" | "passport" | null {
  const raw = String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!raw) return null;
  if (raw === "ghana_card" || raw === "ghanacard" || raw === "ghana") return "ghana_card";
  if (raw === "nhis" || raw === "health_insurance" || raw === "healthinsurance") return "nhis";
  if (raw === "drivers_license" || raw === "drivers_licence" || raw === "driverslicence")
    return "drivers_license";
  if (raw === "passport") return "passport";
  return null;
}

function normalizePhoneOptAny(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (!looksLikePhone(s)) throw new Error(`Invalid phone number: ${s}`);
  return normalisePhone(s);
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
        phone: normalizePhoneOptAny(mapped.phone),
        email: normalizeOptAny(mapped.email),
        address: normalizeOptAny(mapped.address),
        identity_type: normalizeIdentityTypeAny(mapped.identity_type),
        identity_number: normalizeOptAny(mapped.identity_number),
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
    identity_type: idx("identity_type"),
    identity_number: idx("identity_number"),
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
      phone: normalizePhoneOpt(r[mapIndex.phone]),
      email: normalizeOpt(r[mapIndex.email]),
      address: normalizeOpt(r[mapIndex.address]),
      identity_type: normalizeIdentityTypeAny(r[mapIndex.identity_type]),
      identity_number: normalizeOpt(r[mapIndex.identity_number]),
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

function normalizePhoneOpt(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (!looksLikePhone(s)) throw new Error(`Invalid phone number: ${s}`);
  return normalisePhone(s);
}

function phoneKey(phone: string | null): string {
  const v = (phone ?? "").trim();
  if (!v) return "";
  return normalisePhone(v).replace(/[^\d]/g, "");
}

function emailKey(email: string | null): string {
  return (email ?? "").replace(/\s+/g, "").toLowerCase();
}

function identityNumberKey(identityNumber: string | null | undefined): string {
  return String(identityNumber ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function nameKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

function dedupeKey(r: LandownerImportRow): string {
  const p = phoneKey(r.phone);
  const e = emailKey(r.email);
  const n = identityNumberKey(r.identity_number ?? r.national_id);
  if (p) return `phone:${p}`;
  if (e) return `email:${e}`;
  if (n) return `identity:${n}`;
  return `name:${nameKey(r.full_name)}`;
}

function phoneLookupCandidates(raw: string): string[] {
  const v = raw.trim();
  if (!v) return [];
  const norm = normalisePhone(v);
  const digits = norm.replace(/[^\d]/g, "");
  const local = digits.startsWith("233") ? `0${digits.slice(3)}` : "";
  const noPlus = norm.startsWith("+") ? norm.slice(1) : norm;
  return Array.from(new Set([v, norm, noPlus, digits, local].filter(Boolean)));
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
  identityNumbers: Set<string>;
}> {
  const phones = rows.map((r) => r.phone).filter(Boolean) as string[];
  const emails = rows.map((r) => r.email).filter(Boolean) as string[];
  const identityNumbers = rows
    .map((r) => identityNumberKey(r.identity_number ?? r.national_id))
    .filter(Boolean);

  const existing = {
    phones: new Set<string>(),
    emails: new Set<string>(),
    identityNumbers: new Set<string>(),
  };

  const phoneLookups = Array.from(new Set(phones.flatMap((p) => phoneLookupCandidates(p))));
  for (const batch of chunk(phoneLookups, 150)) {
    const { data, error } = await supabase.from("landowners").select("phone").in("phone", batch);
    if (error) throw error;
    for (const o of data ?? []) existing.phones.add(phoneKey(o.phone ?? null));
  }

  for (const batch of chunk(emails, 150)) {
    const { data, error } = await supabase.from("landowners").select("email").in("email", batch);
    if (error) throw error;
    for (const o of data ?? []) existing.emails.add(emailKey(o.email ?? null));
  }

  for (const batch of chunk(identityNumbers, 150)) {
    const { data, error } = await supabase
      .from("landowners")
      .select("identity_number_norm" as never)
      .in("identity_number_norm" as never, batch as never);
    if (error) throw error;
    for (const o of (data ?? []) as unknown as Array<{ identity_number_norm: string | null }>) {
      const k = identityNumberKey(o.identity_number_norm);
      if (k) existing.identityNumbers.add(k);
    }
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
