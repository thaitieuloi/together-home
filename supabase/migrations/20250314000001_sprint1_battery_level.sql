-- Sprint 1: Add battery_level to latest_locations
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/mftfgumaftkhjwlavpxh/sql

ALTER TABLE latest_locations
  ADD COLUMN IF NOT EXISTS battery_level SMALLINT DEFAULT NULL
  CHECK (battery_level IS NULL OR (battery_level >= 0 AND battery_level <= 100));

COMMENT ON COLUMN latest_locations.battery_level IS 'Device battery percentage (0–100). NULL when unknown.';
