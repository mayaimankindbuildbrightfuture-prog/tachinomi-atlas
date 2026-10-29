/**
 * 店舗レイヤー（GeoJSON ソース＋クラスタリング）の定義。
 * 純粋関数として定義し、mapAdapter から追加する。
 */
import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import { CATEGORIES, primaryCategory, type Shop } from '../../domain/shop';

export const SHOP_SOURCE_ID = 'atlas-shops';
export const SHOP_LAYER_IDS = {
  clusters: 'atlas-shop-clusters',
  clusterCount: 'atlas-shop-cluster-count',
  selectedHalo: 'atlas-shop-selected-halo',
  points: 'atlas-shop-points',
  hit: 'atlas-shop-hit',
  labels: 'atlas-shop-labels',
} as const;

export type ShopFeatureProperties = {
  id: string;
  name: string;
  category: string;
  status: Shop['status'];
};

export type ShopFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, ShopFeatureProperties>;

/** 店舗を GeoJSON に変換する。MapLibre は [経度, 緯度] の順で座標を受け取る */
export function shopsToFeatureCollection(shops: readonly Shop[]): ShopFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: shops.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
      properties: { id: s.id, name: s.name, category: primaryCategory(s), status: s.status },
    })),
  };
}

export const CLUSTER_MAX_ZOOM = 14;

export function buildShopSource(data: ShopFeatureCollection): GeoJSONSourceSpecification {
  return {
    type: 'geojson',
    data,
    cluster: true,
    clusterRadius: 48,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    promoteId: 'id',
  };
}

export function categoryIconId(key: string): string {
  return `atlas-cat-${key}`;
}

const CLUSTER_COLOR = '#e8a33d';

export function buildClusterLayer(): CircleLayerSpecification {
  return {
    id: SHOP_LAYER_IDS.clusters,
    type: 'circle',
    source: SHOP_SOURCE_ID,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': CLUSTER_COLOR,
      'circle-opacity': 0.85,
      'circle-stroke-color': '#1b1f27',
      'circle-stroke-width': 2,
      'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24, 200, 30],
    },
  };
}

/** クラスタの件数ラベル。文字描画にはスタイルの glyphs が必要なため、無い場合は追加しない */
export function buildClusterCountLayer(textFont: string[]): SymbolLayerSpecification {
  return {
    id: SHOP_LAYER_IDS.clusterCount,
    type: 'symbol',
    source: SHOP_SOURCE_ID,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': textFont,
      'text-size': 13,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#1a1307' },
  };
}

export function buildSelectedHaloLayer(selectedId: string | null): CircleLayerSpecification {
  return {
    id: SHOP_LAYER_IDS.selectedHalo,
    type: 'circle',
    source: SHOP_SOURCE_ID,
    filter: selectedFilter(selectedId),
    paint: {
      'circle-radius': 22,
      'circle-color': 'rgba(255, 255, 255, 0.15)',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 3,
    },
  };
}

export function selectedFilter(selectedId: string | null): ExpressionSpecification {
  return ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], selectedId ?? '']];
}

/** 閉店（可能性含む）の店舗は半透明にして区別する */
const STATUS_OPACITY: ExpressionSpecification = ['match', ['get', 'status'], 'closed', 0.35, 'possibly_closed', 0.6, 1];

export function buildPointLayer(): SymbolLayerSpecification {
  return {
    id: SHOP_LAYER_IDS.points,
    type: 'symbol',
    source: SHOP_SOURCE_ID,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['concat', 'atlas-cat-', ['get', 'category']],
      'icon-size': 1,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': STATUS_OPACITY },
  };
}

/**
 * クリック判定用の透明な円。アイコン（symbol）は重なり許可の設定上 queryRenderedFeatures で
 * 拾えないことがあるため、判定はこのレイヤーで行う。
 */
export function buildHitLayer(): CircleLayerSpecification {
  return {
    id: SHOP_LAYER_IDS.hit,
    type: 'circle',
    source: SHOP_SOURCE_ID,
    filter: ['!', ['has', 'point_count']],
    paint: { 'circle-radius': ICON_SIZE_PX / 2, 'circle-color': '#000000', 'circle-opacity': 0 },
  };
}

export function buildLabelLayer(textFont: string[]): SymbolLayerSpecification {
  return {
    id: SHOP_LAYER_IDS.labels,
    type: 'symbol',
    source: SHOP_SOURCE_ID,
    filter: ['!', ['has', 'point_count']],
    minzoom: 15,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': textFont,
      'text-size': 12,
      'text-offset': [0, 1.5],
      'text-anchor': 'top',
      'text-optional': true,
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': '#1b1f27',
      'text-halo-width': 1.5,
      'text-opacity': STATUS_OPACITY,
    },
  };
}

/** 文字ラベルに使うフォント。スタイル内の既存 symbol レイヤーから流用する */
export function pickTextFont(layers: readonly { type: string; layout?: unknown }[]): string[] {
  for (const l of layers) {
    if (l.type !== 'symbol' || !l.layout) continue;
    const font = (l.layout as Record<string, unknown>)['text-font'];
    if (Array.isArray(font) && font.every((f) => typeof f === 'string')) return font as string[];
  }
  return ['Noto Sans Regular'];
}

export const ICON_SIZE_PX = 30;

/**
 * ジャンルのマーカー画像（色付きの円＋一文字）を canvas で描く。
 * スプライトや外部フォントに依存しないため、簡易表示（外部地図なし）でも表示できる。
 */
export function drawCategoryIcon(color: string, label: string, pixelRatio: number): ImageData | null {
  const size = Math.round(ICON_SIZE_PX * pixelRatio);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const r = size / 2;
  ctx.beginPath();
  ctx.arc(r, r, r - 2 * pixelRatio, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2 * pixelRatio;
  ctx.strokeStyle = '#1b1f27';
  ctx.stroke();
  ctx.fillStyle = '#1b1f27';
  ctx.font = `bold ${Math.round(15 * pixelRatio)}px "Yu Gothic UI", "Meiryo", "Noto Sans JP", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, r, r + pixelRatio);
  return ctx.getImageData(0, 0, size, size);
}

export const CATEGORY_ICONS = CATEGORIES.map((c) => ({ id: categoryIconId(c.key), color: c.color, label: c.short }));
