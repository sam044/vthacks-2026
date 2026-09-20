-- Keep all slot IDs, visit times, appointments, and waitlist memberships.
SET search_path=hokiecare,pg_catalog;
SELECT pg_advisory_xact_lock(72489103);
UPDATE slots SET blocked_until=ends WHERE blocked_until IS DISTINCT FROM ends;
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
INSERT INTO schema_version VALUES(5) ON CONFLICT DO NOTHING;
