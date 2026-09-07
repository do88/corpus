-- Historical values stay unknown; adding a metric must not rewrite old estimates.
alter table meal_log add column fiber_g double precision
  check (fiber_g >= 0 and fiber_g < 'Infinity'::double precision);
alter table saved_food add column fiber_g double precision
  check (fiber_g >= 0 and fiber_g < 'Infinity'::double precision);

comment on column meal_log.fiber_g is 'Dietary fibre in grams. NULL means unknown, including meals logged before fibre tracking.';
comment on column saved_food.fiber_g is 'Dietary fibre in grams for the saved portion. NULL means unknown.';
