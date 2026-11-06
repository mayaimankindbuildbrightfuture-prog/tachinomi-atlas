/**
 * スタイル（StyleSpecification）を加工する純粋関数群。
 * MapLibre インスタンスに依存しないため、単体テストで検証できる。
 */
import type {
  ExpressionSpecification,
  FillExtrusionLayerSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import { BUILDING_COLORS, BUILDING_MIN_ZOOM } from './mapConfig';

export const BUILDINGS_3D_LAYER_ID = 'atlas-buildings-3d';

/** OpenMapTiles スキーマで建物ポリゴンを持つソースレイヤー名 */
const BUILDING_SOURCE_LAYER = 'building';

function sourceLayerOf(layer: LayerSpecification): string | undefined {
  return 'source-layer' in layer ? layer['source-layer'] : undefined;
}

function sourceOf(layer: LayerSpecification): string | undefined {
  return 'source' in layer && typeof layer.source === 'string' ? layer.source : undefined;
}

/**
 * 建物データを持つベクタータイルソースのIDを探す。
 * スタイルによってソース名が異なる可能性があるため、レイヤー定義から逆引きする。
 */
export function findBuildingSourceId(style: StyleSpecification): string | null {
  for (const layer of style.layers) {
    if (sourceLayerOf(layer) === BUILDING_SOURCE_LAYER) {
      const source = sourceOf(layer);
      if (source && style.sources[source]?.type === 'vector') return source;
    }
  }
  // レイヤーが無くても OpenMapTiles 形式のソースがあれば利用する
  for (const [id, src] of Object.entries(style.sources)) {
    if (src.type === 'vector' && id === 'openmaptiles') return id;
  }
  return null;
}

/** スタイル内に元から存在する建物の立体レイヤー（二重描画を避けるため非表示にする対象） */
export function findExistingBuildingExtrusionIds(style: StyleSpecification): string[] {
  return style.layers
    .filter(
      (l) =>
        l.type === 'fill-extrusion' && sourceLayerOf(l) === BUILDING_SOURCE_LAYER && l.id !== BUILDINGS_3D_LAYER_ID,
    )
    .map((l) => l.id);
}

/**
 * 3D建物レイヤーの挿入位置（このIDのレイヤーの直前に入れる）。
 * スタイル側の平面の建物レイヤーより後（上）に、かつ文字ラベルより前（下）に描く。
 * 平面の建物レイヤーが後にあると、立体の建物を上から塗りつぶしてしまうため。
 */
export function findBuildingInsertBeforeId(style: StyleSpecification): string | undefined {
  let lastBuildingIndex = -1;
  style.layers.forEach((l, i) => {
    if (sourceLayerOf(l) === BUILDING_SOURCE_LAYER && l.id !== BUILDINGS_3D_LAYER_ID) lastBuildingIndex = i;
  });
  return style.layers.find((l, i) => i > lastBuildingIndex && l.type === 'symbol')?.id;
}

export function buildBuildings3DLayer(sourceId: string): FillExtrusionLayerSpecification {
  const height: ExpressionSpecification = ['coalesce', ['get', 'render_height'], ['get', 'height'], 6];
  const base: ExpressionSpecification = ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0];
  return {
    id: BUILDINGS_3D_LAYER_ID,
    type: 'fill-extrusion',
    source: sourceId,
    'source-layer': BUILDING_SOURCE_LAYER,
    minzoom: BUILDING_MIN_ZOOM,
    filter: ['!=', ['get', 'hide_3d'], true],
    paint: {
      'fill-extrusion-color': [
        'interpolate',
        ['linear'],
        height,
        0,
        BUILDING_COLORS.low,
        30,
        BUILDING_COLORS.mid,
        120,
        BUILDING_COLORS.high,
      ],
      // ズームアウト時に急に建物が現れないよう、高さを徐々に立ち上げる
      'fill-extrusion-height': [
        'interpolate',
        ['linear'],
        ['zoom'],
        BUILDING_MIN_ZOOM,
        0,
        BUILDING_MIN_ZOOM + 1.5,
        height,
      ],
      'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], BUILDING_MIN_ZOOM, 0, BUILDING_MIN_ZOOM + 1.5, base],
      'fill-extrusion-opacity': 0.85,
      'fill-extrusion-vertical-gradient': true,
    },
  };
}

/** 日本語の地名を優先し、無ければ既定の名称を使う式 */
export const JAPANESE_NAME_EXPRESSION: ExpressionSpecification = ['coalesce', ['get', 'name:ja'], ['get', 'name']];

/**
 * 地名ラベルが日本語表記を優先するよう text-field を置き換えた layer 配列を返す。
 * 道路番号（ref）など name を参照しないラベルはそのまま残す。
 */
export function localizeLabelLayers(layers: LayerSpecification[]): LayerSpecification[] {
  return layers.map((layer) => {
    if (layer.type !== 'symbol' || !layer.layout) return layer;
    const textField = layer.layout['text-field'];
    if (textField === undefined) return layer;
    const serialized = JSON.stringify(textField);
    if (!/name/.test(serialized)) return layer;
    return {
      ...layer,
      layout: { ...layer.layout, 'text-field': JAPANESE_NAME_EXPRESSION },
    };
  });
}

/**
 * 地図スタイルの取得に失敗したときに使う、外部通信なしで描画できる最小スタイル。
 * 背景のみだが、今後のフェーズで追加する店舗レイヤー（GeoJSON）はこの上でも表示できる。
 */
export const OFFLINE_FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  name: 'tachinomi-atlas-offline',
  sources: {},
  layers: [
    {
      id: 'offline-background',
      type: 'background',
      paint: { 'background-color': '#1d2129' },
    },
  ],
};
