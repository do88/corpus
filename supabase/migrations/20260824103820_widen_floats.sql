-- Widen any 4-byte float column to 8-byte.
--
-- The core schema first mapped SQLite's REAL to Postgres `real`. SQLite's REAL
-- is an 8-byte IEEE double; Postgres `real` is 4-byte, which holds about seven
-- significant digits. Across 8,886 sets that is enough to move a volume total
-- and every e1RM — a difference small enough to read as rounding and large
-- enough to fail the verification gate against Alpha 1.
--
-- The core schema migration now says `double precision`, so a database built
-- from scratch never has a `real` column and this migration finds nothing to
-- do. It exists for databases created before that fix.
--
-- A view that selects a column blocks retyping it, so the views are dropped and
-- restored around the change. Their definitions are read back out of the
-- catalog rather than repeated here, which is what makes the recreation
-- provably identical to whatever the earlier migration created.

do $$
declare
  saved  jsonb := '{}'::jsonb;
  v      record;
  col    record;
  name   text;
  widened  int := 0;
  restored int := 0;
begin
  for v in
    select viewname,
           pg_get_viewdef(format('public.%I', viewname)::regclass, true) as def
    from pg_views where schemaname = 'public'
  loop
    saved := saved || jsonb_build_object(v.viewname, v.def);
    execute format('drop view public.%I', v.viewname);
  end loop;

  -- `information_schema.columns` covers views too, so this restricts to
  -- ordinary tables ('r') — the only things that can be retyped.
  for col in
    select c.relname as table_name, a.attname as column_name
    from pg_attribute a
    join pg_class c     on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and a.attnum > 0
      and not a.attisdropped
      and a.atttypid = 'real'::regtype
  loop
    execute format(
      'alter table public.%I alter column %I type double precision',
      col.table_name, col.column_name
    );
    widened := widened + 1;
  end loop;

  for name in select jsonb_object_keys(saved)
  loop
    execute format('create view public.%I as %s', name, saved ->> name);
    -- Not carried by pg_get_viewdef, and the whole point of the option: without
    -- it a view runs with its owner's rights and reads past RLS.
    execute format('alter view public.%I set (security_invoker = true)', name);
    restored := restored + 1;
  end loop;

  raise notice 'widened % column(s), restored % view(s)', widened, restored;
end
$$;
