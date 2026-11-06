/**
 * 酒場密度・比較のための集計（仕様書 4.5、Phase 3）。純粋関数のみ。
 *
 * 方針：
 * - 色や高さは「登録された店舗の件数」に対する固定の目盛りで表す。最大値に合わせて相対的に
 *   濃くすることはしない（件数が少ない地域を過大に見せないため）。
 * - 店舗が0件の場所は、調査済みエリアの中だけ「調査済み・0件」と表示し、それ以外は何も描かない
 *   （＝データが無い・未調査。店が少ないとは断定しない）。
 */
import { distanceMeters } from './geo';
import { isInSurveyArea, type SurveyArea } from './survey';
import { CATEGORIES, PRICE_LEVEL_LABELS, primaryCategory, type PriceLevel, type Shop, type Station } from './shop';

// ---------------------------------------------------------------------------
// 格子（メッシュ）集計
// ---------------------------------------------------------------------------

export const GRID_SIZES_M = [250, 500, 1000] as const;
export type GridSizeM = (typeof GRID_SIZES_M)[number];
export const DEFAULT_GRID_SIZE_M: GridSizeM = 500;

/** 格子の基準緯度（東京都・埼玉県の中央付近）。経度方向の幅をこの緯度でメートルに合わせる */
const REFERENCE_LAT = 35.8;
const METERS_PER_DEG_LAT = 111_320;

export function gridStepDegrees(sizeM: number): { dLat: number; dLng: number } {
  return {
    dLat: sizeM / METERS_PER_DEG_LAT,
    dLng: sizeM / (METERS_PER_DEG_LAT * Math.cos((REFERENCE_LAT * Math.PI) / 180)),
  };
}

export type GridKey = `${number}:${number}`;

export function gridKeyOf(latitude: number, longitude: number, sizeM: number): GridKey {
  const { dLat, dLng } = gridStepDegrees(sizeM);
  return `${Math.floor(latitude / dLat)}:${Math.floor(longitude / dLng)}`;
}

function cellBounds(key: GridKey, sizeM: number): [west: number, south: number, east: number, north: number] {
  const { dLat, dLng } = gridStepDegrees(sizeM);
  const [row, col] = key.split(':').map(Number) as [number, number];
  return [col * dLng, row * dLat, (col + 1) * dLng, (row + 1) * dLat];
}

export type GridCellProperties = {
  key: string;
  count: number;
  /** 調査済みエリア内のマスか */
  surveyed: boolean;
  /** 3D柱の高さ（メートル） */
  height: number;
};

export type GridFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon, GridCellProperties>;

/**
 * 店舗を格子に集計し、地図に描くマスを返す。
 * - 店舗が1件以上あるマス
 * - 調査済みエリアの中心が含まれる、店舗0件のマス（「調査済み・0件」）
 */
export function buildDensityGrid(
  shops: readonly Shop[],
  sizeM: number,
  surveyAreas: readonly SurveyArea[],
): GridFeatureCollection {
  const counts = new Map<GridKey, number>();
  for (const s of shops) {
    const k = gridKeyOf(s.latitude, s.longitude, sizeM);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  // 調査済みエリアに中心が入るマスを列挙する
  const surveyedKeys = new Set<GridKey>();
  if (surveyAreas.length > 0) {
    const { dLat, dLng } = gridStepDegrees(sizeM);
    for (const a of surveyAreas) {
      const rLat = a.radiusM / METERS_PER_DEG_LAT + dLat;
      const rLng = a.radiusM / (METERS_PER_DEG_LAT * Math.cos((a.centerLatitude * Math.PI) / 180)) + dLng;
      const r0 = Math.floor((a.centerLatitude - rLat) / dLat);
      const r1 = Math.floor((a.centerLatitude + rLat) / dLat);
      const c0 = Math.floor((a.centerLongitude - rLng) / dLng);
      const c1 = Math.floor((a.centerLongitude + rLng) / dLng);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const cLat = (r + 0.5) * dLat;
          const cLng = (c + 0.5) * dLng;
          if (isInSurveyArea(cLat, cLng, [a])) surveyedKeys.add(`${r}:${c}`);
        }
      }
    }
  }

  const keys = new Set<GridKey>([...counts.keys(), ...surveyedKeys]);
  const features: GridFeatureCollection['features'] = [];
  for (const key of keys) {
    const [w, s, e, n] = cellBounds(key, sizeM);
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [w, s],
            [e, s],
            [e, n],
            [w, n],
            [w, s],
          ],
        ],
      },
      properties: {
        key,
        count: counts.get(key) ?? 0,
        surveyed: surveyedKeys.has(key),
        height: (counts.get(key) ?? 0) * gridHeightPerShop(sizeM),
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** 件数の目盛り（固定）。凡例と地図の色分けで共通に使う */
export const DENSITY_STEPS: readonly { min: number; label: string; color: string }[] = [
  { min: 1, label: '1件', color: '#5b6b8c' },
  { min: 2, label: '2〜3件', color: '#8a78b8' },
  { min: 4, label: '4〜5件', color: '#c46fa0' },
  { min: 6, label: '6〜9件', color: '#e8875a' },
  { min: 10, label: '10件以上', color: '#f2c14e' },
];

export const SURVEYED_ZERO_COLOR = '#4fb38a';

/** 格子の柱の高さは、1件あたりマス1辺の長さの30%（広域表示でも高さが読み取れるよう、マスの大きさに比例させる） */
export const GRID_HEIGHT_RATIO = 0.3;

export function gridHeightPerShop(sizeM: number): number {
  return Math.round(sizeM * GRID_HEIGHT_RATIO);
}

// ---------------------------------------------------------------------------
// 予算帯の色
// ---------------------------------------------------------------------------

export const PRICE_LEVEL_COLORS: Record<PriceLevel, string> = {
  budget: '#4fb38a',
  standard: '#e8a33d',
  premium: '#d9534f',
  unknown: '#8a8f99',
};

export const PRICE_LEVEL_ORDER: readonly PriceLevel[] = ['budget', 'standard', 'premium', 'unknown'];

export function priceLevelLegend() {
  return PRICE_LEVEL_ORDER.map((p) => ({ key: p, label: PRICE_LEVEL_LABELS[p], color: PRICE_LEVEL_COLORS[p] }));
}

// ---------------------------------------------------------------------------
// 市区町村別の集計
// ---------------------------------------------------------------------------

export type AreaStats = {
  prefecture: string;
  municipality: string;
  total: number;
  verified: number;
  byCategory: Record<string, number>;
  byPriceLevel: Record<PriceLevel, number>;
};

const UNKNOWN_AREA = '市区町村未設定';

export function aggregateByMunicipality(shops: readonly Shop[]): AreaStats[] {
  const map = new Map<string, AreaStats>();
  for (const s of shops) {
    const prefecture = s.prefecture ?? '都道府県未設定';
    const municipality = s.municipality ?? UNKNOWN_AREA;
    const key = `${prefecture}/${municipality}`;
    let row = map.get(key);
    if (!row) {
      row = {
        prefecture,
        municipality,
        total: 0,
        verified: 0,
        byCategory: {},
        byPriceLevel: { budget: 0, standard: 0, premium: 0, unknown: 0 },
      };
      map.set(key, row);
    }
    row.total += 1;
    if (s.status === 'verified') row.verified += 1;
    const cat = primaryCategory(s);
    row.byCategory[cat] = (row.byCategory[cat] ?? 0) + 1;
    row.byPriceLevel[s.priceLevel] += 1;
  }
  const collator = new Intl.Collator('ja');
  return [...map.values()].sort(
    (a, b) =>
      b.total - a.total ||
      collator.compare(a.prefecture, b.prefecture) ||
      collator.compare(a.municipality, b.municipality),
  );
}

/** 集計行の料理ジャンル内訳を、件数の多い順に表示用ラベルへ変換する */
export function categoryBreakdown(byCategory: Record<string, number>): { key: string; label: string; count: number }[] {
  return CATEGORIES.filter((c) => byCategory[c.key])
    .map((c) => ({ key: c.key, label: c.label, count: byCategory[c.key] ?? 0 }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// 駅周辺の集計
// ---------------------------------------------------------------------------

export const STATION_RADII_M = [300, 500, 800] as const;
export type StationRadiusM = (typeof STATION_RADII_M)[number];
export const DEFAULT_STATION_RADIUS_M: StationRadiusM = 500;

export type StationCount = { station: Station; count: number; shopIds: string[] };

/** 各駅から直線距離 radiusM 以内にある店舗数。0件の駅は含めない */
export function countShopsNearStations(
  stations: readonly Station[],
  shops: readonly Shop[],
  radiusM: number,
): StationCount[] {
  const results: StationCount[] = [];
  // 緯度経度の粗い範囲で先に絞り込み、距離計算の回数を減らす
  const dLat = radiusM / METERS_PER_DEG_LAT;
  for (const station of stations) {
    const dLng = radiusM / (METERS_PER_DEG_LAT * Math.cos((station.latitude * Math.PI) / 180));
    const shopIds: string[] = [];
    for (const s of shops) {
      if (Math.abs(s.latitude - station.latitude) > dLat || Math.abs(s.longitude - station.longitude) > dLng) continue;
      if (distanceMeters(station.latitude, station.longitude, s.latitude, s.longitude) <= radiusM) shopIds.push(s.id);
    }
    if (shopIds.length > 0) results.push({ station, count: shopIds.length, shopIds });
  }
  const collator = new Intl.Collator('ja');
  return results.sort((a, b) => b.count - a.count || collator.compare(a.station.name, b.station.name));
}

export type NearbyStation = { station: Station; distanceM: number };

/** 店舗から近い駅（直線距離）を近い順に返す */
export function nearestStations(
  point: { latitude: number; longitude: number },
  stations: readonly Station[],
  limit = 3,
  maxDistanceM = 2000,
): NearbyStation[] {
  return stations
    .map((station) => ({
      station,
      distanceM: distanceMeters(point.latitude, point.longitude, station.latitude, station.longitude),
    }))
    .filter((n) => n.distanceM <= maxDistanceM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}

/** 駅の表示名。同名の駅を区別するため、路線を併記する */
export function stationLabel(station: Station, maxLines = 2): string {
  const lines = station.lines.slice(0, maxLines).join('・');
  const more = station.lines.length > maxLines ? ` 他${station.lines.length - maxLines}路線` : '';
  return lines ? `${station.name}（${lines}${more}）` : station.name;
}
