// lib/parsers/skytrak_v1.ts
// SkyTrak CSV -> normalized JSON (v1)
// Goal: take the per-row `shots_raw.data` payload and output a clean, stable structure we can use across UI + analytics.

export type SkyTrakUnits = Record<string, string>;

export type SkyTrakShotV1 = {
  shot_number: number | null;
  carry_yd: number | null;
  total_yd: number | null;
  roll_yd: number | null;
  offline_yd: number | null;

  ball_speed_mph: number | null;
  club_speed_mph: number | null;
  smash_factor: number | null;

  launch_deg: number | null;
  side_deg: number | null;
  path_deg: number | null;
  ftt_deg: number | null;
  descent_deg: number | null;

  back_rpm: number | null;
  side_rpm: number | null;

  height_yd: number | null;
  flight_sec: number | null;

  shot_score: number | null;

  // Optional tag if a device/export provides it
  club: string | null;

  // keep the raw row around for debugging / future mappings
  _raw?: unknown;
};

export type SkyTrakSessionV1 = {
  schema: "skytrak_v1";
  player_name: string; // always overridden by our client name
  practice_at: string | null; // ISO string if we can parse it
  units: SkyTrakUnits;
  shots: SkyTrakShotV1[];
};

const toNum = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const toInt = (v: any): number | null => {
  const n = toNum(v);
  return n === null ? null : Math.trunc(n);
};

const toStr = (v: any): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
};

// SkyTrak labels look like: "PRACTICE: 12/20/2025 5:32 PM,,,,,"
// We'll attempt parsing into an ISO string; if unsure, return null.
const parsePracticeLabelToISO = (label: any): string | null => {
  const s = toStr(label);
  if (!s) return null;

  const m = s.match(
    /PRACTICE:\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})\s+([0-9]{1,2}:[0-9]{2})\s*(AM|PM)?/i
  );
  if (!m) return null;

  const [mm, dd, yyyy] = m[1].split("/").map((x) => Number(x));
  const [hhRaw, min] = m[2].split(":").map((x) => Number(x));
  if (!mm || !dd || !yyyy || hhRaw === undefined || min === undefined) return null;

  let hh = hhRaw;
  const ampm = (m[3] || "").toUpperCase();
  if (ampm === "PM" && hh < 12) hh += 12;
  if (ampm === "AM" && hh === 12) hh = 0;

  // This will be interpreted as server-local time; good enough for v1.
  const dt = new Date(yyyy, mm - 1, dd, hh, min, 0);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
};

export const normalizeSkyTrakRowV1 = (
  rowData: any
): { shot: SkyTrakShotV1; units: SkyTrakUnits; practice_at: string | null } => {
  const d: any = rowData || {};

  // Prefer already-normalized keys if you’ve stored them (carry_yd, ball_speed_mph etc.)
  // Fallback to `_raw` keys if needed (often strings).
  const raw: any = d._raw || {};
  const units: SkyTrakUnits = d._units && typeof d._units === "object" ? d._units : {};

  const shot: SkyTrakShotV1 = {
    shot_number: toInt(d.shot_number ?? raw["SHOT"]),
    carry_yd: toNum(d.carry_yd ?? raw["CARRY"]),
    total_yd: toNum(d.total_yd ?? raw["TOTAL"]),
    roll_yd: toNum(d.roll_yd ?? raw["ROLL"]),
    offline_yd: toNum(d.offline_yd ?? raw["OFFLINE"]),

    ball_speed_mph: toNum(d.ball_speed_mph ?? raw["BALL SPEED"]),
    club_speed_mph: toNum(d.club_speed_mph ?? raw["CLUB SPEED"]),
    smash_factor: toNum(d.smash_factor ?? raw["SMASH"]),

    launch_deg: toNum(d.launch_deg ?? raw["LAUNCH"]),
    side_deg: toNum(d.side_deg ?? raw["SIDE"]),
    path_deg: toNum(d.path_deg ?? raw["PATH"]),
    ftt_deg: toNum(d.ftt_deg ?? raw["FTT"]),
    descent_deg: toNum(d.descent_deg ?? raw["DSCNT"]),

    back_rpm: toNum(d.back_rpm ?? raw["BACK"]),
    side_rpm: toNum(d.side_rpm ?? raw["SIDE RPM"]),

    height_yd: toNum(d.height_yd ?? raw["HEIGHT"]),
    flight_sec: toNum(d.flight_sec ?? raw["FLIGHT"]),

    shot_score: toNum(d.shot_score ?? raw["SHOT SCORE"]),

    // Optional club tag (not present in your sample; safe for future devices)
    club: toStr(d.club ?? raw["CLUB"] ?? raw["CLUB NAME"]),

    _raw: d,
  };

  const practice_at = parsePracticeLabelToISO(d.practice_label);

  return { shot, units, practice_at };
};

export const buildSkyTrakSessionV1 = (args: {
  client_name: string; // ALWAYS use your client record name (not SkyTrak label)
  rows: any[]; // array of shots_raw.data objects
}): SkyTrakSessionV1 => {
  const { client_name, rows } = args;

  const shots: SkyTrakShotV1[] = [];
  let mergedUnits: SkyTrakUnits = {};
  let practice_at: string | null = null;

  for (const r of rows) {
    const { shot, units, practice_at: pa } = normalizeSkyTrakRowV1(r);
    shots.push(shot);
    mergedUnits = { ...mergedUnits, ...units };
    if (!practice_at && pa) practice_at = pa;
  }

  return {
    schema: "skytrak_v1",
    player_name: client_name,
    practice_at,
    units: mergedUnits,
    shots,
  };
};
