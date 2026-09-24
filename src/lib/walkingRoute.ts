// Fetches a real walking path (following streets and campus footpaths)
// between two [lng, lat] points. Falls back to a straight line if the
// routing services are unavailable.

export type WalkingRoute = {
  coords: [number, number][];
  meters: number;
  /** true when the routing services failed and we fell back to a straight line */
  fallback: boolean;
};

/** Decodes Valhalla's polyline6 shape into [lng, lat] pairs. */
function decodePolyline6(str: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < str.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lng / 1e6, lat / 1e6]);
  }
  return coords;
}

async function fromValhalla(
  from: [number, number],
  to: [number, number],
): Promise<WalkingRoute | null> {
  const body = {
    locations: [
      { lat: from[1], lon: from[0] },
      { lat: to[1], lon: to[0] },
    ],
    costing: "pedestrian",
    directions_options: { units: "kilometers" },
  };
  const url =
    "https://valhalla1.openstreetmap.de/route?json=" +
    encodeURIComponent(JSON.stringify(body));
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const legs = data?.trip?.legs;
  if (!Array.isArray(legs) || legs.length === 0) return null;
  const coords: [number, number][] = [];
  for (const leg of legs) {
    if (typeof leg?.shape === "string") coords.push(...decodePolyline6(leg.shape));
  }
  if (coords.length < 2) return null;
  const km = data?.trip?.summary?.length ?? 0;
  return { coords, meters: km * 1000, fallback: false };
}

async function fromOsrm(
  from: [number, number],
  to: [number, number],
): Promise<WalkingRoute | null> {
  const url = `https://router.project-osrm.org/route/v1/foot/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const route = data?.routes?.[0];
  const coords = route?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return {
    coords: coords as [number, number][],
    meters: route.distance ?? 0,
    fallback: false,
  };
}

export async function getWalkingRoute(
  from: [number, number],
  to: [number, number],
): Promise<WalkingRoute> {
  for (const provider of [fromValhalla, fromOsrm]) {
    try {
      const route = await provider(from, to);
      if (route) return route;
    } catch {
      // try the next provider
    }
  }
  // Last resort: straight line
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(to[1] - from[1]);
  const dLng = toRad(to[0] - from[0]);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from[1])) * Math.cos(toRad(to[1])) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return { coords: [from, to], meters, fallback: true };
}
