export type ShotForSnapshot = {
  data?: {
    carry_yd?: number;
    offline_yd?: number;
    ball_speed_mph?: number;
    club_speed_mph?: number;
  };
};

function mean(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
}

function std(arr: number[]) {
  const m = mean(arr);
  const v = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

export function computeSnapshotMetrics(shots: ShotForSnapshot[]) {
  const clean = (shots ?? []).filter((s) => {
    const d = s?.data;
    const carry = Number(d?.carry_yd);
    const offline = Number(d?.offline_yd);
    const bs = Number(d?.ball_speed_mph);
    const cs = Number(d?.club_speed_mph);
    return (
      Number.isFinite(carry) &&
      Number.isFinite(offline) &&
      Number.isFinite(bs) &&
      Number.isFinite(cs) &&
      cs > 0
    );
  });

  if (!clean.length) return null;

  const carry = clean.map((s) => Number(s.data!.carry_yd));
  const offline = clean.map((s) => Number(s.data!.offline_yd));
  const smash = clean.map(
    (s) => Number(s.data!.ball_speed_mph) / Number(s.data!.club_speed_mph)
  );

  const carryMean = mean(carry);
  const carryStd = std(carry);
  const offlineStd = std(offline);

  const smashAvg = mean(smash);
  const smashStd = std(smash);

  const ellipseArea = Math.PI * offlineStd * carryStd;

  return {
    n: clean.length,
    strike_quality: { smash_avg: smashAvg, smash_std: smashStd },
    start_line_control: { offline_std: offlineStd },
    distance_control: {
      carry_mean: carryMean,
      carry_std: carryStd,
      carry_cv: carryStd / (carryMean || 1),
    },
    dispersion_tightness: { ellipse_area: ellipseArea },
  };
}
