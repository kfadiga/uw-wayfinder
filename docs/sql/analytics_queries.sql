-- UW Wayfinder — example analytics queries over the crowd data.

-- (a) Top 5 busiest hour-and-weekday slots per location, by average wait.
--     day_of_week uses isodow: 1 = Monday ... 7 = Sunday.
SELECT
  l.name,
  s.day_of_week,
  s.hour,
  ROUND(s.avg_wait, 1)  AS avg_wait_min,
  ROUND(s.avg_queue, 1) AS avg_queue,
  s.report_count
FROM public.avg_wait_by_slot s
JOIN public.locations l ON l.id = s.location_id
WHERE (s.location_id, s.avg_wait) IN (
  SELECT location_id, avg_wait
  FROM public.avg_wait_by_slot s2
  WHERE s2.location_id = s.location_id
  ORDER BY s2.avg_wait DESC
  LIMIT 5
)
ORDER BY l.name, s.avg_wait DESC;

-- (b) Average wait on weekdays vs weekends per location.
SELECT
  l.name,
  CASE WHEN EXTRACT(isodow FROM r.reported_at AT TIME ZONE 'America/Toronto') >= 6
       THEN 'weekend' ELSE 'weekday' END AS day_type,
  ROUND(AVG(r.wait_minutes), 1) AS avg_wait_min,
  COUNT(*) AS reports
FROM public.crowd_reports r
JOIN public.locations l ON l.id = r.location_id
GROUP BY l.name, day_type
ORDER BY l.name, day_type;

-- (c) The location with the shortest typical wait at 12:30 on a weekday.
--     Uses the 12:00-13:00 slot, Monday-Friday, from the historical view.
SELECT
  l.name,
  ROUND(AVG(s.avg_wait), 1) AS typical_wait_min
FROM public.avg_wait_by_slot s
JOIN public.locations l ON l.id = s.location_id
WHERE s.hour = 12
  AND s.day_of_week BETWEEN 1 AND 5
GROUP BY l.name
ORDER BY typical_wait_min ASC
LIMIT 1;
