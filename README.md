# UW Wayfinder

An interactive 3D campus map for the University of Waterloo, built with React, TypeScript, and MapLibre GL JS.

## Features

- Real OpenStreetMap building data rendered as 3D-extruded, Apple Maps-style visuals
- Search and fly-to navigation across campus buildings
- Shortest-path walking routes between buildings, computed with Dijkstra's algorithm (binary heap priority queue, Haversine distance weighting)
- Live-location halal food finder using the browser Geolocation API

## Tech Stack

- React + TypeScript
- MapLibre GL JS
- TanStack Start / TanStack Router
- Tailwind CSS

## Getting Started

```bash
npm install
npm run dev
```
