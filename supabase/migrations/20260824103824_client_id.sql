-- The id the phone gave a meal before the server ever saw it.
--
-- Offline logging means a meal can be sent more than once: the outbox flushes,
-- the response is lost on a bad connection, and the next flush sends it again.
-- Without something stable to key on, that is a duplicate meal and a day's
-- total that quietly reads high.
--
-- The phone mints this when the meal is captured, so it survives the queue, the
-- retry and the app being closed in between. Unique, so a second insert of the
-- same meal is rejected by the database rather than by hopeful code.
--
-- Nullable because rows written before the outbox existed have no client id,
-- and a unique index ignores nulls.
alter table meal_log add column client_id uuid;

create unique index meal_log_client_id_key on meal_log (client_id)
  where client_id is not null;
