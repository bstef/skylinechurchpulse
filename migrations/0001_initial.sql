-- D1 schema for the isolated migration preview. Never run against Supabase.
CREATE TABLE service_entries (
  id TEXT PRIMARY KEY NOT NULL,
  service_date TEXT NOT NULL,
  service_type TEXT NOT NULL,
  attendance INTEGER NOT NULL CHECK(attendance >= 0),
  unity INTEGER NOT NULL CHECK(unity BETWEEN 1 AND 5),
  engagement INTEGER NOT NULL CHECK(engagement BETWEEN 1 AND 5),
  loudness_db INTEGER NOT NULL,
  sound_clarity INTEGER NOT NULL DEFAULT 0 CHECK(sound_clarity IN (0,1)),
  spiritual_response INTEGER NOT NULL DEFAULT 5 CHECK(spiritual_response BETWEEN 0 AND 10),
  transition_clarity INTEGER NOT NULL DEFAULT 3 CHECK(transition_clarity BETWEEN 1 AND 5),
  lighting_fit INTEGER NOT NULL DEFAULT 1 CHECK(lighting_fit IN (0,1)),
  talking_fit INTEGER NOT NULL DEFAULT 1 CHECK(talking_fit IN (0,1)),
  announcements_fit INTEGER NOT NULL DEFAULT 1 CHECK(announcements_fit IN (0,1)),
  sermon_fit INTEGER NOT NULL DEFAULT 1 CHECK(sermon_fit IN (0,1)),
  notes TEXT DEFAULT '',
  pco_plan_id TEXT,
  logged_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  attendance_pco_value INTEGER,
  host_name TEXT,
  intro_welcoming INTEGER NOT NULL DEFAULT 3 CHECK(intro_welcoming BETWEEN 1 AND 5),
  UNIQUE(pco_plan_id, service_type)
);
CREATE TABLE production_entries (
  id TEXT PRIMARY KEY NOT NULL,
  service_date TEXT NOT NULL,
  service_type TEXT NOT NULL,
  lights_present INTEGER NOT NULL DEFAULT 1 CHECK(lights_present IN (0,1)), lights_name TEXT,
  camera_present INTEGER NOT NULL DEFAULT 1 CHECK(camera_present IN (0,1)), camera_name TEXT,
  director_present INTEGER NOT NULL DEFAULT 1 CHECK(director_present IN (0,1)), director_name TEXT,
  computer_present INTEGER NOT NULL DEFAULT 1 CHECK(computer_present IN (0,1)), computer_name TEXT,
  audio_present INTEGER NOT NULL DEFAULT 1 CHECK(audio_present IN (0,1)), audio_name TEXT,
  slides_grade INTEGER NOT NULL DEFAULT 1 CHECK(slides_grade BETWEEN 1 AND 4),
  slides_miss_count INTEGER NOT NULL DEFAULT 0 CHECK(slides_miss_count >= 0),
  camera_direction_fit INTEGER NOT NULL DEFAULT 1 CHECK(camera_direction_fit IN (0,1)),
  notes TEXT DEFAULT '', logged_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(service_date,service_type)
);
CREATE TABLE email_recipients (
  id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE email_log (
  id TEXT PRIMARY KEY NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  kind TEXT NOT NULL CHECK(kind IN ('weekly_digest','report')),
  dataset TEXT, subject TEXT NOT NULL, recipients TEXT NOT NULL DEFAULT '',
  recipient_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('sent','failed')),
  error TEXT, html_body TEXT
);
CREATE INDEX service_entries_date ON service_entries(service_date DESC,created_at DESC,id DESC);
CREATE INDEX production_entries_date ON production_entries(service_date DESC,created_at DESC,id DESC);
CREATE INDEX email_recipients_created ON email_recipients(created_at,id);
CREATE INDEX email_log_sent ON email_log(sent_at DESC,id DESC);
-- host_entries still exists in the live DB although main's schema retires it.
-- Preserve it during migration until live rows and references are audited.
CREATE TABLE host_entries (
  id TEXT PRIMARY KEY NOT NULL, service_date TEXT NOT NULL, service_type TEXT NOT NULL,
  pco_plan_id TEXT, host_name TEXT,
  intro_welcoming INTEGER NOT NULL DEFAULT 3 CHECK(intro_welcoming BETWEEN 1 AND 5),
  transitions_flow INTEGER NOT NULL DEFAULT 3 CHECK(transitions_flow BETWEEN 1 AND 5),
  announcements_landed INTEGER NOT NULL DEFAULT 1 CHECK(announcements_landed IN (0,1)),
  notes TEXT DEFAULT '', logged_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(pco_plan_id,service_type)
);
