-- The action journal's database functions. `installJournal` (journal.service.ts) runs this at every api start, after
-- the migrations, then puts the `zz_journal` trigger on every table the schema journals. Idempotent.

-- Capture: one row per changed row, tagged with the entry `journaled()` opened for this transaction. Outside an action
-- (REST paths, migrations, scripts) `wg.journal_entry` is unset and the trigger does nothing.
CREATE OR REPLACE FUNCTION journal_capture() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  entry text := current_setting('wg.journal_entry', true);
  b jsonb;
  a jsonb;
BEGIN
  IF entry IS NULL OR entry = '' THEN RETURN NULL; END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO journal_change (entry_id, tbl, row_id, op, before, after)
      VALUES (entry::uuid, TG_TABLE_NAME, NEW.id, 'I', NULL, to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO journal_change (entry_id, tbl, row_id, op, before, after)
      VALUES (entry::uuid, TG_TABLE_NAME, OLD.id, 'D', to_jsonb(OLD), NULL);
  ELSE
    -- Only the keys that differ: a Wound tap must not copy a character's big jsonb.
    SELECT jsonb_object_agg(o.key, o.value), jsonb_object_agg(n.key, n.value) INTO b, a
      FROM jsonb_each(to_jsonb(OLD)) o JOIN jsonb_each(to_jsonb(NEW)) n USING (key)
     WHERE o.value IS DISTINCT FROM n.value;
    IF b IS NOT NULL THEN
      INSERT INTO journal_change (entry_id, tbl, row_id, op, before, after)
        VALUES (entry::uuid, TG_TABLE_NAME, NEW.id, 'U', b, a);
    END IF;
  END IF;
  RETURN NULL;
END $fn$;
--> statement-breakpoint

-- Revert one entry's changes, newest first. Each step checks, then restores (rather than checking everything first)
-- because one action may change a row twice, and the second check must see the first change already reverted.
-- A conflict raises, which aborts the transaction, so nothing is half-undone.
-- INSERT: the row must still be exactly as inserted. UPDATE: every changed key must still hold the value the entry
-- wrote. DELETE: nothing may have taken the id since.
-- Foreign keys: Postgres journals a cascade's parent delete BEFORE its children's whatever the trigger names (the RI
-- trigger fires after every ordinary one), so plain reverse order would reinsert a child first. A step that hits a
-- foreign_key_violation is therefore retried after the others; if a whole pass gets nowhere, something later holds a
-- reference to the row and that is a conflict. Every conflict names its row: journal_conflict:<table>:<row id>.
CREATE OR REPLACE FUNCTION journal_undo(entry uuid) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  pending bigint[] := ARRAY(SELECT seq FROM journal_change WHERE entry_id = entry ORDER BY seq DESC);
  retry bigint[];
  s bigint;
  c journal_change;
  cur jsonb;
  cols text;
  progressed boolean;
  extra_tbl text;
  extra_row uuid;
  own uuid := nullif(current_setting('wg.journal_entry', true), '')::uuid; -- the undo's own entry
BEGIN
  WHILE cardinality(pending) > 0 LOOP
    retry := '{}';
    progressed := false;
    FOREACH s IN ARRAY pending LOOP
      SELECT * INTO c FROM journal_change WHERE seq = s;
      BEGIN
        EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id = $1', c.tbl) INTO cur USING c.row_id;
        IF c.op = 'I' THEN
          IF cur IS DISTINCT FROM c.after THEN RAISE EXCEPTION 'journal_conflict:%:%', c.tbl, c.row_id; END IF;
          EXECUTE format('DELETE FROM %I WHERE id = $1', c.tbl) USING c.row_id;
        ELSIF c.op = 'D' THEN
          IF cur IS NOT NULL THEN RAISE EXCEPTION 'journal_conflict:%:%', c.tbl, c.row_id; END IF;
          EXECUTE format('INSERT INTO %I SELECT * FROM jsonb_populate_record(null::%I, $1)', c.tbl, c.tbl)
            USING c.before;
        ELSE
          IF cur IS NULL OR EXISTS (
            SELECT 1 FROM jsonb_each(c.after) k WHERE cur -> k.key IS DISTINCT FROM k.value
          ) THEN RAISE EXCEPTION 'journal_conflict:%:%', c.tbl, c.row_id; END IF;
          SELECT string_agg(quote_ident(key), ', ') INTO cols FROM jsonb_object_keys(c.before) key;
          EXECUTE format(
            'UPDATE %I SET (%s) = (SELECT %s FROM jsonb_populate_record(null::%I, $1)) WHERE id = $2',
            c.tbl, cols, cols, c.tbl
          ) USING c.before, c.row_id;
        END IF;
        progressed := true;
      EXCEPTION WHEN foreign_key_violation THEN
        retry := retry || s;
      END;
    END LOOP;
    IF NOT progressed THEN
      SELECT * INTO c FROM journal_change WHERE seq = retry[1];
      RAISE EXCEPTION 'journal_conflict:%:%', c.tbl, c.row_id;
    END IF;
    pending := retry;
  END LOOP;
  -- A cascade can reach rows the entry never touched (undoing a create deletes what was added under it since). Those
  -- rows were changed by a later entry, so that is a conflict, and the error names the row for it.
  IF own IS NOT NULL THEN
    SELECT x.tbl, x.row_id INTO extra_tbl, extra_row FROM (
      SELECT tbl, row_id FROM journal_change WHERE entry_id = own
      EXCEPT SELECT tbl, row_id FROM journal_change WHERE entry_id = entry) x LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'journal_conflict:%:%', extra_tbl, extra_row; END IF;
  END IF;
END $fn$;
