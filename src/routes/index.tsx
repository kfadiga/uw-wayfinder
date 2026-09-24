import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// MapLibre's worker is copied to /assets so production builds can resolve it
// without Vite trying to bundle the worker's internal shared-module import.
maplibregl.setWorkerUrl("/assets/maplibre-gl-worker.mjs");
import type { FeatureCollection } from "geojson";
import { UW_BUILDINGS, type UWBuilding } from "@/data/buildings";
import { campusGraph } from "@/lib/campusGraph";
import { dijkstra, haversineDistance } from "@/lib/pathfinding";
import { getWalkingRoute } from "@/lib/walkingRoute";
import { halalSpots } from "@/lib/halalSpots";

const ROUTE_NODE_IDS = new Set(Object.keys(campusGraph));

function nodeIdFor(building: UWBuilding): string | null {
  const id = `${building.code.toLowerCase()}-entrance`;
  return ROUTE_NODE_IDS.has(id) ? id : null;
}

const EMPTY_ROUTE: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UW Wayfinder — University of Waterloo 3D Campus Map" },
      {
        name: "description",
        content:
          "Explore the University of Waterloo campus in 3D. Search buildings, tilt the map, and fly to lecture halls, libraries, and labs with UW Wayfinder.",
      },
      { property: "og:title", content: "UW Wayfinder — University of Waterloo 3D Campus Map" },
      {
        property: "og:description",
        content:
          "Explore the University of Waterloo campus in 3D. Search buildings and fly across campus with UW Wayfinder.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const UW_CENTER: [number, number] = [-80.5449, 43.4723];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function Index() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [query, setQueryState] = useState("");
  const suppressSearch = useRef(false);

  const setQuery = (value: string, suppress = false) => {
    suppressSearch.current = suppress;
    setQueryState(value);
  };
  const [results, setResults] = useState<UWBuilding[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedName, setSelectedName] = useState("");

  // Routing state
  const nodeMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const [startId, setStartId] = useState<string | null>(null);
  const [endId, setEndId] = useState<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ meters: number; minutes: number } | null>(null);

  // Halal spots state
  const halalMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [showHalal, setShowHalal] = useState(false);
  const [halalInfo, setHalalInfo] = useState<{ name: string; meters: number; minutes: number } | null>(null);

  // Geolocation state
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userLocationRef = useRef<[number, number] | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [locating, setLocating] = useState(false);

  const [routing, setRouting] = useState(false);
  const animationRef = useRef<number | null>(null);

  const drawRoute = (coords: [number, number][]) => {
    const map = mapRef.current;
    if (!map) return;
    const data: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: coords },
        },
      ],
    };
    const source = map.getSource<maplibregl.GeoJSONSource>("uw-route");
    if (source) {
      source.setData(data);
    } else {
      map.addSource("uw-route", { type: "geojson", data });
      map.addLayer({
        id: "uw-route-casing",
        type: "line",
        source: "uw-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 8, 18, 16],
          "line-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "uw-route-line",
        type: "line",
        source: "uw-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#007aff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 5, 18, 11],
        },
      });
    }
  };

  /** Progressively reveals the line, Google-Maps style. */
  const animateRoute = (
    coords: [number, number][],
    draw: (c: [number, number][]) => void,
  ) => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    if (coords.length < 2) {
      draw(coords);
      return;
    }
    const duration = 700;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const count = Math.max(2, Math.ceil(eased * coords.length));
      draw(coords.slice(0, count));
      if (t < 1) {
        animationRef.current = requestAnimationFrame(step);
      } else {
        animationRef.current = null;
        draw(coords);
      }
    };
    animationRef.current = requestAnimationFrame(step);
  };

  const highlightNode = (id: string, cls: "is-start" | "is-end", on: boolean) => {
    const marker = nodeMarkersRef.current.get(id);
    marker?.getElement().classList.toggle(cls, on);
  };

  const clearRoute = () => {
    if (startId) highlightNode(startId, "is-start", false);
    if (endId) highlightNode(endId, "is-end", false);
    setStartId(null);
    setEndId(null);
    setRouteInfo(null);
    setRouting(false);
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    const source = mapRef.current?.getSource<maplibregl.GeoJSONSource>("uw-route");
    source?.setData(EMPTY_ROUTE);
  };

  const routeRequestRef = useRef(0);

  /** Picks start, then end. A third pick starts a fresh selection. */
  const selectRouteNode = (id: string) => {
    if (startId && endId) {
      clearRoute();
      setStartId(id);
      highlightNode(id, "is-start", true);
      return;
    }
    if (!startId) {
      setStartId(id);
      highlightNode(id, "is-start", true);
      return;
    }
    if (id === startId) return;
    setEndId(id);
    highlightNode(id, "is-end", true);
  };

  const findRoute = () => {
    if (!startId || !endId) return;
    const route = dijkstra(campusGraph, startId, endId);
    if (!route) return;
    const from = route.coords[0];
    const to = route.coords[route.coords.length - 1];
    if (!from || !to) return;
    setRouting(true);
    const requestId = ++routeRequestRef.current;
    void getWalkingRoute(from, to)
      .then((walk) => {
        if (requestId !== routeRequestRef.current) return;
        const coords = walk.fallback ? route.coords : walk.coords;
        const meters = walk.fallback ? route.distanceMeters : walk.meters;
        animateRoute(coords as [number, number][], drawRoute);
        setRouteInfo({
          meters: Math.round(meters),
          minutes: Math.max(1, Math.round(meters / 80)),
        });
      })
      .catch(() => {
        if (requestId !== routeRequestRef.current) return;
        animateRoute(route.coords, drawRoute);
        setRouteInfo({
          meters: Math.round(route.distanceMeters),
          minutes: Math.max(1, Math.round(route.distanceMeters / 80)),
        });
      })
      .finally(() => {
        if (requestId === routeRequestRef.current) setRouting(false);
      });
  };

  const selectRouteNodeRef = useRef(selectRouteNode);
  selectRouteNodeRef.current = selectRouteNode;

  const drawHalalRoute = (coords: [number, number][]) => {
    const map = mapRef.current;
    if (!map) return;
    const data: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: coords },
        },
      ],
    };
    const source = map.getSource<maplibregl.GeoJSONSource>("uw-halal-route");
    if (source) {
      source.setData(data);
    } else {
      map.addSource("uw-halal-route", { type: "geojson", data });
      map.addLayer({
        id: "uw-halal-route-casing",
        type: "line",
        source: "uw-halal-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 7, 18, 14],
          "line-opacity": 0.85,
        },
      });
      map.addLayer({
        id: "uw-halal-route-line",
        type: "line",
        source: "uw-halal-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#34c759",
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 4.5, 18, 9],
          "line-dasharray": [2, 1.5],
        },
      });
    }
  };

  const clearHalalRoute = () => {
    setHalalInfo(null);
    const source = mapRef.current?.getSource<maplibregl.GeoJSONSource>("uw-halal-route");
    source?.setData(EMPTY_ROUTE);
  };

  const halalRequestRef = useRef(0);

  const onHalalSpotClick = (spot: (typeof halalSpots)[number]) => {
    const from = userLocationRef.current;
    if (!from) {
      setLocationError(true);
      return;
    }
    const meters = haversineDistance(from, spot.coords);
    drawHalalRoute([from, spot.coords]);
    setHalalInfo({
      name: spot.name,
      meters: Math.round(meters),
      minutes: Math.round(meters / 80),
    });
    const requestId = ++halalRequestRef.current;
    void getWalkingRoute(from, spot.coords).then((walk) => {
      if (requestId !== halalRequestRef.current) return;
      if (walk.fallback) return;
      animateRoute(walk.coords, drawHalalRoute);
      setHalalInfo({
        name: spot.name,
        meters: Math.round(walk.meters),
        minutes: Math.max(1, Math.round(walk.meters / 80)),
      });
    });
  };
  const onHalalSpotClickRef = useRef(onHalalSpotClick);
  onHalalSpotClickRef.current = onHalalSpotClick;

  const addHalalMarkers = () => {
    const map = mapRef.current;
    if (!map) return;
    for (const spot of halalSpots) {
      const el = document.createElement("div");
      el.className = "uw-halal";
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `Route to ${spot.name}`);
      el.title = `${spot.name} (${spot.type})`;
      el.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>';
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(spot.coords)
        .addTo(map);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onHalalSpotClickRef.current(spot);
      });
      halalMarkersRef.current.push(marker);
    }
  };

  const removeHalalMarkers = () => {
    for (const marker of halalMarkersRef.current) marker.remove();
    halalMarkersRef.current = [];
    clearHalalRoute();
  };

  const toggleHalal = () => {
    if (showHalal) {
      removeHalalMarkers();
      setShowHalal(false);
    } else {
      addHalalMarkers();
      setShowHalal(true);
    }
  };

  const requestLocation = () => {
    if (!("geolocation" in navigator)) {
      setLocationError(true);
      return;
    }
    setLocating(true);
    setLocationError(false);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const coords: [number, number] = [
          position.coords.longitude,
          position.coords.latitude,
        ];
        userLocationRef.current = coords;
        const map = mapRef.current;
        if (!map) return;
        if (!userMarkerRef.current) {
          const el = document.createElement("div");
          el.className = "uw-user";
          userMarkerRef.current = new maplibregl.Marker({ element: el })
            .setLngLat(coords)
            .addTo(map);
        } else {
          userMarkerRef.current.setLngLat(coords);
        }
        map.flyTo({ center: coords, zoom: 16.5, speed: 1.4, essential: true });
      },
      () => {
        setLocating(false);
        setLocationError(true);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: UW_CENTER,
      zoom: 15.8,
      pitch: 55,
      bearing: -12,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );
    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "bottom-right",
    );

    map.on("load", () => {
      const style = map.getStyle();
      const labelLayerId = style.layers?.find(
        (layer: maplibregl.LayerSpecification) =>
          layer.type === "symbol" &&
          (layer as maplibregl.SymbolLayerSpecification).layout?.[
            "text-field"
          ],
      )?.id;

      if (map.getLayer("building-extrusion")) return;

      map.addLayer(
        {
          id: "building-extrusion",
          type: "fill-extrusion",
          source: "openmaptiles",
          "source-layer": "building",
          minzoom: 14,
          filter: ["!=", ["get", "hide_3d"], true],
          paint: {
            "fill-extrusion-color": [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "render_height"], 0],
              0,
              "hsl(35, 18%, 82%)",
              40,
              "hsl(28, 30%, 66%)",
            ],
            "fill-extrusion-height": [
              "interpolate",
              ["linear"],
              ["zoom"],
              14,
              0,
              14.5,
              ["coalesce", ["get", "render_height"], 10],
            ],
            "fill-extrusion-base": [
              "interpolate",
              ["linear"],
              ["zoom"],
              14,
              0,
              14.5,
              ["coalesce", ["get", "render_min_height"], 0],
            ],
            "fill-extrusion-opacity": 0.92,
          },
        },
        labelLayerId,
      );

      // Permanent clickable markers for the 12 routable buildings.
      for (const building of UW_BUILDINGS) {
        const id = nodeIdFor(building);
        if (!id) continue;
        const el = document.createElement("div");
        el.className = "uw-node";
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", `Set ${building.name} as route point`);
        el.title = building.name;
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([building.lng, building.lat])
          .addTo(map);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          selectRouteNodeRef.current(id);
        });
        nodeMarkersRef.current.set(id, marker);
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (suppressSearch.current) {
      suppressSearch.current = false;
      setResults([]);
      setActiveIndex(-1);
      return;
    }
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setActiveIndex(-1);
      return;
    }
    const nq = normalize(trimmed);
    const matches = UW_BUILDINGS.filter(
      (b) =>
        normalize(b.name).includes(nq) || normalize(b.code).startsWith(nq),
    ).slice(0, 8);
    setResults(matches);
    setActiveIndex(matches.length ? 0 : -1);
  }, [query]);

  const flyTo = (building: UWBuilding) => {
    const map = mapRef.current;
    if (!map) return;

    markerRef.current?.remove();
    const popup = new maplibregl.Popup({
      offset: 28,
      closeButton: true,
      className: "uw-popup",
    }).setHTML(
      `<div class="uw-popup-inner"><span class="uw-popup-code">${building.code}</span><span class="uw-popup-name">${building.name}</span></div>`,
    );

    const el = document.createElement("div");
    el.className = "uw-marker";

    markerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([building.lng, building.lat])
      .setPopup(popup)
      .addTo(map);

    map.flyTo({
      center: [building.lng, building.lat],
      zoom: 17.4,
      pitch: 60,
      speed: 1.4,
      curve: 1.6,
      essential: true,
    });

    map.once("moveend", () => {
      markerRef.current?.togglePopup();
    });

    setQuery(building.name, true);
    setSelectedName(building.name);
    setResults([]);
    setActiveIndex(-1);

    const id = nodeIdFor(building);
    if (id) selectRouteNode(id);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const selected = results[activeIndex];
      if (selected) flyTo(selected);
    } else if (event.key === "Escape") {
      setResults([]);
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      <div ref={mapContainer} className="uw-map" />

      <div className="absolute left-4 top-4 z-10 w-[min(92vw,22rem)]">
        <div className="rounded-2xl border border-border/60 bg-card/90 shadow-xl shadow-black/10 backdrop-blur-md">
          <div className="border-b border-border/60 px-4 pb-3 pt-4">
            <h1 className="text-base font-semibold tracking-tight text-card-foreground">
              UW Wayfinder
            </h1>
            <p className="text-xs text-muted-foreground">
              University of Waterloo campus map
            </p>
          </div>

          <div className="p-3">
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedName("");
                }}
                onKeyDown={onKeyDown}
                placeholder="Search buildings (e.g. Davis Centre, MC, E7)…"
                aria-label="Search campus buildings"
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls="uw-search-results"
                aria-activedescendant={
                  activeIndex >= 0 ? `uw-result-${activeIndex}` : undefined
                }
                className="w-full rounded-xl border border-input bg-background/80 py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={toggleHalal}
                aria-pressed={showHalal}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                  showHalal
                    ? "border-[#34c759]/50 bg-[#34c759]/15 text-[#1e7d38]"
                    : "border-input bg-background/80 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
                  <path d="M7 2v20" />
                  <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
                </svg>
                Halal Food
              </button>
              <button
                type="button"
                onClick={requestLocation}
                disabled={locating}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-input bg-background/80 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v3" />
                  <path d="M12 19v3" />
                  <path d="M2 12h3" />
                  <path d="M19 12h3" />
                </svg>
                {locating ? "Locating…" : "Find my location"}
              </button>
            </div>

            {locationError && (
              <p className="mt-2 rounded-xl border border-border/60 bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
                Location unavailable — enable location access to see directions.
              </p>
            )}

            {halalInfo && (
              <div className="mt-2 rounded-xl border border-border/60 bg-muted/60 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">
                    {halalInfo.name}: {halalInfo.meters} m · ~{halalInfo.minutes} min walk
                  </p>
                  <button
                    type="button"
                    onClick={clearHalalRoute}
                    aria-label="Clear halal route"
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {results.length > 0 && (
              <ul
                id="uw-search-results"
                role="listbox"
                className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-border/60 bg-popover/95"
              >
                {results.map((building, i) => (
                  <li key={building.code + building.name} role="presentation">
                    <button
                      id={`uw-result-${i}`}
                      role="option"
                      aria-selected={i === activeIndex}
                      onClick={() => flyTo(building)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        i === activeIndex ? "bg-accent" : ""
                      }`}
                    >
                      <span className="flex h-8 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                        {building.code}
                      </span>
                      <span className="truncate text-sm text-popover-foreground">
                        {building.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {query.trim() && results.length === 0 && query !== selectedName && (
              <p className="mt-2 rounded-xl border border-border/60 bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
                No buildings match “{query.trim()}”.
              </p>
            )}

            {(startId || routeInfo) && (
              <div className="mt-2 rounded-xl border border-border/60 bg-muted/60 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">
                    {routeInfo
                      ? `${routeInfo.meters} m · ~${routeInfo.minutes} min walk`
                      : endId
                        ? "Start and destination set"
                        : "Start set — pick a destination"}
                  </p>
                  <button
                    type="button"
                    onClick={clearRoute}
                    aria-label="Clear route"
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                    Clear route
                  </button>
                </div>
                {startId && endId && (
                  <button
                    type="button"
                    onClick={findRoute}
                    disabled={routing}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#007aff] px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {routing ? "Finding route…" : routeInfo ? "Redo route" : "Find route"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
