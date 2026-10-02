-- UW Wayfinder — seed data
-- Re-runnable: locations upsert harmlessly, and simulated reports are wiped
-- and regenerated (real user reports with is_simulated = false are kept).

-- ============================================================================
-- The five halal food locations shown on the map. Coordinates are approximate
-- entrance-level points; fine-tune them here and re-run.
-- ============================================================================
INSERT INTO public.locations (id, name, category, latitude, longitude, building) VALUES
  ('shawarma-hub',   'Shawarma Hub',                    'halal', 43.47230, -80.54470, 'Student Life Centre'),
  ('mls-diner',      'ML''s Diner',                     'halal', 43.47310, -80.54290, 'Modern Languages'),
  ('v1-dining-hall', 'Village 1 Dining Hall (halal grill)', 'halal', 43.47580, -80.54650, 'Village 1'),
  ('phils-shawarma', 'Phil''s Shawarma',                'halal', 43.47150, -80.53800, ''),
  ('lazeez-shawarma','Lazeez Shawarma',                 'halal', 43.47600, -80.53750, '')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Simulated reports: ~3 weeks, one report every 15 minutes from 07:00 to
-- 23:00 Toronto time, for every halal location.
-- Pattern: lunch peak around 12:30, smaller dinner peak around 17:45,
-- quiet mornings/late evenings, weekends at 55% volume, plus random noise.
-- wait_minutes is derived as roughly queue_size * 0.8 with a little noise.
-- ============================================================================
DELETE FROM public.crowd_reports WHERE is_simulated = true;

WITH slots AS (
  SELECT
    loc.id AS location_id,
    ts,
    (ts AT TIME ZONE 'America/Toronto') AS local_ts
  FROM public.locations loc
  CROSS JOIN generate_series(
    now() - interval '21 days',
    now(),
    interval '15 minutes'
  ) AS ts
  WHERE loc.category = 'halal'
    AND EXTRACT(hour FROM ts AT TIME ZONE 'America/Toronto') BETWEEN 7 AND 22
),
shaped AS (
  SELECT
    location_id,
    ts,
    local_ts,
    -- base queue: lunch bell + dinner bell + small baseline, weekend-scaled
    GREATEST(0, ROUND(
      (
        10 * exp(-0.5 * power((EXTRACT(hour FROM local_ts) + EXTRACT(minute FROM local_ts) / 60.0 - 12.5)  / 0.9,  2))
      +  6 * exp(-0.5 * power((EXTRACT(hour FROM local_ts) + EXTRACT(minute FROM local_ts) / 60.0 - 17.75) / 0.75, 2))
      +  1
      )
      * CASE WHEN EXTRACT(isodow FROM local_ts) >= 6 THEN 0.55 ELSE 1 END
      + (random() * 4 - 2)            -- noise: +/- 2 people
    ))::int AS queue_size
  FROM slots
)
INSERT INTO public.crowd_reports (location_id, queue_size, wait_minutes, reported_at, is_simulated)
SELECT
  location_id,
  queue_size,
  GREATEST(0, ROUND((queue_size * 0.8 + (random() - 0.5))::numeric, 1)),
  ts,
  true
FROM shaped;
