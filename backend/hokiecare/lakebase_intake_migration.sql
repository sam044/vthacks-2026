-- Additive migration, run as HokieCare project owner.
SET search_path=hokiecare,pg_catalog;
SELECT pg_advisory_xact_lock(72489103);
ALTER TABLE slots ADD COLUMN IF NOT EXISTS local_date TEXT;
ALTER TABLE slots ADD COLUMN IF NOT EXISTS blocked_until TEXT;
ALTER TABLE slots ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS booking_name TEXT NOT NULL DEFAULT '';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS record_origin TEXT NOT NULL DEFAULT 'user_created';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS retain_until DOUBLE PRECISION;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS seed_batch TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS booking_name TEXT NOT NULL DEFAULT '';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS intake_key TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'visitor';
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS expires DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS calendar_dates (
 day TEXT PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL, day_of_month INTEGER NOT NULL,
 weekday INTEGER NOT NULL, term TEXT NOT NULL, exclusion_reason TEXT);
CREATE TABLE IF NOT EXISTS seed_batches (
 id TEXT PRIMARY KEY, seed INTEGER NOT NULL, version INTEGER NOT NULL, manifest TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS slots_by_day ON slots(service_id,local_date,active);
CREATE INDEX IF NOT EXISTS appointment_slot_status ON appointments(slot_id,status);
CREATE INDEX IF NOT EXISTS appointment_owner_status ON appointments(owner,status);
UPDATE slots SET blocked_until=ends,local_date=substr(starts,1,10) WHERE blocked_until IS NULL;
UPDATE agent_tasks SET expires=EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)+86400 WHERE expires IS NULL;
CREATE OR REPLACE FUNCTION protect_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(72489103);
 IF NEW.status='reserved' AND EXISTS (
   SELECT 1 FROM appointments a JOIN slots s ON a.slot_id=s.id JOIN slots t ON t.id=NEW.slot_id
   WHERE a.id<>NEW.id AND a.status='reserved' AND (s.resource_id=t.resource_id OR a.owner=NEW.owner)
     AND s.starts<COALESCE(t.blocked_until,t.ends) AND COALESCE(s.blocked_until,s.ends)>t.starts) THEN
   RAISE EXCEPTION 'reservation_overlap' USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END $$;
INSERT INTO schema_version VALUES(3) ON CONFLICT DO NOTHING;
CREATE OR REPLACE TRIGGER availability_event AFTER INSERT OR UPDATE OF slot_id,status OR DELETE ON appointments
 FOR EACH ROW EXECUTE FUNCTION publish_availability();
