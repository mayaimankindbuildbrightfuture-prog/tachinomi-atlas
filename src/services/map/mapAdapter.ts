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
  Marker,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  Popup,
  type ErrorEvent,
  type GeoJSONSource,
  type MapMouseEvent,
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
  findBuildingInsertBeforeId,
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
import {
  CATEGORY_ICONS,
  SHOP_LAYER_IDS,
  SHOP_SOURCE_ID,
  buildClusterCountLayer,
  buildClusterLayer,
  buildHitLayer,
  buildLabelLayer,
  buildPointLayer,
  buildSelectedHaloLayer,
  buildShopSource,
  drawCategoryIcon,
  pickTextFont,
  selectedFilter,
  type ShopFeatureCollection,
} from './shopLayers';
import {
  DENSITY_LAYER_IDS,
  EMPTY_GRID,
  GRID_SOURCE_ID,
  RAW_SOURCE_ID,
  STATION_SOURCE_ID,
  SURVEY_SOURCE_ID,
  buildCategoryPointLayer,
  buildGrid3dLayer,
  buildGridZeroLayer,
  buildHeatmapLayer,
  buildPricePointLayer,
  buildStationLabelLayer,
  buildStationLayer,
  buildSurveyFillLayer,
  buildSurveyLineLayer,
  clickableShopLayers,
  layerVisibility,
  type DisplayMode,
  type StationFeatureCollection,
  type SurveyAreaFeatureCollection,
} from './densityLayers';
import type { GridFeatureCollection } from '../../domain/density';

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
  /** 店舗マーカーがクリックされた */
  onShopClick?: (shopId: string) => void;
  /** 位置選択モードで地図がクリックされた */
  onMapPick?: (position: { latitude: number; longitude: number }) => void;
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
  /** 表示する店舗を差し替える（地図は再生成しない） */
  setShops(data: ShopFeatureCollection): void;
  setSelectedShop(shopId: string | null): void;
  /** 指定地点へ移動する（ズームは現在より寄る方向にのみ変える） */
  flyToPoint(latitude: number, longitude: number, minZoom?: number): void;
  /** true の間は地図クリックを位置選択として扱う */
  setPickMode(enabled: boolean): void;
  /** 編集中の店舗位置を仮マーカーで示す（null で消す） */
  setDraftPosition(position: { latitude: number; longitude: number } | null): void;
  /** パネルの開閉で地図の大きさが変わったとき、地図の中心地点を保ったまま大きさを反映する */
  resizeKeepingCenter(): void;
  /** 表示モード（店舗マーカー・密度・分布）を切り替える */
  setDisplayMode(mode: DisplayMode): void;
  /** 密度（3D柱）表示用の格子データ。sizeM はマス1辺の長さ */
  setDensityGrid(data: GridFeatureCollection, sizeM: number): void;
  setSurveyAreas(data: SurveyAreaFeatureCollection): void;
  setStations(data: StationFeatureCollection): void;
  setStationsVisible(visible: boolean): void;
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
  let shopData: ShopFeatureCollection = { type: 'FeatureCollection', features: [] };
  let selectedShopId: string | null = null;
  let pickMode = false;
  let draftMarker: Marker | null = null;
  let displayMode: DisplayMode = 'markers';
  let gridData: GridFeatureCollection = EMPTY_GRID;
  let gridSizeM = 500;
  let surveyData: SurveyAreaFeatureCollection = { type: 'FeatureCollection', features: [] };
  let stationData: StationFeatureCollection = { type: 'FeatureCollection', features: [] };
  let showStations = false;
  const popup = new Popup({ closeButton: true, closeOnClick: true, maxWidth: '260px' });

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

  const applyLayerVisibility = () => {
    for (const [id, visible] of Object.entries(layerVisibility(displayMode, showStations))) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  };

  const setSourceData = (id: string, data: GeoJSON.GeoJSON) => {
    map.getSource<GeoJSONSource>(id)?.setData(data);
  };

  /**
   * 店舗・密度・駅のレイヤーを追加する。スタイルを切り替えるとレイヤーと画像は消えるため、読み込みのたびに呼ぶ。
   * 追加順が描画順になる（調査済みエリア → 密度 → 駅 → 分布の点 → 店舗マーカー）。
   */
  const addShopLayers = () => {
    if (map.getLayer(SHOP_LAYER_IDS.points)) return;
    const style = map.getStyle();
    map.addSource(SURVEY_SOURCE_ID, { type: 'geojson', data: surveyData });
    map.addSource(GRID_SOURCE_ID, { type: 'geojson', data: gridData });
    map.addSource(RAW_SOURCE_ID, { type: 'geojson', data: shopData });
    map.addSource(STATION_SOURCE_ID, { type: 'geojson', data: stationData });
    map.addLayer(buildSurveyFillLayer());
    map.addLayer(buildSurveyLineLayer());
    map.addLayer(buildGridZeroLayer());
    map.addLayer(buildGrid3dLayer());
    map.addLayer(buildHeatmapLayer());
    map.addLayer(buildStationLayer());
    if (style.glyphs) map.addLayer(buildStationLabelLayer(pickTextFont(style.layers)));
    map.addLayer(buildCategoryPointLayer());
    map.addLayer(buildPricePointLayer());

    const pixelRatio = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;
    for (const icon of CATEGORY_ICONS) {
      if (map.hasImage(icon.id)) continue;
      const image = drawCategoryIcon(icon.color, icon.label, pixelRatio);
      if (image) map.addImage(icon.id, image, { pixelRatio });
    }
    if (!map.getSource(SHOP_SOURCE_ID)) map.addSource(SHOP_SOURCE_ID, buildShopSource(shopData));
    // 文字を描くには glyphs（フォント）の配信元が必要。簡易表示では文字ラベルを省略する
    const textFont = pickTextFont(style.layers);
    map.addLayer(buildClusterLayer());
    if (style.glyphs) map.addLayer(buildClusterCountLayer(textFont));
    map.addLayer(buildSelectedHaloLayer(selectedShopId));
    map.addLayer(buildPointLayer());
    map.addLayer(buildHitLayer());
    if (style.glyphs) map.addLayer(buildLabelLayer(textFont));
    applyLayerVisibility();
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
      map.addLayer(buildBuildings3DLayer(sourceId), findBuildingInsertBeforeId(style));
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
    try {
      addShopLayers();
    } catch (error) {
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

  const featureAt = (e: MapMouseEvent, layerIds: string[]) => {
    const layers = layerIds.filter((id) => map.getLayer(id));
    if (layers.length === 0) return undefined;
    return map.queryRenderedFeatures(e.point, { layers })[0];
  };
  const shopFeatureAt = (e: MapMouseEvent) => featureAt(e, clickableShopLayers(displayMode));
  const gridFeatureAt = (e: MapMouseEvent) =>
    displayMode === 'grid' ? featureAt(e, [DENSITY_LAYER_IDS.grid3d, DENSITY_LAYER_IDS.gridZero]) : undefined;

  /** 格子のマスをクリックしたときの説明（文字列のみ。HTMLは使わない） */
  const showGridPopup = (e: MapMouseEvent, props: Record<string, unknown>) => {
    const count = typeof props.count === 'number' ? props.count : 0;
    const surveyed = props.surveyed === true;
    const size = gridSizeM >= 1000 ? `${gridSizeM / 1000}km` : `${gridSizeM}m`;
    const text =
      count > 0
        ? `このマス（約${size}四方）の登録店舗：${count}件${surveyed ? '（調査済みエリア内）' : '（網羅的な調査ではありません）'}`
        : `このマス（約${size}四方）：調査済みで登録店舗0件`;
    popup.setLngLat(e.lngLat).setText(text).addTo(map);
  };

  map.on('click', (e) => {
    if (destroyed) return;
    if (pickMode) {
      handlers.onMapPick?.({ latitude: e.lngLat.lat, longitude: e.lngLat.lng });
      return;
    }
    const feature = shopFeatureAt(e);
    if (!feature) {
      const cell = gridFeatureAt(e);
      if (cell) showGridPopup(e, cell.properties as Record<string, unknown>);
      return;
    }
    const props = feature.properties as Record<string, unknown>;
    if (typeof props.cluster_id === 'number' && feature.geometry.type === 'Point') {
      const center = feature.geometry.coordinates as [number, number];
      const source = map.getSource<GeoJSONSource>(SHOP_SOURCE_ID);
      source
        ?.getClusterExpansionZoom(props.cluster_id)
        .then((zoom) => map.easeTo({ center, zoom: zoom + 0.5, duration: 600 }))
        .catch(() => undefined);
      return;
    }
    if (typeof props.id === 'string') handlers.onShopClick?.(props.id);
  });

  map.on('mousemove', (e) => {
    if (destroyed) return;
    map.getCanvas().style.cursor = pickMode ? 'crosshair' : shopFeatureAt(e) || gridFeatureAt(e) ? 'pointer' : '';
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
    setShops(data) {
      shopData = data;
      setSourceData(SHOP_SOURCE_ID, data);
      setSourceData(RAW_SOURCE_ID, data);
    },
    setDisplayMode(mode) {
      displayMode = mode;
      popup.remove();
      applyLayerVisibility();
    },
    setDensityGrid(data, sizeM) {
      gridData = data;
      gridSizeM = sizeM;
      popup.remove();
      setSourceData(GRID_SOURCE_ID, data);
    },
    setSurveyAreas(data) {
      surveyData = data;
      setSourceData(SURVEY_SOURCE_ID, data);
    },
    setStations(data) {
      stationData = data;
      setSourceData(STATION_SOURCE_ID, data);
    },
    setStationsVisible(visible) {
      showStations = visible;
      applyLayerVisibility();
    },
    setSelectedShop(shopId) {
      selectedShopId = shopId;
      if (map.getLayer(SHOP_LAYER_IDS.selectedHalo)) {
        map.setFilter(SHOP_LAYER_IDS.selectedHalo, selectedFilter(shopId));
      }
    },
    flyToPoint(latitude, longitude, minZoom = 16) {
      // パネルの開閉で地図の大きさが変わった直後でも正しく中央に来るよう、先に大きさを反映する
      map.resize();
      map.flyTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), minZoom), duration: 1000 });
    },
    resizeKeepingCenter() {
      // 移動アニメーション中に中心を設定するとアニメーションが止まるため、大きさの反映のみ行う
      if (map.isMoving()) {
        map.resize();
        return;
      }
      const center = map.getCenter();
      map.resize();
      map.setCenter(center);
    },
    setDraftPosition(position) {
      if (!position) {
        draftMarker?.remove();
        draftMarker = null;
        return;
      }
      if (!draftMarker) {
        const el = document.createElement('div');
        el.className = 'draft-marker';
        el.title = '編集中の店舗の位置';
        draftMarker = new Marker({ element: el, anchor: 'bottom' });
      }
      draftMarker.setLngLat([position.longitude, position.latitude]).addTo(map);
    },
    setPickMode(enabled) {
      pickMode = enabled;
      map.getCanvas().style.cursor = enabled ? 'crosshair' : '';
    },
    destroy() {
      destroyed = true;
      draftMarker?.remove();
      popup.remove();
      map.remove();
    },
  };
}
