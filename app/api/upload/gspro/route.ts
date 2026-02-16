import Papa from "papaparse";
import crypto from "crypto";
import { requireClient, jsonErr, jsonOk } from "@/app/api/_lib/auth";

type ParsedRow = Record<string, any>;

function toNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toText(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: Request) {
  const auth = await requireClient();
  if (!("supabase" in auth)) return auth.res;

  const { supabase, userId, clientId } = auth;

  const bucket = process.env.SUPABASE_UPLOADS_BUCKET;
  if (!bucket) return jsonErr(500, "missing_env", { need: "SUPABASE_UPLOADS_BUCKET" });

  const form = await req.formData().catch(() => null);
  if (!form) return jsonErr(400, "bad_formdata");

  const file = form.get("file");
  if (!(file instanceof File)) return jsonErr(400, "missing_file", { field: "file" });

  const originalFilename = file.name || "gspro.csv";
  if (!originalFilename.toLowerCase().endsWith(".csv")) {
    return jsonErr(400, "invalid_file_type", { expected: ".csv" });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const csvText = buf.toString("utf-8");

  const parsed = Papa.parse<ParsedRow>(csvText, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  if (parsed.errors?.length) {
    return jsonErr(400, "csv_parse_failed", { first: parsed.errors[0] });
  }

  const headers = parsed.meta?.fields ?? [];
  const rows = (parsed.data ?? []).filter((r) => r && Object.keys(r).length > 0);
  if (!rows.length) return jsonErr(400, "no_rows");

  // Create session first (csv_imports requires session_id)
  const today = new Date();
  const sessionDate = today.toISOString().slice(0, 10); // YYYY-MM-DD

  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .insert([
      {
        client_id: clientId,
        uploaded_by: userId,
        session_date: sessionDate,
        source: "gspro",
        metrics_status: "uploaded",
      },
    ])
    .select("id, created_at")
    .single();

  if (sessionErr || !session) {
    return jsonErr(500, "session_create_failed", { detail: sessionErr?.message });
  }

  const sessionId = session.id as string;

  // Upload CSV to storage
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `uploads/${clientId}/${sessionId}/${ts}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buf, { contentType: "text/csv", upsert: true });

  if (upErr) {
    return jsonErr(500, "storage_upload_failed", { detail: upErr.message, bucket, storagePath });
  }

  // Build header map (GSPro → canonical shot fields)
  const headerMap = {
    Carry: "carry",
    TotalDistance: "total",
    BallSpeed: "ball_speed",
    ClubSpeed: "club_speed",
    VLA: "launch_angle",
    BackSpin: "back_spin",
    SideSpin: "side_spin",
    Offline: "side",
    Club: "club",
  } as const;

  // Create csv_imports row
  const { data: imp, error: impErr } = await supabase
    .from("csv_imports")
    .insert([
      {
        session_id: sessionId,
        uploaded_by: userId,
        storage_path: storagePath,
        original_filename: originalFilename,
        headers,
        header_map: headerMap,
        status: "processing",
      },
    ])
    .select("id")
    .single();

  if (impErr || !imp) {
    return jsonErr(500, "import_create_failed", { detail: impErr?.message });
  }

  const importId = imp.id as string;

  // Update session.import_id
  await supabase.from("sessions").update({ import_id: importId }).eq("id", sessionId);

  // Insert shots_raw (store every parsed row)
  const rawRows = rows.map((r, idx) => ({
    import_id: importId,
    row_number: idx + 1,
    data: r,
    uploaded_by: userId,
  }));

  for (const part of chunk(rawRows, 500)) {
    const { error } = await supabase.from("shots_raw").insert(part);
    if (error) return jsonErr(500, "shots_raw_insert_failed", { detail: error.message });
  }

  // Normalize into shots table (columns exist in schema)
  const shots = rows.map((r, idx) => ({
    session_id: sessionId,
    shot_number: idx + 1,
    club: toText(r["Club"]),
    ball_speed: toNum(r["BallSpeed"]),
    club_speed: toNum(r["ClubSpeed"]),
    carry: toNum(r["Carry"]),
    total: toNum(r["TotalDistance"]),
    side: toNum(r["Offline"]),
    launch_angle: toNum(r["VLA"]),
    back_spin: toNum(r["BackSpin"]),
    side_spin: toNum(r["SideSpin"]),
  }));

  // Track missing metrics across shots
  const required = ["club","ball_speed","club_speed","carry","total","side","launch_angle","back_spin","side_spin"] as const;
  const missingSet = new Set<string>();
  for (const s of shots) {
    for (const k of required) {
      const v = (s as any)[k];
      if (v === null || v === undefined || v === "") missingSet.add(k);
    }
  }

  for (const part of chunk(shots, 500)) {
    const { error } = await supabase.from("shots").insert(part);
    if (error) return jsonErr(500, "shots_insert_failed", { detail: error.message });
  }

  // Minimal snapshot into session_stats
  const shotsCount = shots.length;
  const avg = (key: keyof typeof shots[number]) => {
    const nums = shots.map((s) => (typeof s[key] === "number" ? (s[key] as number) : null)).filter((n): n is number => n !== null);
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  };

  const dataHash = crypto.createHash("sha256").update(buf).digest("hex");
  const statsJson = {
    source: "gspro",
    shots: shotsCount,
    averages: {
      ball_speed: avg("ball_speed"),
      club_speed: avg("club_speed"),
      carry: avg("carry"),
      total: avg("total"),
      side: avg("side"),
      launch_angle: avg("launch_angle"),
      back_spin: avg("back_spin"),
      side_spin: avg("side_spin"),
    },
  };

  await supabase.from("session_stats").upsert(
    [
      {
        client_id: clientId,
        session_id: sessionId,
        data_hash: dataHash,
        stat_type: "snapshot",
        stat_version: 1,
        stats_json: statsJson,
      },
    ],
    { onConflict: "session_id,stat_type" as any }
  );

  // Finalize statuses
  const metricsMissing = Array.from(missingSet);
  const metricsStatus = metricsMissing.length ? "incomplete" : "complete";

  await supabase
    .from("sessions")
    .update({ metrics_status: metricsStatus, metrics_missing: metricsMissing })
    .eq("id", sessionId);

  await supabase.from("csv_imports").update({ status: "complete" }).eq("id", importId);

  // Return: session id; UI should display created_at which already exists
  return jsonOk({
    sessionId,
    shotsInserted: shotsCount,
    createdAt: session.created_at,
    storagePath,
    metricsStatus,
    metricsMissing,
  });
}