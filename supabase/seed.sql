-- Two demo drivers with distinct preferences. Idempotent: safe to run again.
insert into public.drivers (slug, display_name, gender, avatar) values
  ('daniel', 'Daniel', 'male', 'daniel'),
  ('sophia', 'Sophia', 'female', 'sophia')
on conflict (slug) do update set display_name = excluded.display_name, gender = excluded.gender, avatar = excluded.avatar;

insert into public.driver_preferences (driver_id, key, value, source)
select d.id, p.key, p.value::jsonb, 'seed'
from public.drivers d
join (values
  ('daniel', 'temperature_c', '22'),
  ('daniel', 'seat_heating', '1'),
  ('daniel', 'driving_mode', '"comfort"'),
  ('daniel', 'ambient_color', '"#5AA9FF"'),
  ('daniel', 'ambient_brightness', '70'),
  ('daniel', 'music_volume', '35'),
  ('sophia', 'temperature_c', '19.5'),
  ('sophia', 'seat_heating', '0'),
  ('sophia', 'driving_mode', '"sport"'),
  ('sophia', 'ambient_color', '"#FF5A8A"'),
  ('sophia', 'ambient_brightness', '85'),
  ('sophia', 'music_volume', '55')
) as p (slug, key, value) on p.slug = d.slug
on conflict (driver_id, key) do nothing;

insert into public.memories (driver_id, category, content)
select d.id, m.category, m.content
from public.drivers d
join (values
  ('daniel', 'profile', 'Prefers to be called Dan.'),
  ('daniel', 'preference', 'Likes a warm cabin on cold mornings.'),
  ('sophia', 'profile', 'Prefers metric units and short answers.'),
  ('sophia', 'preference', 'Enjoys sporty driving and upbeat music.')
) as m (slug, category, content) on m.slug = d.slug
where not exists (select 1 from public.memories x where x.driver_id = d.id and x.content = m.content);
