/**
 * 密度・比較の表示レイヤー（Phase 3）の定義。純粋関数として定義し、mapAdapter から追加する。
 */
import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  FillExtrusionLayerSpecification,
  FillLayerSpecification,
  HeatmapLayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import {
  DENSITY_STEPS,
  PRICE_LEVEL_COLORS,
  SURVEYED_ZERO_COLOR,
  type GridFeatureCollection,
} from '../../domain/density';
import { circleRing } from '../../domain/geo';
import { CATEGORIES, type Station } from '../../domain/shop';
import type { SurveyArea } from '../../domain/survey';
import { SHOP_LAYER_IDS } from './shopLayers';

/** 地図の表示モード（仕様書 4.5） */
export type DisplayMode = 'markers' | 'heatmap' | 'grid' | 'category' | 'priceLevel';

export const DISPLAY_MODES: readonly { id: DisplayMode; label: string; description: string }[] = [
  { id: 'markers', label: '店舗マーカー', description: '店舗を1件ずつ表示（近い店はまとめて表示）' },
  { id: 'heatmap', label: '密度（ヒートマップ）', description: '登録店舗が集まっている場所を色の濃さで表示' },
  { id: 'grid', label: '密度（3D柱）', description: '一定の大きさのマスごとの店舗数を柱の高さと色で表示' },
  { id: 'category', label: 'ジャンル別の分布', description: '代表ジャンルで色分けした点を表示' },
  { id: 'priceLevel', label: '予算帯別の分布', description: '予算帯で色分けした点を表示' },
];

export const RAW_SOURCE_ID = 'atlas-shops-raw';
export const GRID_SOURCE_ID = 'atlas-density-grid';
export const SURVEY_SOURCE_ID = 'atlas-survey-areas';
export const STATION_SOURCE_ID = 'atlas-stations';

export const DENSITY_LAYER_IDS = {
  surveyFill: 'atlas-survey-fill',
  surveyLine: 'atlas-survey-line',
  gridZero: 'atlas-grid-zero',
  grid3d: 'atlas-grid-3d',
  heatmap: 'atlas-heatmap',
  stations: 'atlas-stations',
  stationLabels: 'atlas-station-labels',
  categoryPoints: 'atlas-category-points',
  pricePoints: 'atlas-price-points',
} as const;

// ---------------------------------------------------------------------------
// GeoJSON 変換
// ---------------------------------------------------------------------------

export type SurveyAreaFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon, { id: string; name: string }>;

export function surveyAreasToFeatureCollection(areas: readonly SurveyArea[]): SurveyAreaFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: areas.map((a) => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [circleRing(a.centerLatitude, a.centerLongitude, a.radiusM)] },
      properties: { id: a.id, name: a.name },
    })),
  };
}

export type StationFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, { id: string; name: string }>;

export function stationsToFeatureCollection(stations: readonly Station[]): StationFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
      properties: { id: s.id, name: s.name },
    })),
  };
}

export const EMPTY_GRID: GridFeatureCollection = { type: 'FeatureCollection', features: [] };

// ---------------------------------------------------------------------------
// レイヤー
// ---------------------------------------------------------------------------

/** 件数に応じた色（固定の目盛り。最大値に合わせた相対表示はしない） */
export function densityColorExpression(): ExpressionSpecification {
  const [first, ...rest] = DENSITY_STEPS;
  const expr: unknown[] = ['step', ['get', 'count'], first!.color];
  for (const step of rest) expr.push(step.min, step.color);
  return expr as ExpressionSpecification;
}

export function buildSurveyFillLayer(): FillLayerSpecification {
  return {
    id: DENSITY_LAYER_IDS.surveyFill,
    type: 'fill',
    source: SURVEY_SOURCE_ID,
    paint: { 'fill-color': SURVEYED_ZERO_COLOR, 'fill-opacity': 0.06 },
  };
}

export function buildSurveyLineLayer(): LineLayerSpecification {
  return {
    id: DENSITY_LAYER_IDS.surveyLine,
    type: 'line',
    source: SURVEY_SOURCE_ID,
    paint: { 'line-color': SURVEYED_ZERO_COLOR, 'line-width': 2, 'line-dasharray': [2, 2] },
  };
}

/** 調査済みエリア内で店舗0件のマス（平面、緑の枠） */
export function buildGridZeroLayer(): FillLayerSpecification {
  return {
    id: DENSITY_LAYER_IDS.gridZero,
    type: 'fill',
    source: GRID_SOURCE_ID,
    filter: ['==', ['get', 'count'], 0],
    paint: { 'fill-color': SURVEYED_ZERO_COLOR, 'fill-opacity': 0.25, 'fill-outline-color': SURVEYED_ZERO_COLOR },
  };
}

export function buildGrid3dLayer(): FillExtrusionLayerSpecification {
  return {
    id: DENSITY_LAYER_IDS.grid3d,
    type: 'fill-extrusion',
    source: GRID_SOURCE_ID,
    filter: ['>', ['get', 'count'], 0],
    paint: {
      'fill-extrusion-color': densityColorExpression(),
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.8,
    },
  };
}

export function buildHeatmapLayer(): HeatmapLayerSpecification {
  return {
    id: DENSITY_LAYER_IDS.heatmap,
    type: 'heatmap',
    source: RAW_SOURCE_ID,
    maxzoom: 17,
    paint: {
      // 1店舗の重みは一定。件数が少ない場所が濃く見えないよう、強さは固定値にする
      'heatmap-weight': 1,
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 15, 1.2],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 14, 12, 28, 16, 50],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0.85, 17, 0.3],
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        'rgba(0,0,0,0)',
        0.15,
        'rgba(91,107,140,0.55)',
        0.35,
        '#8a78b8',
        0.55,
        '#c46fa0',
        0.75,
        '#e8875a',
        1,
        '#f2c14e',
      ],
    },
  };
}

export function buildCategoryPointLayer(): CircleLayerSpecification {
  const match: unknown[] = ['match', ['get', 'category']];
  for (const c of CATEGORIES) match.push(c.key, c.color);
  match.push('#9aa0aa');
  return {
    id: DENSITY_LAYER_IDS.categoryPoints,
    type: 'circle',
    source: RAW_SOURCE_ID,
    paint: {
      'circle-color': match as ExpressionSpecification,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 8, 17, 11],
      'circle-stroke-color': '#1b1f27',
      'circle-stroke-width': 1.5,
    },
  };
}

export function buildPricePointLayer(): CircleLayerSpecification {
  return {
    id: DENSITY_LAYER_IDS.pricePoints,
    type: 'circle',
    source: RAW_SOURCE_ID,
    paint: {
      'circle-color': [
        'match',
        ['get', 'priceLevel'],
        'budget',
        PRICE_LEVEL_COLORS.budget,
        'standard',
        PRICE_LEVEL_COLORS.standard,
        'premium',
        PRICE_LEVEL_COLORS.premium,
        PRICE_LEVEL_COLORS.unknown,
      ],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 8, 17, 11],
      'circle-stroke-color': '#1b1f27',
      'circle-stroke-width': 1.5,
    },
  };
}

export const STATION_MIN_ZOOM = 12;

export function buildStationLayer(): CircleLayerSpecification {
  return {
    id: DENSITY_LAYER_IDS.stations,
    type: 'circle',
    source: STATION_SOURCE_ID,
    minzoom: STATION_MIN_ZOOM,
    paint: {
      'circle-radius': 4,
      'circle-color': '#ffffff',
      'circle-stroke-color': '#2b6cb0',
      'circle-stroke-width': 2,
    },
  };
}

export function buildStationLabelLayer(textFont: string[]): SymbolLayerSpecification {
  return {
    id: DENSITY_LAYER_IDS.stationLabels,
    type: 'symbol',
    source: STATION_SOURCE_ID,
    minzoom: 13,
    layout: {
      'text-field': ['concat', ['get', 'name'], '駅'],
      'text-font': textFont,
      'text-size': 11,
      'text-offset': [0, -1.2],
      'text-anchor': 'bottom',
      'text-optional': true,
    },
    paint: { 'text-color': '#cfe3ff', 'text-halo-color': '#1b1f27', 'text-halo-width': 1.2 },
  };
}

/** 表示モードごとに表示するレイヤー。調査済みエリアは密度表示のときのみ示す */
export function layerVisibility(mode: DisplayMode, showStations: boolean): Record<string, boolean> {
  const markers = mode === 'markers';
  const density = mode === 'heatmap' || mode === 'grid';
  return {
    [SHOP_LAYER_IDS.clusters]: markers,
    [SHOP_LAYER_IDS.clusterCount]: markers,
    [SHOP_LAYER_IDS.selectedHalo]: true,
    [SHOP_LAYER_IDS.points]: markers,
    [SHOP_LAYER_IDS.hit]: markers,
    [SHOP_LAYER_IDS.labels]: markers,
    [DENSITY_LAYER_IDS.surveyFill]: density,
    [DENSITY_LAYER_IDS.surveyLine]: density,
    [DENSITY_LAYER_IDS.gridZero]: mode === 'grid',
    [DENSITY_LAYER_IDS.grid3d]: mode === 'grid',
    [DENSITY_LAYER_IDS.heatmap]: mode === 'heatmap',
    [DENSITY_LAYER_IDS.categoryPoints]: mode === 'category',
    [DENSITY_LAYER_IDS.pricePoints]: mode === 'priceLevel',
    [DENSITY_LAYER_IDS.stations]: showStations,
    [DENSITY_LAYER_IDS.stationLabels]: showStations,
  };
}

/** 店舗を選択できる（クリック判定に使う）レイヤー。分布表示の点もクリックで詳細を開ける */
export function clickableShopLayers(mode: DisplayMode): string[] {
  if (mode === 'markers') return [SHOP_LAYER_IDS.hit, SHOP_LAYER_IDS.clusters];
  if (mode === 'category') return [DENSITY_LAYER_IDS.categoryPoints];
  if (mode === 'priceLevel') return [DENSITY_LAYER_IDS.pricePoints];
  return [];
}
