/**
 * 地図の表示設定（スタイル・初期視点・地域プリセット）。
 *
 * MapLibre の型に依存しない純粋なデータとして定義し、UI 層とテストから参照する。
 * 座標は [経度, 緯度]（MapLibre の LngLat 配列形式）で保持する。
 */

export type LngLatTuple = [lng: number, lat: number];
export type BoundsTuple = [southWest: LngLatTuple, northEast: LngLatTuple];

export type MapStyleId = 'dark' | 'liberty' | 'positron';

export type MapStyleOption = {
  id: MapStyleId;
  label: string;
  url: string;
  description: string;
};

/**
 * 地図タイル提供元: OpenFreeMap（https://openfreemap.org/）
 * - APIキー・登録不要、リクエスト数の上限なし（公式サイトの記載による）
 * - 帰属表示「OpenFreeMap © OpenMapTiles Data from OpenStreetMap」が必須。
 *   スタイルに含まれる attribution を MapLibre の AttributionControl が自動表示する。
 * - SLA はなく、提供内容は予告なく変わる可能性がある。
 * 詳細は docs/DATA_SOURCES.md を参照。
 */
export const MAP_STYLES: readonly MapStyleOption[] = [
  {
    id: 'dark',
    label: 'ダーク',
    url: 'https://tiles.openfreemap.org/styles/dark',
    description: '落ち着いた濃色の地図。夜の街歩き向け。',
  },
  {
    id: 'liberty',
    label: '標準',
    url: 'https://tiles.openfreemap.org/styles/liberty',
    description: 'OpenFreeMap の標準スタイル。道路・施設が見やすい。',
  },
  {
    id: 'positron',
    label: '淡色',
    url: 'https://tiles.openfreemap.org/styles/positron',
    description: '淡いグレーの地図。情報を重ねたときに見やすい。',
  },
] as const;

export const DEFAULT_STYLE_ID: MapStyleId = 'dark';

export function getStyleOption(id: MapStyleId): MapStyleOption {
  const found = MAP_STYLES.find((s) => s.id === id);
  if (!found) throw new Error(`未知の地図スタイルです: ${id}`);
  return found;
}

export type CameraPreset = {
  center: LngLatTuple;
  zoom: number;
  pitch: number;
  bearing: number;
};

/** 初期表示：都心から埼玉県南部までを斜めに見下ろす視点 */
export const INITIAL_CAMERA: CameraPreset = {
  center: [139.72, 35.77],
  zoom: 10.2,
  pitch: 50,
  bearing: -12,
};

export const PITCH_3D = 55;
export const MAX_PITCH = 75;

export type RegionId = 'all' | 'tokyo23' | 'tama' | 'saitama-south' | 'saitama-north';

export type RegionPreset = {
  id: RegionId;
  label: string;
  /** fitBounds に渡す範囲。島しょ部（伊豆・小笠原諸島）は v1.0 の対象外のため含めない */
  bounds: BoundsTuple;
};

/**
 * 地域切り替え用の表示範囲。行政界の厳密な外接矩形ではなく、
 * 探索しやすい画角になるよう概略値で設定している。
 */
export const REGION_PRESETS: readonly RegionPreset[] = [
  {
    id: 'all',
    label: '東京都・埼玉県 全域',
    bounds: [
      [138.7, 35.48],
      [139.93, 36.29],
    ],
  },
  {
    id: 'tokyo23',
    label: '東京23区',
    bounds: [
      [139.56, 35.52],
      [139.92, 35.82],
    ],
  },
  {
    id: 'tama',
    label: '多摩地域',
    bounds: [
      [139.0, 35.6],
      [139.6, 35.8],
    ],
  },
  {
    id: 'saitama-south',
    label: '埼玉県南部（さいたま・川口・川越など）',
    bounds: [
      [139.38, 35.75],
      [139.88, 36.0],
    ],
  },
  {
    id: 'saitama-north',
    label: '埼玉県北部・秩父',
    bounds: [
      [138.7, 35.88],
      [139.6, 36.29],
    ],
  },
] as const;

export function getRegionPreset(id: RegionId): RegionPreset {
  const found = REGION_PRESETS.find((r) => r.id === id);
  if (!found) throw new Error(`未知の地域です: ${id}`);
  return found;
}

/** 3D建物の配色（濃色・淡色スタイルのどちらでも周囲と区別できる色） */
export const BUILDING_COLORS = {
  low: '#4a5160',
  mid: '#6b6f7d',
  high: '#9a8f7a',
  outline: '#2a2e36',
} as const;

/** 3D建物を表示し始めるズームレベル（これ未満では描画負荷を避けるため非表示） */
export const BUILDING_MIN_ZOOM = 13;
