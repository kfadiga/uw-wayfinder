-- UW Wayfinder — crowd & wait-time backend schema
-- Run order matters: tables -> grants -> RLS -> policies -> view -> function.

-- ============================================================================
-- locations: one row per mappable place (halal food spots today; washrooms,
-- water fountains and study spaces can join later). `building` is blank for
-- off-campus spots.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.locations (
  id        text PRIMARY KEY,
  name      text NOT NULL,
  category  text NOT NULL,
  latitude  double precision NOT NULL,
  longitude double precision NOT NULL,
  building  text NOT NULL DEFAULT ''
);

-- Grants: the Data API does not grant public-schema privileges by default.
-- Locations are read-only for everyone; writes go through a privileged role.
GRANT SELECT ON public.locations TO anon;
GRANT SELECT ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- Anyone (signed in or not) can read locations.
CREATE POLICY "Anyone can read locations"
  ON public.locations FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================================================
-- crowd_reports: one row per "how busy is it" report. queue_size 0-100,
-- wait_minutes optional 0-120. is_simulated marks generated seed data so it
-- can be wiped and regenerated without touching real user reports.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.crowd_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id  text NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  queue_size   integer NOT NULL CHECK (queue_size BETWEEN 0 AND 100),
  wait_minutes numeric CHECK (wait_minutes BETWEEN 0 AND 120),
  reported_at  timestamptz NOT NULL DEFAULT now(),
  is_simulated boolean NOT NULL DEFAULT false
);

-- Speeds up "recent reports for this spot" and the per-slot aggregates.
CREATE INDEX IF NOT EXISTS crowd_reports_location_time_idx
  ON public.crowd_reports (location_id, reported_at);

-- Anyone can read and submit reports; nobody can edit or delete them.
GRANT SELECT, INSERT ON public.crowd_reports TO anon;
GRANT SELECT, INSERT ON public.crowd_reports TO authenticated;
GRANT ALL ON public.crowd_reports TO service_role;

ALTER TABLE public.crowd_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read crowd reports"
  ON public.crowd_reports FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can submit a crowd report"
  ON public.crowd_reports FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Deliberately no UPDATE or DELETE policies: reports are append-only.

-- ============================================================================
-- avg_wait_by_slot: average wait and queue per location, grouped by day of
-- week (isodow: 1=Mon .. 7=Sun) and hour, in the America/Toronto timezone.
-- security_invoker so it respects the caller's RLS on crowd_reports.
-- ============================================================================
CREATE OR REPLACE VIEW public.avg_wait_by_slot
WITH (security_invoker = true) AS
SELECT
  location_id,
  EXTRACT(isodow FROM reported_at AT TIME ZONE 'America/Toronto')::int AS day_of_week,
  EXTRACT(hour   FROM reported_at AT TIME ZONE 'America/Toronto')::int AS hour,
  AVG(wait_minutes) AS avg_wait,
  AVG(queue_size)   AS avg_queue,
  COUNT(*)          AS report_count
FROM public.crowd_reports
GROUP BY 1, 2, 3;

-- ============================================================================
-- get_wait_estimate(loc_id): the estimate shown in marker popups.
--   'live'       -> average of reports from the last 15 minutes
--   'historical' -> avg_wait_by_slot for the current weekday + hour
-- Returns no row when neither exists (the UI shows "No data right now").
-- confidence = how many reports the number is based on.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_wait_estimate(loc_id text)
RETURNS TABLE(avg_wait numeric, source text, confidence bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH live AS (
    SELECT AVG(wait_minutes) AS w, COUNT(*) AS n
    FROM crowd_reports
    WHERE location_id = loc_id
      AND reported_at > now() - interval '15 minutes'
  ),
  hist AS (
    SELECT s.avg_wait AS w, s.report_count AS n
    FROM avg_wait_by_slot s
    WHERE s.location_id = loc_id
      AND s.day_of_week = EXTRACT(isodow FROM now() AT TIME ZONE 'America/Toronto')::int
      AND s.hour        = EXTRACT(hour   FROM now() AT TIME ZONE 'America/Toronto')::int
  )
  SELECT w, 'live'::text, n FROM live WHERE n > 0
  UNION ALL
  SELECT w, 'historical'::text, n FROM hist
  LIMIT 1;
$$;
