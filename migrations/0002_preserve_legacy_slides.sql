-- The live schema retains this legacy field. Preserve it for lossless migration.
ALTER TABLE production_entries ADD COLUMN slides_sync_fit INTEGER NOT NULL DEFAULT 1 CHECK(slides_sync_fit IN (0,1));
