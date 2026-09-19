-- Run only as the project owner, never using the web application's role.
CREATE SCHEMA IF NOT EXISTS hokiecare;
SET search_path=hokiecare,pg_catalog;
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,expires DOUBLE PRECISION NOT NULL);
CREATE TABLE IF NOT EXISTS slots (
 id TEXT PRIMARY KEY,center_id TEXT NOT NULL,starts TEXT NOT NULL,ends TEXT NOT NULL,
 service_id TEXT NOT NULL DEFAULT 'cook-counseling',
 resource_id TEXT NOT NULL DEFAULT 'cook-counseling-demo-resource',version INTEGER NOT NULL DEFAULT 2,
 CHECK(starts<ends));
ALTER TABLE slots DROP CONSTRAINT IF EXISTS slots_center_id_starts_resource_id_key;
CREATE TABLE IF NOT EXISTS appointments (
 id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 slot_id TEXT NOT NULL REFERENCES slots(id),status TEXT NOT NULL CHECK(status IN ('reserved','cancelled')),
 request_id TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(owner,request_id));
CREATE UNIQUE INDEX IF NOT EXISTS one_reservation ON appointments(slot_id) WHERE status='reserved';
CREATE TABLE IF NOT EXISTS proposals (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 slot_id TEXT NOT NULL REFERENCES slots(id), version INTEGER NOT NULL, request_id TEXT NOT NULL,
 expires DOUBLE PRECISION NOT NULL, operation TEXT NOT NULL, appointment_id TEXT, result_id TEXT,
 UNIQUE(owner, request_id));
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS original_slot_id TEXT;
CREATE TABLE IF NOT EXISTS agent_tasks (
 owner TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,state TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS outbox_events (
 id BIGSERIAL PRIMARY KEY,service_id TEXT NOT NULL,day TEXT NOT NULL,kind TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text);
CREATE INDEX IF NOT EXISTS events_scope ON outbox_events(service_id,id);
CREATE INDEX IF NOT EXISTS slot_intervals ON slots(resource_id,starts,ends);
CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY);
INSERT INTO schema_version VALUES (2) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION protect_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(72489103);
 IF NEW.status='reserved' AND EXISTS (
   SELECT 1 FROM appointments a JOIN slots s ON a.slot_id=s.id JOIN slots t ON t.id=NEW.slot_id
   WHERE a.id<>NEW.id AND a.status='reserved' AND (s.resource_id=t.resource_id OR a.owner=NEW.owner)
     AND s.starts<t.ends AND s.ends>t.starts) THEN
   RAISE EXCEPTION 'reservation_overlap' USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER protect_interval BEFORE INSERT OR UPDATE ON appointments
 FOR EACH ROW EXECUTE FUNCTION protect_reservation();

CREATE OR REPLACE FUNCTION publish_availability() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_OP='UPDATE' THEN
   INSERT INTO outbox_events(service_id,day,kind)
     SELECT service_id,substr(starts,1,10),'availability_changed' FROM slots WHERE id=OLD.slot_id;
 END IF;
 IF TG_OP='INSERT' OR TG_OP='UPDATE' THEN
   INSERT INTO outbox_events(service_id,day,kind)
     SELECT service_id,substr(starts,1,10),'availability_changed' FROM slots WHERE id=NEW.slot_id;
 END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER availability_event AFTER INSERT OR UPDATE OR DELETE ON appointments
 FOR EACH ROW EXECUTE FUNCTION publish_availability();
