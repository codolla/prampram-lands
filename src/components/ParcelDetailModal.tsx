import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { formatArea } from "@/lib/boundary";
import {
  Download,
  ExternalLink,
  FileCode2,
  Globe2,
  ImageIcon,
  MapPin,
  Receipt,
  User,
  X,
} from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  active: "default",
  leased: "secondary",
  disputed: "destructive",
};

function statusBadge(status: string) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? "secondary"} className="capitalize">
      {status}
    </Badge>
  );
}

export function ParcelDetailModal({
  landId,
  onOpenChange,
}: {
  landId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = !!landId;

  const land = useQuery({
    queryKey: ["parcel-detail", landId],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lands")
        .select(
          "id, land_code, plot_number, status, area_sqm, size_value, size_unit, boundary_type, location_description, gps_lat, gps_lng, annual_rent_amount, landowners:current_owner_id(id, full_name, phone), land_types:land_type_id(label)",
        )
        .eq("id", landId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const bills = useQuery({
    queryKey: ["parcel-bills", landId],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("id, billing_year, amount, status, due_date, payments(amount)")
        .eq("land_id", landId!)
        .order("billing_year", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  const photos = useQuery({
    queryKey: ["parcel-photos", landId],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, file_name, storage_path, mime_type")
        .eq("land_id", landId!)
        .like("mime_type", "image/%")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="parcel-detail-title"
      className="fixed inset-y-0 right-0 z-1000 w-full max-w-2xl overflow-y-auto border-l border-border bg-background p-6 shadow-2xl sm:top-4 sm:right-4 sm:bottom-4 sm:rounded-lg sm:border"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-3 top-3 z-10"
        aria-label="Close parcel details"
        onClick={() => onOpenChange(false)}
      >
        <X className="h-4 w-4" />
      </Button>
      {land.isLoading || !land.data ? (
        <div className="space-y-3 pr-8">
          <div className="space-y-1.5">
            <h2
              id="parcel-detail-title"
              className="text-lg font-semibold leading-none tracking-tight"
            >
              Loading parcel…
            </h2>
            <p className="text-sm text-muted-foreground">Fetching land details</p>
          </div>
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <ParcelBody
          land={land.data as unknown as LandRow}
          bills={bills.data ?? []}
          billsLoading={bills.isLoading}
          photos={photos.data ?? []}
          photosLoading={photos.isLoading}
        />
      )}
    </aside>
  );
}

interface LandRow {
  id: string;
  land_code: string;
  plot_number: string | null;
  status: string;
  area_sqm: number | null;
  size_value: number | null;
  size_unit: string;
  boundary_type: string | null;
  location_description: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  annual_rent_amount: number;
  landowners: { id: string; full_name: string; phone: string | null } | null;
  land_types: { label: string } | null;
}

interface BillRow {
  id: string;
  billing_year: number;
  amount: number;
  status: string;
  due_date: string;
  payments: { amount: number }[] | null;
}

interface PhotoRow {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
}

function ParcelBody({
  land,
  bills,
  billsLoading,
  photos,
  photosLoading,
}: {
  land: LandRow;
  bills: BillRow[];
  billsLoading: boolean;
  photos: PhotoRow[];
  photosLoading: boolean;
}) {
  const downloadKml = () => {
    window.open(`/api/public/lands/${land.id}/kml`, "_blank", "noopener,noreferrer");
  };

  const downloadGeoJson = async () => {
    const { data, error } = await supabase
      .from("land_coordinates")
      .select("seq, lat, lng")
      .eq("land_id", land.id)
      .order("seq");
    if (error || !data || data.length < 3) {
      window.alert("This parcel has no boundary defined yet.");
      return;
    }
    const ring = data.map((p) => [Number(p.lng), Number(p.lat)] as [number, number]);
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
    const feature = {
      type: "Feature",
      properties: {
        land_code: land.land_code,
        plot_number: land.plot_number,
        status: land.status,
        owner: land.landowners?.full_name ?? null,
        area_sqm: land.area_sqm,
      },
      geometry: { type: "Polygon", coordinates: [ring] },
    };
    const blob = new Blob([JSON.stringify(feature, null, 2)], {
      type: "application/geo+json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${land.land_code}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openInGoogleEarth = () => {
    const url = `${window.location.origin}/api/public/lands/${land.id}/kml`;
    window.open(
      `https://earth.google.com/web/?url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5 pr-8">
        <h2
          id="parcel-detail-title"
          className="flex flex-wrap items-center gap-2 text-lg font-semibold leading-none tracking-tight"
        >
          <span>{land.land_code}</span>
          {statusBadge(land.status)}
          {land.land_types?.label && <Badge variant="outline">{land.land_types.label}</Badge>}
        </h2>
        <p className="text-sm text-muted-foreground">
          {land.plot_number ? `Plot ${land.plot_number} · ` : ""}
          {land.location_description ?? "No location description"}
        </p>
      </div>

      {/* Core info */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <InfoRow icon={<User className="h-4 w-4" />} label="Owner">
          {land.landowners ? (
            <Link
              to="/landowners/$ownerId"
              params={{ ownerId: land.landowners.id }}
              className="text-primary hover:underline"
            >
              {land.landowners.full_name}
            </Link>
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          )}
        </InfoRow>
        <InfoRow label="Area">
          {land.area_sqm
            ? formatArea(Number(land.area_sqm))
            : land.size_value
              ? `${land.size_value} ${land.size_unit}`
              : "—"}
        </InfoRow>
        <InfoRow label="Annual rent">
          GHS {Number(land.annual_rent_amount).toLocaleString()}
        </InfoRow>
        <InfoRow label="Boundary">
          {land.boundary_type ? (
            <Badge variant="outline" className="capitalize">
              {land.boundary_type}
            </Badge>
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </InfoRow>
        {land.gps_lat != null && land.gps_lng != null && (
          <InfoRow icon={<MapPin className="h-4 w-4" />} label="GPS" className="col-span-2">
            {Number(land.gps_lat).toFixed(6)}, {Number(land.gps_lng).toFixed(6)}
          </InfoRow>
        )}
      </div>

      <Separator />

      {/* Photos */}
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <ImageIcon className="h-4 w-4" /> Photos
        </h3>
        {photosLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photos uploaded.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((p) => (
              <PhotoThumb key={p.id} path={p.storage_path} name={p.file_name} />
            ))}
          </div>
        )}
      </section>

      <Separator />

      {/* Billing snapshot */}
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Receipt className="h-4 w-4" /> Recent bills
        </h3>
        {billsLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : bills.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bills issued yet.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Year</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2 text-left">Due</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => {
                  const paid = (b.payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
                  return (
                    <tr key={b.id} className="border-t border-border">
                      <td className="px-3 py-2">{b.billing_year}</td>
                      <td className="px-3 py-2 text-right">{Number(b.amount).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{paid.toLocaleString()}</td>
                      <td className="px-3 py-2">{format(new Date(b.due_date), "MMM d, yyyy")}</td>
                      <td className="px-3 py-2 capitalize">
                        <Badge
                          variant={
                            b.status === "paid"
                              ? "default"
                              : b.status === "overdue"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {b.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Separator />

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="default" size="sm">
          <Link to="/lands/$landId" params={{ landId: land.id }} search={{ tab: undefined }}>
            <ExternalLink /> Open full record
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={downloadKml}>
          <Download /> KML
        </Button>
        <Button variant="outline" size="sm" onClick={downloadGeoJson}>
          <FileCode2 /> GeoJSON
        </Button>
        <Button variant="outline" size="sm" onClick={openInGoogleEarth}>
          <Globe2 /> Google Earth
        </Button>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  children,
  icon,
  className,
}: {
  label: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function PhotoThumb({ path, name }: { path: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.storage
      .from("land-documents")
      .createSignedUrl(path, 300)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return (
    <a
      href={url ?? "#"}
      target="_blank"
      rel="noreferrer"
      className="block h-24 w-24 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
      title={name}
    >
      {url ? (
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
    </a>
  );
}
