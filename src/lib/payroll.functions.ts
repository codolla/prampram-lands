import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Compute monthly PAYE using simplified Ghana GRA bands (2024).
 * Bands are monthly cedi amounts.
 */
function computePAYE(taxable: number): number {
  const bands: Array<[number, number]> = [
    [490, 0],
    [110, 0.05],
    [130, 0.1],
    [3166.67, 0.175],
    [16000, 0.25],
    [30520, 0.3],
    [Number.POSITIVE_INFINITY, 0.35],
  ];
  let remaining = taxable;
  let tax = 0;
  for (const [width, rate] of bands) {
    if (remaining <= 0) break;
    const slice = Math.min(remaining, width);
    tax += slice * rate;
    remaining -= slice;
  }
  return Math.max(0, Math.round(tax * 100) / 100);
}

export const generatePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { runId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { runId } = data;

    const { data: run, error: runErr } = await supabase
      .from("payroll_runs")
      .select("*")
      .eq("id", runId)
      .single();
    if (runErr || !run) throw new Error("Run not found");
    if (run.status !== "draft") throw new Error("Only draft runs can be regenerated");

    const { data: staff } = await supabase.from("payroll_staff").select("*").eq("active", true);

    const { data: components } = await supabase
      .from("payroll_components")
      .select("*")
      .eq("active", true);

    const { data: overrides } = await supabase
      .from("payroll_staff_components")
      .select("*")
      .eq("active", true);

    // wipe existing payslips for this run
    await supabase.from("payslips").delete().eq("run_id", runId);

    let totalGross = 0,
      totalDed = 0,
      totalNet = 0;
    const slips: Array<Record<string, unknown>> = [];

    for (const s of staff ?? []) {
      const base = Number(s.base_salary ?? 0);
      const earnings: Array<{ name: string; amount: number; code: string | null }> = [];
      const deductions: Array<{ name: string; amount: number; code: string | null }> = [];

      for (const c of components ?? []) {
        const ov = overrides?.find((o) => o.staff_id === s.id && o.component_id === c.id);
        // include if explicitly assigned, statutory, or has default amount
        const explicit = !!ov;
        if (!explicit && !c.is_statutory && Number(c.default_amount ?? 0) === 0) continue;

        let amount = 0;
        if (c.code === "PAYE") {
          // compute later, after other deductions known
          amount = -1;
        } else if (c.calc_type === "percent_of_base") {
          const pct = Number(ov?.amount ?? c.default_amount ?? 0);
          amount = (base * pct) / 100;
        } else {
          amount = Number(ov?.amount ?? c.default_amount ?? 0);
        }
        amount = Math.round(amount * 100) / 100;
        const entry = { name: c.name, amount, code: c.code };
        if (c.type === "earning") earnings.push(entry);
        else deductions.push(entry);
      }

      const totalEarnings = earnings.reduce((a, b) => a + b.amount, 0);
      const gross = base + totalEarnings;
      const ssnit = deductions.find((d) => d.code === "SSNIT_EMP")?.amount ?? 0;
      const taxable = Math.max(0, gross - ssnit);
      const payeIdx = deductions.findIndex((d) => d.code === "PAYE");
      if (payeIdx >= 0) deductions[payeIdx].amount = computePAYE(taxable);
      const totalDeductions = deductions.reduce((a, b) => a + b.amount, 0);
      const net = gross - totalDeductions;

      totalGross += gross;
      totalDed += totalDeductions;
      totalNet += net;

      slips.push({
        run_id: runId,
        staff_id: s.id,
        user_id: s.user_id,
        base_salary: base,
        total_earnings: totalEarnings,
        total_deductions: totalDeductions,
        gross_pay: gross,
        net_pay: net,
        breakdown: { earnings, deductions },
      });
    }

    if (slips.length > 0) {
      const { error } = await supabase.from("payslips").insert(slips as never);
      if (error) throw new Error(error.message);
    }

    await supabase
      .from("payroll_runs")
      .update({
        total_gross: totalGross,
        total_deductions: totalDed,
        total_net: totalNet,
      })
      .eq("id", runId);

    return { count: slips.length, totalGross, totalDed, totalNet };
  });
