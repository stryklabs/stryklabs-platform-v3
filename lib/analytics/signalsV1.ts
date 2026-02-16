// lib/analytics/signalsV1.ts
// V1 Shot Signal Layer (deterministic, recomputable, no DB writes)

export type ShotRowForSignals = {
  carry: number | null;
  total: number | null;
  side: number | null;
  ball_speed: number | null;
  club_speed: number | null;
};

export type ShotOutcomeV1 =
  | "mishit"
  | "extreme_offline"
  | "fairway_finder"
  | "missed_fairway_in_play";

export type MishitReasonV1 =
  | "near_zero_carry"
  | "carry_collapse_vs_session"
  | "low_efficiency_smash_proxy"
  | "rollout_spike";

export type SignalsV1 = {
  totals: {
    shots: number;
    eligible_shots: number; // non-mishits
    median_carry: number | null;
  };

  outcomes: Record<ShotOutcomeV1, { count: number; rate: number }> & {
    mishit: { count: number; rate: number; reasons: Record<MishitReasonV1, number> };
  };

  // Club-agnostic: carry band vs session median, excluding mishits
  consistency: {
    band_pct: number;
    eligible_shots: number;
    shots_in_band: number;
    adherence_rate: number;
  };

  thresholds: {
    // Mishit
    mishit_carry_ratio: number;
    smash_proxy_min: number;
    rollout_min_yards: number;
    rollout_ratio_of_carry: number;
    near_zero_carry_yards: number;

    // Fairway / extreme (carry-scaled per shot)
    fairway_width_min_yards: number;
    fairway_width_ratio_of_carry: number;
    extreme_offline_min_yards: number;
    extreme_offline_ratio_of_carry: number;

    // Consistency
    consistency_band_pct: number;
  };

  // Useful for explainability/debugging (avg of per-shot thresholds)
  thresholds_session_avg: {
    fairway_width_avg: number | null;
    extreme_offline_avg: number | null;
  };
};

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function median(nums: number[]): number | null {
  const arr = nums.filter(isNum).slice().sort((a, b) => a - b);
  const n = arr.length;
  if (!n) return null;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
}

export function classifyShotV1(
  s: ShotRowForSignals,
  sessionMedianCarry: number | null,
  t: SignalsV1["thresholds"]
): {
  outcome: ShotOutcomeV1;
  fairwayWidth: number;
  extremeOffline: number;
  mishitReasons: MishitReasonV1[];
} {
  const carry = isNum(s.carry) ? s.carry : null;
  const total = isNum(s.total) ? s.total : null;
  const side = isNum(s.side) ? s.side : null;
  const ball = isNum(s.ball_speed) ? s.ball_speed : null;
  const club = isNum(s.club_speed) ? s.club_speed : null;

  // Per-shot thresholds (carry-scaled when carry is present)
  const fairwayWidth = carry !== null ? Math.max(t.fairway_width_min_yards, t.fairway_width_ratio_of_carry * carry) : t.fairway_width_min_yards;
  const extreme = carry !== null ? Math.max(t.extreme_offline_min_yards, t.extreme_offline_ratio_of_carry * carry) : t.extreme_offline_min_yards;

  // Mishit rules (priority #1)
  const reasons: MishitReasonV1[] = [];

  const nearZeroCarry = carry !== null && carry <= t.near_zero_carry_yards;
  if (nearZeroCarry) reasons.push("near_zero_carry");

  const carryCollapse =
    carry !== null &&
    sessionMedianCarry !== null &&
    sessionMedianCarry > 0 &&
    carry < t.mishit_carry_ratio * sessionMedianCarry;
  if (carryCollapse) reasons.push("carry_collapse_vs_session");

  const lowSmash = ball !== null && club !== null && club > 0 && ball / club < t.smash_proxy_min;
  if (lowSmash) reasons.push("low_efficiency_smash_proxy");

  const rolloutSpike =
    carry !== null &&
    total !== null &&
    total >= carry &&
    total - carry > Math.max(t.rollout_min_yards, t.rollout_ratio_of_carry * carry);
  if (rolloutSpike) reasons.push("rollout_spike");

  if (reasons.length > 0) {
    return { outcome: "mishit", fairwayWidth, extremeOffline: extreme, mishitReasons: reasons };
  }

  // If side missing, keep deterministic and avoid inflating fairway.
  if (side === null) {
    return { outcome: "missed_fairway_in_play", fairwayWidth, extremeOffline: extreme, mishitReasons: [] };
  }

  // Extreme offline (priority #2)
  if (Math.abs(side) >= extreme) {
    return { outcome: "extreme_offline", fairwayWidth, extremeOffline: extreme, mishitReasons: [] };
  }

  // Fairway finder (priority #3)
  if (Math.abs(side) <= fairwayWidth) {
    return { outcome: "fairway_finder", fairwayWidth, extremeOffline: extreme, mishitReasons: [] };
  }

  // Missed fairway in play (priority #4)
  return { outcome: "missed_fairway_in_play", fairwayWidth, extremeOffline: extreme, mishitReasons: [] };
}

export function computeSignalsV1(shots: ShotRowForSignals[]): SignalsV1 {
  const thresholds: SignalsV1["thresholds"] = {
    mishit_carry_ratio: 0.55,
    smash_proxy_min: 1.15,
    rollout_min_yards: 25,
    rollout_ratio_of_carry: 0.35,
    near_zero_carry_yards: 5,

    fairway_width_min_yards: 20,
    fairway_width_ratio_of_carry: 0.12,
    extreme_offline_min_yards: 35,
    extreme_offline_ratio_of_carry: 0.25,

    consistency_band_pct: 15,
  };

  const carries = shots.map((s) => s.carry).filter(isNum).filter((c) => c > 0);
  const medCarry = median(carries);

  const totals: SignalsV1["totals"] = {
    shots: shots.length,
    eligible_shots: 0,
    median_carry: medCarry,
  };

  const counts: Record<ShotOutcomeV1, number> = {
    mishit: 0,
    extreme_offline: 0,
    fairway_finder: 0,
    missed_fairway_in_play: 0,
  };

  const mishitReasons: Record<MishitReasonV1, number> = {
    near_zero_carry: 0,
    carry_collapse_vs_session: 0,
    low_efficiency_smash_proxy: 0,
    rollout_spike: 0,
  };

  // Consistency: carry band vs session median, exclude mishits
  let consistencyEligible = 0;
  let consistencyInBand = 0;

  // Explainability: avg per-shot thresholds
  let fairwayWidthSum = 0;
  let extremeSum = 0;
  let thresholdN = 0;

  for (const s of shots) {
    const r = classifyShotV1(s, medCarry, thresholds);
    counts[r.outcome] += 1;

    if (r.outcome === "mishit") {
      for (const reason of r.mishitReasons) {
        mishitReasons[reason] += 1;
      }
    } else {
      totals.eligible_shots += 1;
    }

    // Consistency only for eligible shots with carry
    if (r.outcome !== "mishit" && isNum(s.carry) && isNum(medCarry) && medCarry > 0) {
      consistencyEligible += 1;
      const band = (thresholds.consistency_band_pct / 100) * medCarry;
      if (Math.abs(s.carry - medCarry) <= band) consistencyInBand += 1;
    }

    fairwayWidthSum += r.fairwayWidth;
    extremeSum += r.extremeOffline;
    thresholdN += 1;
  }

  const denom = totals.shots > 0 ? totals.shots : 1;

  const outcomesBase = {
    mishit: { count: counts.mishit, rate: counts.mishit / denom, reasons: mishitReasons },
    extreme_offline: { count: counts.extreme_offline, rate: counts.extreme_offline / denom },
    fairway_finder: { count: counts.fairway_finder, rate: counts.fairway_finder / denom },
    missed_fairway_in_play: { count: counts.missed_fairway_in_play, rate: counts.missed_fairway_in_play / denom },
  } as SignalsV1["outcomes"];

  const adherence_rate = consistencyEligible > 0 ? consistencyInBand / consistencyEligible : 0;

  return {
    totals,
    outcomes: outcomesBase,
    consistency: {
      band_pct: thresholds.consistency_band_pct,
      eligible_shots: consistencyEligible,
      shots_in_band: consistencyInBand,
      adherence_rate,
    },
    thresholds,
    thresholds_session_avg: {
      fairway_width_avg: thresholdN ? fairwayWidthSum / thresholdN : null,
      extreme_offline_avg: thresholdN ? extremeSum / thresholdN : null,
    },
  };
}

// -----------------------------
// V1.1 Consistency Tightening
// -----------------------------

type ConsistencyBandLabelV11 = "Q1" | "Q2" | "Q3" | "Q4" | "LOWER" | "UPPER";

export type ConsistencyBandV11 = {
  band: ConsistencyBandLabelV11;
  n: number;
  median_carry: number | null;
  carry_tol_pct: number;
  offline_tol_y: number;
  carry_rate: number;
  offline_rate: number;
  overall_rate: number;
};

export type SignalsV11 = {
  consistency: {
    mode: {
      quartiles: 4 | 2 | 0;
      min_eligible: number;
    };
    eligible_shots: number;
    bands: ConsistencyBandV11[];
    aggregate: {
      carry_rate: number;
      offline_rate: number;
      overall_rate: number;
    };
    flags: {
      low_sample: boolean;
      fallback_bands: boolean;
    };
  };
};

function clamp(min: number, max: number, v: number): number {
  return Math.max(min, Math.min(max, v));
}

function splitIntoBands(sortedShots: ShotRowForSignals[], quartiles: 4 | 2): Array<{ label: ConsistencyBandLabelV11; shots: ShotRowForSignals[] }> {
  const n = sortedShots.length;
  if (n === 0) return [];

  if (quartiles === 2) {
    const mid = Math.floor(n / 2);
      return [
          { label: "LOWER" as const, shots: sortedShots.slice(0, mid) },
          { label: "UPPER" as const, shots: sortedShots.slice(mid) },
      ];
  }

  // quartiles === 4
  const q = Math.floor(n / 4);
  const q1 = sortedShots.slice(0, q);
  const q2 = sortedShots.slice(q, 2 * q);
  const q3 = sortedShots.slice(2 * q, 3 * q);
  const q4 = sortedShots.slice(3 * q);

    return [
        { label: "Q1" as const, shots: q1 },
        { label: "Q2" as const, shots: q2 },
        { label: "Q3" as const, shots: q3 },
        { label: "Q4" as const, shots: q4 },
    ].filter((b) => b.shots.length > 0);
}

/**
 * Compute V1.1 consistency tightening.
 * - Excludes mishits (uses V1 classifier)
 * - Uses carry-based quartiles (or halves for small samples)
 * - Tightens carry tolerance for longer shots deterministically
 * - Adds offline adherence alongside carry adherence
 */
export function computeSignalsV1_1(shots: ShotRowForSignals[]): SignalsV11 {
  const base = computeSignalsV1(shots);
  const t = base.thresholds;
  const medCarry = base.totals.median_carry;

  // Eligible = non-mishit + has carry
  const eligible = shots
    .map((s) => ({ s, r: classifyShotV1(s, medCarry, t) }))
    .filter(({ s, r }) => r.outcome !== "mishit" && typeof s.carry === "number" && Number.isFinite(s.carry) && (s.carry as number) > 0)
    .map(({ s }) => s);

  const minEligible = 12;
  const nEligible = eligible.length;

  // Fallback mode for low sample: compute a simple tightened band around session median
  if (nEligible < minEligible || medCarry === null || medCarry <= 0) {
    const offlineTol = medCarry !== null && medCarry > 0 ? Math.max(10, 0.10 * medCarry) : 10;
    const carryTolPct = medCarry !== null && medCarry > 0 ? clamp(0.10, 0.18, 0.18 - 0.0003 * medCarry) : 0.18;
    const carryBand = medCarry !== null && medCarry > 0 ? carryTolPct * medCarry : 0;

    let carryOK = 0;
    let offlineOK = 0;
    let overallOK = 0;

    for (const s of eligible) {
      const carry = s.carry as number;
      const side = typeof s.side === "number" && Number.isFinite(s.side) ? (s.side as number) : null;

      const cOk = medCarry !== null && medCarry > 0 ? Math.abs(carry - medCarry) <= carryBand : false;
      const oOk = side !== null ? Math.abs(side) <= offlineTol : false;

      if (cOk) carryOK += 1;
      if (oOk) offlineOK += 1;
      if (cOk && oOk) overallOK += 1;
    }

    const denom = nEligible > 0 ? nEligible : 1;

    return {
      consistency: {
        mode: { quartiles: 0, min_eligible: minEligible },
        eligible_shots: nEligible,
        bands: [
          {
            band: "LOWER",
            n: nEligible,
            median_carry: medCarry,
            carry_tol_pct: carryTolPct,
            offline_tol_y: offlineTol,
            carry_rate: carryOK / denom,
            offline_rate: offlineOK / denom,
            overall_rate: overallOK / denom,
          },
        ],
        aggregate: {
          carry_rate: carryOK / denom,
          offline_rate: offlineOK / denom,
          overall_rate: overallOK / denom,
        },
        flags: {
          low_sample: true,
          fallback_bands: true,
        },
      },
    };
  }

  // Sort by carry
  const sorted = eligible.slice().sort((a, b) => (a.carry as number) - (b.carry as number));

  const quartiles: 4 | 2 = nEligible < 20 ? 2 : 4;
  const bandSplits = splitIntoBands(sorted, quartiles);

  const bands: ConsistencyBandV11[] = [];

  let carryOKAll = 0;
  let offlineOKAll = 0;
  let overallOKAll = 0;

  for (const b of bandSplits) {
    const bandCarries = b.shots.map((x) => x.carry).filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
    const bandMedian = median(bandCarries);

    const carryTolPct = bandMedian !== null && bandMedian > 0 ? clamp(0.10, 0.18, 0.18 - 0.0003 * bandMedian) : 0.18;
    const offlineTol = bandMedian !== null && bandMedian > 0 ? Math.max(10, 0.10 * bandMedian) : 10;

    const carryBand = bandMedian !== null && bandMedian > 0 ? carryTolPct * bandMedian : 0;

    let carryOK = 0;
    let offlineOK = 0;
    let overallOK = 0;

    for (const s of b.shots) {
      const carry = s.carry as number;
      const side = typeof s.side === "number" && Number.isFinite(s.side) ? (s.side as number) : null;

      const cOk = bandMedian !== null && bandMedian > 0 ? Math.abs(carry - bandMedian) <= carryBand : false;
      const oOk = side !== null ? Math.abs(side) <= offlineTol : false;

      if (cOk) carryOK += 1;
      if (oOk) offlineOK += 1;
      if (cOk && oOk) overallOK += 1;
    }

    const denom = b.shots.length > 0 ? b.shots.length : 1;

    bands.push({
      band: b.label,
      n: b.shots.length,
      median_carry: bandMedian,
      carry_tol_pct: carryTolPct,
      offline_tol_y: offlineTol,
      carry_rate: carryOK / denom,
      offline_rate: offlineOK / denom,
      overall_rate: overallOK / denom,
    });

    carryOKAll += carryOK;
    offlineOKAll += offlineOK;
    overallOKAll += overallOK;
  }

  const denomAll = nEligible > 0 ? nEligible : 1;

  return {
    consistency: {
      mode: { quartiles, min_eligible: minEligible },
      eligible_shots: nEligible,
      bands,
      aggregate: {
        carry_rate: carryOKAll / denomAll,
        offline_rate: offlineOKAll / denomAll,
        overall_rate: overallOKAll / denomAll,
      },
      flags: {
        low_sample: false,
        fallback_bands: false,
      },
    },
  };
}
