Patch adds GSPro CSV upload route:
- POST /api/upload/gspro (multipart/form-data field: file)

Requires env:
- SUPABASE_UPLOADS_BUCKET=<your bucket name>

Writes to tables:
- sessions, csv_imports, shots_raw, shots, session_stats
