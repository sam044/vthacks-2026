CREATE TABLE IF NOT EXISTS mock_email_schedule (
 id TEXT PRIMARY KEY, email TEXT NOT NULL, health_center TEXT NOT NULL,
 starts_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled'
 CHECK (status IN ('scheduled','cancelled')), revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS mock_email_schedule_lookup ON mock_email_schedule(email,status);
CREATE TABLE IF NOT EXISTS appointment_email_jobs (
 id TEXT PRIMARY KEY,
 schedule_id TEXT NOT NULL REFERENCES mock_email_schedule(id) ON DELETE CASCADE,
 recipient_email TEXT NOT NULL, cancel_token TEXT NOT NULL,
 stopped INTEGER NOT NULL DEFAULT 0 CHECK (stopped IN (0,1)),
 schedule_revision INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK (kind IN ('confirmation','reminder')),
 due DOUBLE PRECISION NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','failed','skipped')),
 attempts INTEGER NOT NULL DEFAULT 0,
 lease_until DOUBLE PRECISION NOT NULL DEFAULT 0,
 claim_token TEXT, sent_at DOUBLE PRECISION, error_class TEXT,
 UNIQUE(schedule_id,recipient_email,schedule_revision,kind)
);
CREATE INDEX IF NOT EXISTS appointment_email_due ON appointment_email_jobs(state,due);
