export interface HalalSpot {
  id: string;
  name: string;
  coords: [number, number];
  type: string;
}

export const halalSpots: HalalSpot[] = [
  {
    id: "shawarma-hub",
    name: "Shawarma Hub",
    coords: [-80.5451, 43.4717],
    type: "on-campus",
  },
  {
    id: "mls-diner",
    name: "ML's Diner",
    coords: [-80.5434, 43.4721],
    type: "on-campus",
  },
  {
    id: "v1-dining-hall",
    name: "Village 1 Dining Hall (halal grill station)",
    coords: [-80.5368, 43.4754],
    type: "on-campus",
  },
  {
    id: "phils-shawarma",
    name: "Phil's Shawarma",
    coords: [-80.5365, 43.4732],
    type: "off-campus",
  },
  {
    id: "lazeez-shawarma",
    name: "Lazeez Shawarma",
    coords: [-80.5358, 43.4718],
    type: "off-campus",
  },
];
