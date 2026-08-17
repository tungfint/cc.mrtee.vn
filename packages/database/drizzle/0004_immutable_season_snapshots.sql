CREATE OR REPLACE FUNCTION reject_season_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'season_user_snapshots are immutable after creation'
    USING ERRCODE = 'P0001';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER season_user_snapshots_reject_update
BEFORE UPDATE ON season_user_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_season_snapshot_mutation();
--> statement-breakpoint
CREATE TRIGGER season_user_snapshots_reject_delete
BEFORE DELETE ON season_user_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_season_snapshot_mutation();
