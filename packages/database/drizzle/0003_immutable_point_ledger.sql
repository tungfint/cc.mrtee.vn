CREATE OR REPLACE FUNCTION reject_point_transaction_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'point_transactions is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER point_transactions_immutable_trigger
BEFORE UPDATE OR DELETE ON point_transactions
FOR EACH ROW EXECUTE FUNCTION reject_point_transaction_mutation();
