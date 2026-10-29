/**
 * はしご酒ルートの地図表示（店舗の順番の番号と、経路または直線の線）。
 */
import type { CircleLayerSpecification, LineLayerSpecification, SymbolLayerSpecification } from 'maplibre-gl';
import type { RoutePoint } from '../../domain/route';

export const ROUTE_LINE_SOURCE_ID = 'atlas-route-line';
export const ROUTE_STOP_SOURCE_ID = 'atlas-route-stops';

export const ROUTE_LAYER_IDS = {
  lineStraight: 'atlas-route-line-straight',
  lineRouted: 'atlas-route-line-routed',
  stopHalo: 'atlas-route-stop-halo',
  stopNumbers: 'atlas-route-stop-numbers',
} as const;

export const ROUTE_COLOR = '#4fc3f7';
export const MAX_NUMBER_ICONS = 20;

export type RouteLineKind = 'straight' | 'routed';

export type RouteLineCollection = GeoJSON.FeatureCollection<GeoJSON.LineString, { kind: RouteLineKind }>;
export type RouteStopCollection = GeoJSON.FeatureCollection<GeoJSON.Point, { label: string; kind: RoutePoint['kind'] }>;

export const EMPTY_ROUTE_LINE: RouteLineCollection = { type: 'FeatureCollection', features: [] };
export const EMPTY_ROUTE_STOPS: RouteStopCollection = { type: 'FeatureCollection', features: [] };

/**
 * 地図に描くルート。外部サービスで取得した経路があればその線を、無ければ地点間を直線（点線）で結ぶ。
 * 店舗には訪問順の番号、出発駅には「駅」の印を付ける。
 */
export function buildRouteFeatures(
  points: readonly RoutePoint[],
  routedGeometry: readonly [number, number][] | null,
): { line: RouteLineCollection; stops: RouteStopCollection } {
  let n = 0;
  const stops: RouteStopCollection = {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
      properties: { kind: p.kind, label: p.kind === 'station' ? '駅' : String(++n) },
    })),
  };
  const coords: [number, number][] = routedGeometry
    ? [...routedGeometry]
    : points.map((p) => [p.longitude, p.latitude]);
  const line: RouteLineCollection =
    coords.length >= 2
      ? {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: coords },
              properties: { kind: routedGeometry ? 'routed' : 'straight' },
            },
          ],
        }
      : EMPTY_ROUTE_LINE;
  return { line, stops };
}

export function routeIconId(label: string): string {
  return `atlas-route-${label}`;
}

/** 番号の印（1〜20と「駅」）。外部フォントに依存しないよう canvas で描く */
export function drawRouteIcon(label: string, pixelRatio: number): ImageData | null {
  const size = Math.round(26 * pixelRatio);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const r = size / 2;
  ctx.beginPath();
  ctx.arc(r, r, r - 2 * pixelRatio, 0, Math.PI * 2);
  ctx.fillStyle = label === '駅' ? '#ffffff' : ROUTE_COLOR;
  ctx.fill();
  ctx.lineWidth = 2 * pixelRatio;
  ctx.strokeStyle = '#0d1b2a';
  ctx.stroke();
  ctx.fillStyle = '#0d1b2a';
  ctx.font = `bold ${Math.round((label.length > 1 ? 11 : 14) * pixelRatio)}px "Yu Gothic UI", "Meiryo", "Noto Sans JP", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, r, r + pixelRatio);
  return ctx.getImageData(0, 0, size, size);
}

export const ROUTE_ICON_LABELS = ['駅', ...Array.from({ length: MAX_NUMBER_ICONS }, (_, i) => String(i + 1))];

export function buildRouteStraightLayer(): LineLayerSpecification {
  return {
    id: ROUTE_LAYER_IDS.lineStraight,
    type: 'line',
    source: ROUTE_LINE_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'straight'],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': ROUTE_COLOR, 'line-width': 3, 'line-dasharray': [1.5, 1.5], 'line-opacity': 0.9 },
  };
}

export function buildRouteRoutedLayer(): LineLayerSpecification {
  return {
    id: ROUTE_LAYER_IDS.lineRouted,
    type: 'line',
    source: ROUTE_LINE_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'routed'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ROUTE_COLOR, 'line-width': 4, 'line-opacity': 0.9 },
  };
}

export function buildRouteStopHaloLayer(): CircleLayerSpecification {
  return {
    id: ROUTE_LAYER_IDS.stopHalo,
    type: 'circle',
    source: ROUTE_STOP_SOURCE_ID,
    paint: {
      'circle-radius': 18,
      'circle-color': 'rgba(79, 195, 247, 0.25)',
      'circle-stroke-color': ROUTE_COLOR,
      'circle-stroke-width': 1,
    },
  };
}

export function buildRouteNumberLayer(): SymbolLayerSpecification {
  return {
    id: ROUTE_LAYER_IDS.stopNumbers,
    type: 'symbol',
    source: ROUTE_STOP_SOURCE_ID,
    layout: {
      'icon-image': ['concat', 'atlas-route-', ['get', 'label']],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-offset': [0, -22],
    },
  };
}
