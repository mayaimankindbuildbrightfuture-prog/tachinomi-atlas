/**
 * MapLibre GL JS を包むアダプター。
 *
 * UI コンポーネントは MapLibre の API を直接触らず、ここで公開する MapController を通して操作する。
 * これにより、地図ライブラリの差し替えやテスト時のモック化を容易にする。
 */
import {
  AttributionControl,
  FullscreenControl,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type ErrorEvent,
} from 'maplibre-gl';
// MapLibre v6 はワーカーをモジュールの相対パスから読み込むため、Vite の依存最適化・ビルド後も
// 正しく解決できるよう、ワーカーファイルをアセットとして明示的に指定する。
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {
  BUILDING_MIN_ZOOM,
  DEFAULT_STYLE_ID,
  INITIAL_CAMERA,
  MAX_PITCH,
  PITCH_3D,
  getRegionPreset,
  getStyleOption,
  type MapStyleId,
  type RegionId,
} from './mapConfig';
import {
  BUILDINGS_3D_LAYER_ID,
  OFFLINE_FALLBACK_STYLE,
  buildBuildings3DLayer,
  findBuildingSourceId,
  findExistingBuildingExtrusionIds,
  findFirstSymbolLayerId,
  localizeLabelLayers,
} from './layers';
import {
  getErrorUrl,
  isTileLikeUrl,
  styleLoadFailedIssue,
  tilesFailedIssue,
  unknownIssue,
  webglUnavailableIssue,
  type MapIssue,
} from './mapErrors';

export type CameraState = {
  lng: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
};

/** loading: スタイル読込中 / ready: 通常表示 / fallback: 外部地図なしの簡易表示 / failed: 地図を使用不可 */
export type MapStatus = 'loading' | 'ready' | 'fallback' | 'failed';

export type BuildingsAvailability = 'available' | 'unavailable' | 'unknown';

export type MapEventHandlers = {
  onStatusChange?: (status: MapStatus) => void;
  onIssue?: (issue: MapIssue | null) => void;
  onCameraChange?: (camera: CameraState) => void;
  onBuildingsAvailability?: (availability: BuildingsAvailability) => void;
};

export type MapControllerOptions = {
  styleId?: MapStyleId;
  showBuildings?: boolean;
};

export interface MapController {
  flyToRegion(regionId: RegionId): void;
  resetView(): void;
  setViewMode(mode: '2d' | '3d'): void;
  resetNorth(): void;
  setStyle(styleId: MapStyleId): void;
  setBuildingsVisible(visible: boolean): void;
  retry(): void;
  getCamera(): CameraState;
  destroy(): void;
}

setWorkerUrl(maplibreWorkerUrl);

/** 日本語化した地図コントロールのツールチップ */
const JA_LOCALE: Record<string, string> = {
  'NavigationControl.ZoomIn': '拡大',
  'NavigationControl.ZoomOut': '縮小',
  'NavigationControl.ResetBearing': '方位を北に戻す（ドラッグで回転・傾き）',
  'FullscreenControl.Enter': '全画面表示',
  'FullscreenControl.Exit': '全画面表示を終了',
  'AttributionControl.ToggleAttribution': '地図データの出典を表示',
  'AttributionControl.MapFeedback': '地図の誤りを報告',
  'ScaleControl.Meters': 'm',
  'ScaleControl.Kilometers': 'km',
};

/** 失敗タイル数の通知を間引く間隔（ミリ秒） */
const TILE_ISSUE_THROTTLE_MS = 1500;

export function readCamera(map: Pick<MapLibreMap, 'getCenter' | 'getZoom' | 'getPitch' | 'getBearing'>): CameraState {
  const c = map.getCenter();
  return {
    lng: c.lng,
    lat: c.lat,
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
  };
}

/**
 * 地図を生成する。WebGL が使えない等で生成できない場合は onIssue に致命的エラーを通知し null を返す。
 */
export function createMapController(
  container: HTMLElement,
  options: MapControllerOptions,
  handlers: MapEventHandlers,
): MapController | null {
  let styleId: MapStyleId = options.styleId ?? DEFAULT_STYLE_ID;
  let showBuildings = options.showBuildings ?? true;
  let styleLoaded = false;
  let usingFallback = false;
  let failedTileCount = 0;
  let lastTileIssueAt = 0;
  let destroyed = false;

  const online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

  let map: MapLibreMap;
  try {
    map = new MapLibreMap({
      container,
      style: getStyleOption(styleId).url,
      center: INITIAL_CAMERA.center,
      zoom: INITIAL_CAMERA.zoom,
      pitch: INITIAL_CAMERA.pitch,
      bearing: INITIAL_CAMERA.bearing,
      maxPitch: MAX_PITCH,
      attributionControl: false,
      locale: JA_LOCALE,
      // 失敗したリクエストを延々と再試行しないよう、MapLibre 既定の挙動に任せる（自前の再試行はしない）
    });
  } catch (error) {
    handlers.onStatusChange?.('failed');
    handlers.onIssue?.(webglUnavailableIssue(error));
    return null;
  }

  map.addControl(new NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }), 'top-right');
  map.addControl(new FullscreenControl(), 'top-right');
  map.addControl(new ScaleControl({ unit: 'metric', maxWidth: 120 }), 'bottom-left');
  map.addControl(new AttributionControl({ compact: false }), 'bottom-right');

  handlers.onStatusChange?.('loading');
  handlers.onCameraChange?.(readCamera(map));

  const applyBuildingsVisibility = () => {
    if (map.getLayer(BUILDINGS_3D_LAYER_ID)) {
      map.setLayoutProperty(BUILDINGS_3D_LAYER_ID, 'visibility', showBuildings ? 'visible' : 'none');
    }
  };

  /** スタイル読み込み完了ごとに、日本語ラベル化と3D建物レイヤーの追加を行う */
  const customizeStyle = () => {
    const style = map.getStyle();

    const localized = localizeLabelLayers(style.layers);
    localized.forEach((layer, i) => {
      const before = style.layers[i];
      if (layer !== before && layer.type === 'symbol' && layer.layout) {
        map.setLayoutProperty(layer.id, 'text-field', layer.layout['text-field']);
      }
    });

    for (const id of findExistingBuildingExtrusionIds(style)) {
      map.setLayoutProperty(id, 'visibility', 'none');
    }

    const sourceId = findBuildingSourceId(style);
    if (sourceId && !map.getLayer(BUILDINGS_3D_LAYER_ID)) {
      map.addLayer(buildBuildings3DLayer(sourceId), findFirstSymbolLayerId(style));
    }
    applyBuildingsVisibility();
    handlers.onBuildingsAvailability?.(sourceId ? 'available' : 'unavailable');
  };

  map.on('style.load', () => {
    if (destroyed) return;
    styleLoaded = true;
    try {
      customizeStyle();
    } catch (error) {
      // スタイルの加工に失敗しても地図自体は表示を続ける
      handlers.onIssue?.(unknownIssue(error));
    }
    handlers.onStatusChange?.(usingFallback ? 'fallback' : 'ready');
    if (!usingFallback) {
      failedTileCount = 0;
      handlers.onIssue?.(null);
    }
  });

  map.on('error', (event: ErrorEvent) => {
    if (destroyed) return;
    const error = event.error;
    const url = getErrorUrl(error);

    if (!styleLoaded && !isTileLikeUrl(url)) {
      // スタイル JSON 自体が取得できない → 外部通信なしの簡易スタイルに切り替える
      usingFallback = true;
      handlers.onIssue?.(styleLoadFailedIssue(error, online()));
      map.setStyle(OFFLINE_FALLBACK_STYLE, { diff: false });
      return;
    }

    if (isTileLikeUrl(url)) {
      failedTileCount += 1;
      const now = Date.now();
      if (now - lastTileIssueAt >= TILE_ISSUE_THROTTLE_MS) {
        lastTileIssueAt = now;
        handlers.onIssue?.(tilesFailedIssue(error, failedTileCount, online()));
      }
      return;
    }

    if (!usingFallback) handlers.onIssue?.(unknownIssue(error));
  });

  // カメラ情報は操作終了時のみ通知し、ドラッグ中に React の再描画を繰り返さない
  map.on('moveend', () => {
    if (!destroyed) handlers.onCameraChange?.(readCamera(map));
  });

  const loadStyle = (id: MapStyleId) => {
    styleId = id;
    styleLoaded = false;
    usingFallback = false;
    failedTileCount = 0;
    handlers.onIssue?.(null);
    handlers.onStatusChange?.('loading');
    handlers.onBuildingsAvailability?.('unknown');
    map.setStyle(getStyleOption(id).url, { diff: false });
  };

  return {
    flyToRegion(regionId) {
      const { bounds } = getRegionPreset(regionId);
      map.fitBounds(bounds, { padding: 40, pitch: map.getPitch(), bearing: map.getBearing(), duration: 1200 });
    },
    resetView() {
      map.flyTo({ ...INITIAL_CAMERA, duration: 1200 });
    },
    setViewMode(mode) {
      const pitch = mode === '3d' ? PITCH_3D : 0;
      // 3D表示にした時、建物が見えるズームまで寄っていない場合は寄せる
      const zoom = mode === '3d' ? Math.max(map.getZoom(), BUILDING_MIN_ZOOM + 1.5) : map.getZoom();
      map.easeTo({ pitch, zoom, duration: 800 });
    },
    resetNorth() {
      map.easeTo({ bearing: 0, duration: 600 });
    },
    setStyle(id) {
      if (id !== styleId || usingFallback) loadStyle(id);
    },
    setBuildingsVisible(visible) {
      showBuildings = visible;
      applyBuildingsVisibility();
    },
    retry() {
      loadStyle(styleId);
    },
    getCamera() {
      return readCamera(map);
    },
    destroy() {
      destroyed = true;
      map.remove();
    },
  };
}
