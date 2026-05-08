// Client-safe parsers + helpers for land boundary input.
// All formats are normalized to a GeoJSON Polygon with ring [lng, lat] order.

export type LngLat = [number, number]; // [lng, lat] — GeoJSON convention
export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: LngLat[][]; // [outerRing, ...holes]
}

export class BoundaryParseError extends Error {}

function inRange(lng: number, lat: number) {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

function dedupConsecutive(ring: LngLat[]): LngLat[] {
  const out: LngLat[] = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

function closeRing(ring: LngLat[]): LngLat[] {
  if (ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0], first[1]]];
}

export function normalizeRing(ring: LngLat[]): LngLat[] {
  const cleaned = dedupConsecutive(
    ring.map(([lng, lat]) => [Number(lng.toFixed(8)), Number(lat.toFixed(8))] as LngLat),
  );
  // Need 3 unique vertices (so >= 4 with closing point)
  if (cleaned.length < 3) {
    throw new BoundaryParseError(`Polygon needs at least 3 unique points (got ${cleaned.length}).`);
  }
  for (const [lng, lat] of cleaned) {
    if (!inRange(lng, lat)) {
      throw new BoundaryParseError(
        `Coordinate out of range: lng=${lng}, lat=${lat}. Make sure the order is longitude,latitude.`,
      );
    }
  }
  return closeRing(cleaned);
}

export function fromLatLngArray(points: { lat: number; lng: number }[]): GeoJSONPolygon {
  const ring: LngLat[] = points.map((p) => [Number(p.lng), Number(p.lat)]);
  return { type: "Polygon", coordinates: [normalizeRing(ring)] };
}

/* ---------- GeoJSON ---------- */

export function parseGeoJSON(text: string): GeoJSONPolygon {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BoundaryParseError("File is not valid JSON.");
  }

  const findPolygon = (node: unknown): GeoJSONPolygon | null => {
    if (!node || typeof node !== "object") return null;
    const n = node as Record<string, unknown>;
    if (n.type === "Polygon" && Array.isArray(n.coordinates)) {
      return n as unknown as GeoJSONPolygon;
    }
    if (n.type === "Feature") return findPolygon(n.geometry);
    if (n.type === "FeatureCollection" && Array.isArray(n.features)) {
      for (const f of n.features) {
        const p = findPolygon(f);
        if (p) return p;
      }
    }
    if (n.type === "MultiPolygon" && Array.isArray(n.coordinates)) {
      const first = (n.coordinates as unknown[])[0];
      if (Array.isArray(first)) {
        return { type: "Polygon", coordinates: first as LngLat[][] };
      }
    }
    if (n.type === "GeometryCollection" && Array.isArray(n.geometries)) {
      for (const g of n.geometries) {
        const p = findPolygon(g);
        if (p) return p;
      }
    }
    return null;
  };

  const poly = findPolygon(json);
  if (!poly) throw new BoundaryParseError("No Polygon found in GeoJSON.");
  const outer = poly.coordinates[0] as LngLat[];
  return { type: "Polygon", coordinates: [normalizeRing(outer)] };
}

/* ---------- KML ---------- */

export function parseKML(text: string): GeoJSONPolygon {
  // Use the browser DOMParser for KML/XML
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new BoundaryParseError("KML file is not valid XML.");
  }
  const polys = doc.getElementsByTagName("Polygon");
  if (polys.length === 0) throw new BoundaryParseError("No <Polygon> in KML file.");
  const outerEl =
    polys[0]
      .getElementsByTagName("outerBoundaryIs")[0]
      ?.getElementsByTagName("LinearRing")[0]
      ?.getElementsByTagName("coordinates")[0] ?? polys[0].getElementsByTagName("coordinates")[0];
  if (!outerEl) throw new BoundaryParseError("KML polygon missing <coordinates>.");
  const raw = (outerEl.textContent ?? "").trim();
  const ring: LngLat[] = raw
    .split(/\s+/)
    .filter(Boolean)
    .map((tuple) => {
      const parts = tuple.split(",").map(Number);
      // KML order is lon,lat[,alt]
      const [lng, lat] = parts;
      return [lng, lat] as LngLat;
    });
  return { type: "Polygon", coordinates: [normalizeRing(ring)] };
}

/* ---------- CSV ---------- */

/**
 * Accepts CSV with header (case-insensitive) `lat,lng` OR `lng,lat`,
 * or headerless rows assumed `lat,lng`.
 */
export function parseCSV(text: string): GeoJSONPolygon {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new BoundaryParseError("CSV is empty.");

  let latIdx = 0;
  let lngIdx = 1;
  let start = 0;

  const header = lines[0].split(/[,;\t]/).map((h) => h.trim().toLowerCase());
  const isHeader = header.some((h) => /lat|lng|lon/.test(h));
  if (isHeader) {
    start = 1;
    const li = header.findIndex((h) => h === "lat" || h === "latitude");
    const gi = header.findIndex(
      (h) => h === "lng" || h === "lon" || h === "long" || h === "longitude",
    );
    if (li === -1 || gi === -1) {
      throw new BoundaryParseError("CSV header must include lat and lng (or longitude/latitude).");
    }
    latIdx = li;
    lngIdx = gi;
  }

  const ring: LngLat[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(/[,;\t]/).map((c) => Number(c.trim()));
    const lat = cols[latIdx];
    const lng = cols[lngIdx];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BoundaryParseError(`CSV row ${i + 1} has invalid numbers.`);
    }
    ring.push([lng, lat]);
  }
  return { type: "Polygon", coordinates: [normalizeRing(ring)] };
}

/* ---------- Format dispatcher ---------- */

export async function parseBoundaryFile(file: File): Promise<GeoJSONPolygon> {
  const text = await file.text();
  const name = file.name.toLowerCase();
  if (name.endsWith(".geojson") || name.endsWith(".json")) return parseGeoJSON(text);
  if (name.endsWith(".kml")) return parseKML(text);
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCSV(text);
  // fall back: try GeoJSON, then KML, then CSV
  try {
    return parseGeoJSON(text);
  } catch {
    /* try next */
  }
  try {
    return parseKML(text);
  } catch {
    /* try next */
  }
  return parseCSV(text);
}

/* ---------- KML output ---------- */

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function polygonToKML(opts: {
  name: string;
  description: string;
  polygon: GeoJSONPolygon;
}): string {
  const ring = opts.polygon.coordinates[0]
    .map(([lng, lat]) => `${lng.toFixed(8)},${lat.toFixed(8)},0`)
    .join(" ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(opts.name)}</name>
    <Style id="landStyle_normal">
      <LineStyle><color>ff15803d</color><width>3</width></LineStyle>
      <PolyStyle><color>00ffffff</color><fill>0</fill><outline>1</outline></PolyStyle>
    </Style>
    <Style id="landStyle_highlight">
      <LineStyle><color>ff15803d</color><width>4</width></LineStyle>
      <PolyStyle><color>00ffffff</color><fill>0</fill><outline>1</outline></PolyStyle>
    </Style>
    <StyleMap id="landStyle">
      <Pair><key>normal</key><styleUrl>#landStyle_normal</styleUrl></Pair>
      <Pair><key>highlight</key><styleUrl>#landStyle_highlight</styleUrl></Pair>
    </StyleMap>
    <Placemark>
      <name>${escapeXml(opts.name)}</name>
      <description><![CDATA[${opts.description}]]></description>
      <styleUrl>#landStyle</styleUrl>
      <Polygon>
        <altitudeMode>clampToGround</altitudeMode>
        <outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;
}

/* ---------- Geometry utilities ---------- */

/** Spherical-excess area in m² (good enough for parcel-scale previews). */
export function approximateAreaSqm(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  const R = 6378137; // WGS84 equatorial radius
  const toRad = (d: number) => (d * Math.PI) / 180;
  let area = 0;
  const pts =
    ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [lng1, lat1] = pts[i];
    const [lng2, lat2] = pts[(i + 1) % n];
    area += toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  return Math.abs((area * R * R) / 2);
}

export function ringCenter(ring: LngLat[]): { lat: number; lng: number } {
  let lat = 0;
  let lng = 0;
  const n = ring.length;
  for (const [g, t] of ring) {
    lng += g;
    lat += t;
  }
  return { lat: lat / n, lng: lng / n };
}

/** Convert GeoJSON ring to {lat,lng}[] for Leaflet. */
export function ringToLatLngs(ring: LngLat[]): { lat: number; lng: number }[] {
  return ring.map(([lng, lat]) => ({ lat, lng }));
}

export function formatArea(sqm: number | null | undefined): string {
  if (sqm == null || !Number.isFinite(sqm)) return "—";
  if (sqm >= 10000) return `${(sqm / 10000).toFixed(3)} ha (${sqm.toFixed(0)} m²)`;
  return `${sqm.toFixed(1)} m²`;
}
