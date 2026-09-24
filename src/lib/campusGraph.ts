import { CampusGraph } from "./pathfinding";

// Complete graph (K12) over the 12 building entrance nodes.
// Every building node is directly connected to every other building node,
// so dijkstra() can route between any pair. Edge weights come from the
// Haversine distance between entrance coordinates inside pathfinding.ts.
export const campusGraph: CampusGraph = {
  "dc-entrance": {
    id: "dc-entrance",
    coords: [-80.54275, 43.47268],
    neighbors: [
      "mc-entrance", "slc-entrance", "dp-entrance", "e7-entrance",
      "pac-entrance", "m3-entrance", "e5-entrance", "e6-entrance",
      "rch-entrance", "ev3-entrance", "rev-entrance",
    ],
  },
  "mc-entrance": {
    id: "mc-entrance",
    coords: [-80.54412, 43.47235],
    neighbors: [
      "dc-entrance", "slc-entrance", "dp-entrance", "e7-entrance",
      "pac-entrance", "m3-entrance", "e5-entrance", "e6-entrance",
      "rch-entrance", "ev3-entrance", "rev-entrance",
    ],
  },
  "slc-entrance": {
    id: "slc-entrance",
    coords: [-80.54519, 43.47167],
    neighbors: [
      "dc-entrance", "mc-entrance", "dp-entrance", "e7-entrance",
      "pac-entrance", "m3-entrance", "e5-entrance", "e6-entrance",
      "rch-entrance", "ev3-entrance", "rev-entrance",
    ],
  },
  "dp-entrance": {
    id: "dp-entrance",
    coords: [-80.54134, 43.46985],
    neighbors: [
      "dc-entrance", "mc-entrance", "slc-entrance", "e7-entrance",
      "pac-entrance", "m3-entrance", "e5-entrance", "e6-entrance",
      "rch-entrance", "ev3-entrance", "rev-entrance",
    ],
  },
  "e7-entrance": {
    id: "e7-entrance",
    coords: [-80.53995, 43.47202],
    neighbors: [
      "dc-entrance", "mc-entrance", "slc-entrance", "dp-entrance",
      "pac-entrance", "m3-entrance", "e5-entrance", "e6-entrance",
      "rch-entrance", "ev3-entrance", "rev-entrance",
    ],
  },
  "pac-entrance": {
    id: "pac-entrance",
    coords: [-80.54645, 43.47292],
    neighbors: [
      "dc-entrance", "mc-entrance", "slc-entrance", "dp-entrance",
      "e7-entrance", "m3-entrance", "e5-entrance", "e6-entrance",
      "rch-entrance", "ev3-entrance", "rev-entrance",
    ],
  },
  "m3-entrance": {
    id: "m3-entrance",
    coords: [-80.54449, 43.47345],
    neighbors: [
      "dc-entrance", "mc-entrance", "slc-entrance", "dp-entrance",
      "e7-entrance", "pac-entrance", "e5-entrance", "e6-entrance",
      "rch-entrance", "ev3-entrance", "rev-entrance",
    ],
  },
  "e5-entrance": {
    id: "e5-entrance",
    coords: [-80.54048, 43.47186],
    neighbors: [
      "dc-entrance", "mc-entrance", "slc-entrance", "dp-entrance",
      "e7-entrance", "pac-entrance", "m3-entrance", "e6-entrance",
      "rch-entrance", "ev3-entrance", "rev-entrance",
    ],
  },
  "e6-entrance": {
    id: "e6-entrance",
    coords: [-80.53993, 43.47128],
    neighbors: [
      "dc-entrance", "mc-entrance", "slc-entrance", "dp-entrance",
      "e7-entrance", "pac-entrance", "m3-entrance", "e5-entrance",
      "rch-entrance", "ev3-entrance", "rev-entrance",
    ],
  },
  "rch-entrance": {
    id: "rch-entrance",
    coords: [-80.54207, 43.47046],
    neighbors: [
      "dc-entrance", "mc-entrance", "slc-entrance", "dp-entrance",
      "e7-entrance", "pac-entrance", "m3-entrance", "e5-entrance",
      "e6-entrance", "ev3-entrance", "rev-entrance",
    ],
  },
  "ev3-entrance": {
    id: "ev3-entrance",
    coords: [-80.54358, 43.46865],
    neighbors: [
      "dc-entrance", "mc-entrance", "slc-entrance", "dp-entrance",
      "e7-entrance", "pac-entrance", "m3-entrance", "e5-entrance",
      "e6-entrance", "rch-entrance", "rev-entrance",
    ],
  },
  "rev-entrance": {
    id: "rev-entrance",
    coords: [-80.53866, 43.47527],
    neighbors: [
      "dc-entrance", "mc-entrance", "slc-entrance", "dp-entrance",
      "e7-entrance", "pac-entrance", "m3-entrance", "e5-entrance",
      "e6-entrance", "rch-entrance", "ev3-entrance",
    ],
  },
};
