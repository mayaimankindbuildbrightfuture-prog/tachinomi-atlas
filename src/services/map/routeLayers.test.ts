import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type { StyleSpecification } from 'maplibre-gl';
import type { RoutePoint } from '../../domain/route';
import {
  ROUTE_LINE_SOURCE_ID,
  ROUTE_STOP_SOURCE_ID,
  buildRouteFeatures,
  buildRouteNumberLayer,
  buildRouteRoutedLayer,
  buildRouteStopHaloLayer,
  buildRouteStraightLayer,
} from './routeLayers';

const pts: RoutePoint[] = [
  { kind: 'station', id: 'st', name: '駅', latitude: 35.7, longitude: 139.7 },
  { kind: 'shop', id: 'a', name: 'A', latitude: 35.701, longitude: 139.7 },
  { kind: 'shop', id: 'b', name: 'B', latitude: 35.702, longitude: 139.7 },
];

describe('ルートの地図表示', () => {
  it('店舗に訪問順の番号、駅に「駅」を付け、経路が無ければ直線で結ぶ', () => {
    const { line, stops } = buildRouteFeatures(pts, null);
    expect(stops.features.map((f) => f.properties.label)).toEqual(['駅', '1', '2']);
    expect(line.features[0]!.properties.kind).toBe('straight');
    expect(line.features[0]!.geometry.coordinates).toHaveLength(3);
  });

  it('取得した経路があればその線を使う', () => {
    const geometry: [number, number][] = [
      [139.7, 35.7],
      [139.7001, 35.7005],
      [139.7, 35.702],
    ];
    expect(buildRouteFeatures(pts, geometry).line.features[0]!.properties.kind).toBe('routed');
  });

  it('1地点以下では線を描かない', () => {
    expect(buildRouteFeatures(pts.slice(0, 1), null).line.features).toEqual([]);
  });

  it('MapLibre のスタイル仕様として妥当', () => {
    const { line, stops } = buildRouteFeatures(pts, null);
    const style: StyleSpecification = {
      version: 8,
      sources: {
        [ROUTE_LINE_SOURCE_ID]: { type: 'geojson', data: line },
        [ROUTE_STOP_SOURCE_ID]: { type: 'geojson', data: stops },
      },
      layers: [buildRouteStraightLayer(), buildRouteRoutedLayer(), buildRouteStopHaloLayer(), buildRouteNumberLayer()],
    };
    expect(validateStyleMin(style)).toEqual([]);
  });
});
