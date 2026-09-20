-- Additive, project-owned migration. Run under the existing booking advisory lock.
CREATE TABLE IF NOT EXISTS hokiecare.waitlist (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES hokiecare.sessions(id) ON DELETE CASCADE,
 slot_id TEXT NOT NULL REFERENCES hokiecare.slots(id), created_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('waiting','available','fulfilled','left','expired')),
 result_id TEXT REFERENCES hokiecare.appointments(id) ON DELETE SET NULL);
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_active_owner_slot ON hokiecare.waitlist(owner,slot_id)
 WHERE status IN ('waiting','available');
CREATE INDEX IF NOT EXISTS waitlist_slot_status ON hokiecare.waitlist(slot_id,status);
ALTER TABLE hokiecare.proposals ADD COLUMN IF NOT EXISTS waitlist_id TEXT
 REFERENCES hokiecare.waitlist(id) ON DELETE SET NULL;
