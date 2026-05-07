import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Wipe transactional/reference data and reload a known seed set so admins can
 * practise against realistic records. Admin-only.
 *
 * Order of deletes respects implicit relationships (no FKs in this schema, but
 * trigger `prevent_land_type_in_use_delete` blocks deleting a land type while
 * lands/packages reference it). Land types themselves are preserved.
 */
export const resetSeedData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Verify caller is an admin (RLS-respecting client, runs as the user).
    const { data: roles, error: rolesErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesErr) throw new Error(rolesErr.message);
    const canReset = (roles ?? []).some(
      (r) => r.role === "admin" || (r.role as unknown as string) === "developer",
    );
    if (!canReset) {
      throw new Error("Only administrators can reset seed data.");
    }

    // Use the service-role client to bypass RLS for the wipe + reseed.
    const db = supabaseAdmin;

    // Wipe order: payments → bills → ownership_history → land_coordinates →
    // lands → rent_packages → landowners → staff zones/assignments.
    // (Land types and user roles are preserved.)
    const wipes = [
      "payments",
      "bills",
      "ownership_history",
      "land_coordinates",
      "sms_logs",
      "land_staff_assignments",
      "lands",
      "rent_packages",
      "landowners",
      "staff_zone_assignments",
      "staff_zones",
    ] as const;

    for (const table of wipes) {
      const { error } = await db.from(table).delete().not("id", "is", null);
      if (error) throw new Error(`Failed to clear ${table}: ${error.message}`);
    }

    type ActivityClient = {
      from: (t: "activity_logs") => {
        insert: (row: {
          actor_id: string;
          action: string;
          entity: string;
          entity_id: null;
          message: string;
          metadata: Record<string, unknown>;
        }) => Promise<{ error: { message: string } | null }>;
      };
    };
    const activity = db as unknown as ActivityClient;
    await activity.from("activity_logs").insert({
      actor_id: userId,
      action: "reset",
      entity: "seed",
      entity_id: null,
      message: "Reset to fresh seed data",
      metadata: { scope: "wipe+reseed", keep: ["users", "land_types", "user_roles"] },
    });

    // Land types — load active ones; insert defaults if empty.

    // Land types — load active ones; insert defaults if empty.
    const { data: loadedTypes, error: typesErr } = await db
      .from("land_types")
      .select("id, name")
      .order("sort_order");
    if (typesErr) throw new Error(typesErr.message);

    let types = loadedTypes;
    if (!types || types.length === 0) {
      const defaults = [
        { name: "residential", label: "Residential", sort_order: 1 },
        { name: "commercial", label: "Commercial", sort_order: 2 },
        { name: "agricultural", label: "Agricultural", sort_order: 3 },
        { name: "industrial", label: "Industrial", sort_order: 4 },
        { name: "mixed_use", label: "Mixed Use", sort_order: 5 },
        { name: "other", label: "Other", sort_order: 6 },
      ];
      const { data: inserted, error: insErr } = await db
        .from("land_types")
        .insert(defaults)
        .select("id, name");
      if (insErr) throw new Error(insErr.message);
      types = inserted ?? [];
    }

    const typeId = (name: string) => {
      const t = types!.find((x) => x.name === name);
      if (!t) throw new Error(`Missing land type: ${name}`);
      return t.id;
    };

    // Rent packages (one per land type)
    const packageDefs = [
      { name: "Residential Standard", land_type_id: typeId("residential"), annual_amount: 250 },
      { name: "Commercial Standard", land_type_id: typeId("commercial"), annual_amount: 1200 },
      { name: "Agricultural Standard", land_type_id: typeId("agricultural"), annual_amount: 80 },
      { name: "Industrial Standard", land_type_id: typeId("industrial"), annual_amount: 2500 },
      { name: "Mixed Use Standard", land_type_id: typeId("mixed_use"), annual_amount: 600 },
      { name: "Other Standard", land_type_id: typeId("other"), annual_amount: 150 },
    ];
    const { data: packages, error: pkgErr } = await db
      .from("rent_packages")
      .insert(packageDefs.map((p) => ({ ...p, active: true })))
      .select("id, land_type_id, annual_amount");
    if (pkgErr) throw new Error(pkgErr.message);
    const pkgFor = (ltId: string) => {
      const p = packages!.find((x) => x.land_type_id === ltId);
      if (!p) throw new Error("Missing rent package");
      return p;
    };

    // Landowners
    const owners = [
      {
        id: "11111111-1111-1111-1111-111111111101",
        full_name: "Kwame Mensah",
        phone: "+233244000001",
        email: "kwame.mensah@example.com",
        address: "Prampram, Greater Accra",
        national_id: "GHA-100000001-1",
      },
      {
        id: "11111111-1111-1111-1111-111111111102",
        full_name: "Akosua Boateng",
        phone: "+233244000002",
        email: "akosua.boateng@example.com",
        address: "Ningo, Greater Accra",
        national_id: "GHA-100000002-2",
      },
      {
        id: "11111111-1111-1111-1111-111111111103",
        full_name: "Yaw Asante",
        phone: "+233244000003",
        email: "yaw.asante@example.com",
        address: "Tema Community 25",
        national_id: "GHA-100000003-3",
      },
      {
        id: "11111111-1111-1111-1111-111111111104",
        full_name: "Adjoa Owusu",
        phone: "+233244000004",
        email: null,
        address: "Dawhenya",
        national_id: "GHA-100000004-4",
      },
      {
        id: "11111111-1111-1111-1111-111111111105",
        full_name: "Kojo Appiah",
        phone: "+233244000005",
        email: "kojo.appiah@example.com",
        address: "Prampram New Site",
        national_id: "GHA-100000005-5",
      },
      {
        id: "11111111-1111-1111-1111-111111111106",
        full_name: "Ama Darko",
        phone: "+233244000006",
        email: "ama.darko@example.com",
        address: "Lower Prampram",
        national_id: "GHA-100000006-6",
      },
      {
        id: "11111111-1111-1111-1111-111111111107",
        full_name: "Kofi Nyarko",
        phone: "+233244000007",
        email: null,
        address: "Old Ningo",
        national_id: "GHA-100000007-7",
      },
      {
        id: "11111111-1111-1111-1111-111111111108",
        full_name: "Esi Tetteh",
        phone: "+233244000008",
        email: "esi.tetteh@example.com",
        address: "Afienya",
        national_id: "GHA-100000008-8",
      },
    ];
    const { error: ownErr } = await db.from("landowners").insert(owners);
    if (ownErr) throw new Error(ownErr.message);

    // Lands
    const lands = [
      {
        code: "PCLS-2024-0001",
        plot: "A-12",
        type: "residential",
        size: 0.25,
        loc: "Prampram Beach Road",
        lat: 5.715,
        lng: 0.123,
        owner: 1,
        status: "active",
      },
      {
        code: "PCLS-2024-0002",
        plot: "A-13",
        type: "residential",
        size: 0.3,
        loc: "Prampram Beach Road",
        lat: 5.7152,
        lng: 0.1232,
        owner: 2,
        status: "active",
      },
      {
        code: "PCLS-2024-0003",
        plot: "B-04",
        type: "commercial",
        size: 0.5,
        loc: "Prampram Main Junction",
        lat: 5.716,
        lng: 0.124,
        owner: 3,
        status: "active",
      },
      {
        code: "PCLS-2024-0004",
        plot: "B-05",
        type: "commercial",
        size: 0.45,
        loc: "Market Street",
        lat: 5.7165,
        lng: 0.1245,
        owner: 4,
        status: "active",
      },
      {
        code: "PCLS-2024-0005",
        plot: "C-21",
        type: "agricultural",
        size: 5.0,
        loc: "Outskirts toward Dawhenya",
        lat: 5.725,
        lng: 0.13,
        owner: 5,
        status: "active",
      },
      {
        code: "PCLS-2024-0006",
        plot: "C-22",
        type: "agricultural",
        size: 8.0,
        loc: "Outskirts toward Dawhenya",
        lat: 5.726,
        lng: 0.131,
        owner: 6,
        status: "leased",
      },
      {
        code: "PCLS-2024-0007",
        plot: "D-01",
        type: "industrial",
        size: 1.5,
        loc: "Industrial Zone East",
        lat: 5.71,
        lng: 0.118,
        owner: 7,
        status: "active",
      },
      {
        code: "PCLS-2024-0008",
        plot: "D-02",
        type: "industrial",
        size: 2.0,
        loc: "Industrial Zone East",
        lat: 5.7102,
        lng: 0.1182,
        owner: 8,
        status: "active",
      },
      {
        code: "PCLS-2024-0009",
        plot: "E-07",
        type: "mixed_use",
        size: 0.75,
        loc: "High Street Mixed Block",
        lat: 5.717,
        lng: 0.125,
        owner: 1,
        status: "active",
      },
      {
        code: "PCLS-2024-0010",
        plot: "E-08",
        type: "mixed_use",
        size: 0.6,
        loc: "High Street Mixed Block",
        lat: 5.7172,
        lng: 0.1252,
        owner: 3,
        status: "active",
      },
      {
        code: "PCLS-2024-0011",
        plot: "A-14",
        type: "residential",
        size: 0.28,
        loc: "Prampram New Site",
        lat: 5.718,
        lng: 0.126,
        owner: 5,
        status: "active",
      },
      {
        code: "PCLS-2024-0012",
        plot: "F-01",
        type: "other",
        size: 1.0,
        loc: "Reserve area",
        lat: 5.719,
        lng: 0.127,
        owner: 6,
        status: "disputed",
      },
    ];
    const ownerId = (n: number) =>
      `11111111-1111-1111-1111-1111111111${String(n).padStart(2, "0")}`;

    const landRows = lands.map((l, i) => {
      const ltId = typeId(l.type);
      const pkg = pkgFor(ltId);
      return {
        id: `22222222-2222-2222-2222-2222222222${String(i + 1).padStart(2, "0")}`,
        land_code: l.code,
        plot_number: l.plot,
        land_type_id: ltId,
        rent_package_id: pkg.id,
        size_value: l.size,
        size_unit: "acres" as const,
        location_description: l.loc,
        gps_lat: l.lat,
        gps_lng: l.lng,
        status: l.status as "active" | "leased" | "disputed",
        current_owner_id: ownerId(l.owner),
        annual_rent_amount: pkg.annual_amount,
      };
    });
    const { data: insertedLands, error: landErr } = await db
      .from("lands")
      .insert(landRows)
      .select("id, annual_rent_amount");
    if (landErr) throw new Error(landErr.message);

    // Bills: 2024 overdue + 2025 pending for every land
    const billRows = (insertedLands ?? []).flatMap((l) => [
      {
        land_id: l.id,
        billing_year: 2024,
        amount: l.annual_rent_amount,
        due_date: "2024-06-30",
        status: "overdue" as const,
      },
      {
        land_id: l.id,
        billing_year: 2025,
        amount: l.annual_rent_amount,
        due_date: "2025-06-30",
        status: "pending" as const,
      },
    ]);
    const { data: insertedBills, error: billErr } = await db
      .from("bills")
      .insert(billRows)
      .select("id, land_id, billing_year, amount");
    if (billErr) throw new Error(billErr.message);

    // Demo payments — full + partial across a few bills (trigger recomputes status)
    const findBill = (landIdx: number, year: number) => {
      const landId = landRows[landIdx].id;
      return insertedBills!.find((b) => b.land_id === landId && b.billing_year === year)!;
    };
    const b1 = findBill(0, 2024);
    const b2 = findBill(2, 2024);
    const b3 = findBill(4, 2025);
    const b4 = findBill(6, 2024);
    const { error: payErr } = await db.from("payments").insert([
      {
        bill_id: b1.id,
        amount: b1.amount,
        method: "cash",
        paid_at: "2024-05-12",
        reference: "CASH-0001",
        notes: "Full payment",
      },
      {
        bill_id: b2.id,
        amount: 500,
        method: "momo",
        paid_at: "2024-07-02",
        reference: "MOMO-7788",
        notes: "Partial payment",
      },
      {
        bill_id: b3.id,
        amount: b3.amount,
        method: "bank",
        paid_at: "2025-02-18",
        reference: "BNK-4421",
        notes: "Early settlement",
      },
      {
        bill_id: b4.id,
        amount: 1000,
        method: "bank",
        paid_at: "2024-08-15",
        reference: "CHQ-0099",
        notes: "First instalment",
      },
    ]);
    if (payErr) throw new Error(payErr.message);

    // ----- Staff zones + assignments (demo territories) -----
    // Two zones split the seeded plot area roughly West / East. Polygons are
    // generous so all seeded lands fall inside one of them.
    // Polygon rings as [lng, lat] pairs (closed — first == last). We insert
    // directly with the admin client because the upsert_staff_zone RPC
    // enforces an `auth.uid()` admin check, which fails when called from the
    // service-role context used by the seeder.
    const westRing = [
      [0.115, 5.708],
      [0.1235, 5.708],
      [0.1235, 5.728],
      [0.115, 5.728],
      [0.115, 5.708],
    ];
    const eastRing = [
      [0.1235, 5.708],
      [0.133, 5.708],
      [0.133, 5.728],
      [0.1235, 5.728],
      [0.1235, 5.708],
    ];
    const ringToWkt = (ring: number[][]) =>
      `SRID=4326;POLYGON((${ring.map(([lng, lat]) => `${lng} ${lat}`).join(",")}))`;

    const { data: zoneRows, error: zonesErr } = await db
      .from("staff_zones")
      .insert([
        {
          name: "West Territory",
          description: "Industrial zone & western Prampram",
          active: true,
          boundary: ringToWkt(westRing) as unknown as never,
          ring: westRing as unknown as never,
        },
        {
          name: "East Territory",
          description: "Beach Road, Market & agricultural outskirts",
          active: true,
          boundary: ringToWkt(eastRing) as unknown as never,
          ring: eastRing as unknown as never,
        },
      ])
      .select("id, name");
    if (zonesErr) throw new Error(`Failed to create zones: ${zonesErr.message}`);
    const westZoneId = zoneRows?.find((z) => z.name === "West Territory")?.id ?? null;
    const eastZoneId = zoneRows?.find((z) => z.name === "East Territory")?.id ?? null;

    // Find existing staff users — assign first two to the two zones.
    const { data: staffRoles, error: srErr } = await db
      .from("user_roles")
      .select("user_id")
      .eq("role", "staff");
    if (srErr) throw new Error(srErr.message);
    const staffIds = Array.from(new Set((staffRoles ?? []).map((r) => r.user_id)));

    let zoneAssignmentsCount = 0;
    let landOverridesCount = 0;

    if (staffIds.length > 0 && westZoneId && eastZoneId) {
      const zoneAssignments: { user_id: string; zone_id: string }[] = [];
      // First staff → West, second staff → East. If only one staff, assign to both.
      zoneAssignments.push({ user_id: staffIds[0], zone_id: westZoneId });
      if (staffIds[1]) {
        zoneAssignments.push({ user_id: staffIds[1], zone_id: eastZoneId });
      } else {
        zoneAssignments.push({ user_id: staffIds[0], zone_id: eastZoneId });
      }
      const { error: zaErr } = await db.from("staff_zone_assignments").insert(zoneAssignments);
      if (zaErr) throw new Error(`Failed to assign staff to zones: ${zaErr.message}`);
      zoneAssignmentsCount = zoneAssignments.length;

      // Demo per-land override: pin the first staff to the LAST land (in East
      // zone) so it's visible even if zone coverage changes.
      const lastLandId = landRows[landRows.length - 1].id;
      const { error: lsaErr } = await db
        .from("land_staff_assignments")
        .insert([{ land_id: lastLandId, user_id: staffIds[0] }]);
      if (lsaErr) throw new Error(`Failed to add land override: ${lsaErr.message}`);
      landOverridesCount = 1;
    }

    return {
      ok: true,
      counts: {
        landowners: owners.length,
        rent_packages: packageDefs.length,
        lands: landRows.length,
        bills: billRows.length,
        payments: 4,
        staff_zones: 2,
        staff_zone_assignments: zoneAssignmentsCount,
        land_staff_overrides: landOverridesCount,
      },
      notes:
        staffIds.length === 0
          ? "No staff users found — created zones but skipped staff assignments. Add staff users in Settings → Users, then re-run seed."
          : undefined,
    };
  });
