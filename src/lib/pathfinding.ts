// @ts-nocheck

export type LngLat = [number, number]; // [longitude, latitude]

export interface GraphNode {
  id: string;
  coords: LngLat;
  neighbors: string[]; // ids of directly connected nodes
}

export type CampusGraph = Record<string, GraphNode>;

export interface RouteResult {
  path: string[];
  coords: LngLat[];
  distanceMeters: number;
}

export function haversineDistance(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

class MinHeap<T> {
  private heap: { priority: number; value: T }[] = [];

  push(value: T, priority: number) {
    this.heap.push({ priority, value });
    let i = this.heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent].priority <= this.heap[i].priority) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      let i = 0;
      const n = this.heap.length;
      while (true) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        let smallest = i;
        if (left < n && this.heap[left].priority < this.heap[smallest].priority) smallest = left;
        if (right < n && this.heap[right].priority < this.heap[smallest].priority) smallest = right;
        if (smallest === i) break;
        [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
        i = smallest;
      }
    }
    return top.value;
  }

  get isEmpty() {
    return this.heap.length === 0;
  }
}

export function dijkstra(
  graph: CampusGraph,
  startId: string,
  endId: string
): RouteResult | null {
  if (!graph[startId] || !graph[endId]) {
    console.warn("dijkstra: start or end node not found in graph");
    return null;
  }

  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const visited = new Set<string>();
  const queue = new MinHeap<string>();

  for (const id in graph) {
    distances[id] = Infinity;
    previous[id] = null;
  }

  distances[startId] = 0;
  queue.push(startId, 0);

  while (!queue.isEmpty) {
    const currentId = queue.pop()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    if (currentId === endId) break;

    const current = graph[currentId];
    for (const neighborId of current.neighbors) {
      const neighbor = graph[neighborId];
      if (!neighbor || visited.has(neighborId)) continue;

      const edgeWeight = haversineDistance(current.coords, neighbor.coords);
      const candidateDist = distances[currentId] + edgeWeight;

      if (candidateDist < distances[neighborId]) {
        distances[neighborId] = candidateDist;
        previous[neighborId] = currentId;
        queue.push(neighborId, candidateDist);
      }
    }
  }

  if (distances[endId] === Infinity) {
    return null;
  }

  const path: string[] = [];
  let node: string | null = endId;
  while (node !== null) {
    path.unshift(node);
    node = previous[node];
  }

  return {
    path,
    coords: path.map((id) => graph[id].coords),
    distanceMeters: distances[endId],
  };
}
