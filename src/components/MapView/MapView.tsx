import { useEffect, useRef, type RefObject } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createMapController, type MapController, type MapEventHandlers } from '../../services/map/mapAdapter';
import type { MapStyleId } from '../../services/map/mapConfig';
import type { ShopFeatureCollection } from '../../services/map/shopLayers';
import type {
  DisplayMode,
  StationFeatureCollection,
  SurveyAreaFeatureCollection,
} from '../../services/map/densityLayers';
import type { GridFeatureCollection } from '../../domain/density';
import './MapView.css';

type Props = MapEventHandlers & {
  styleId: MapStyleId;
  showBuildings: boolean;
  shops: ShopFeatureCollection;
  selectedShopId: string | null;
  pickMode: boolean;
  draftPosition: { latitude: number; longitude: number } | null;
  displayMode: DisplayMode;
  densityGrid: GridFeatureCollection;
  gridSizeM: number;
  surveyAreas: SurveyAreaFeatureCollection;
  stations: StationFeatureCollection;
  showStations: boolean;
  /** 親コンポーネントが地図を操作するためのコントローラー参照 */
  controllerRef: RefObject<MapController | null>;
};

/**
 * 地図を描画するコンポーネント。地図インスタンスはマウント時に一度だけ生成し、
 * 以降のプロパティ変更はコントローラー経由で反映する（地図全体を再生成しない）。
 */
export function MapView({
  styleId,
  showBuildings,
  shops,
  selectedShopId,
  pickMode,
  draftPosition,
  displayMode,
  densityGrid,
  gridSizeM,
  surveyAreas,
  stations,
  showStations,
  controllerRef,
  ...handlers
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 生成後に変わるハンドラーを常に最新のものへ委譲する
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const initialOptions = useRef({ styleId, showBuildings });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const controller = createMapController(container, initialOptions.current, {
      onStatusChange: (s) => handlersRef.current.onStatusChange?.(s),
      onIssue: (i) => handlersRef.current.onIssue?.(i),
      onCameraChange: (c) => handlersRef.current.onCameraChange?.(c),
      onBuildingsAvailability: (a) => handlersRef.current.onBuildingsAvailability?.(a),
      onShopClick: (id) => handlersRef.current.onShopClick?.(id),
      onMapPick: (p) => handlersRef.current.onMapPick?.(p),
    });
    controllerRef.current = controller;
    return () => {
      controller?.destroy();
      controllerRef.current = null;
    };
  }, [controllerRef]);

  useEffect(() => {
    controllerRef.current?.setStyle(styleId);
  }, [styleId, controllerRef]);

  useEffect(() => {
    controllerRef.current?.setBuildingsVisible(showBuildings);
  }, [showBuildings, controllerRef]);

  useEffect(() => {
    controllerRef.current?.setShops(shops);
  }, [shops, controllerRef]);

  useEffect(() => {
    controllerRef.current?.setSelectedShop(selectedShopId);
  }, [selectedShopId, controllerRef]);

  useEffect(() => {
    controllerRef.current?.setPickMode(pickMode);
  }, [pickMode, controllerRef]);

  useEffect(() => {
    controllerRef.current?.setDraftPosition(draftPosition);
  }, [draftPosition, controllerRef]);

  useEffect(() => {
    controllerRef.current?.setDisplayMode(displayMode);
  }, [displayMode, controllerRef]);

  useEffect(() => {
    controllerRef.current?.setDensityGrid(densityGrid, gridSizeM);
  }, [densityGrid, gridSizeM, controllerRef]);

  useEffect(() => {
    controllerRef.current?.setSurveyAreas(surveyAreas);
  }, [surveyAreas, controllerRef]);

  useEffect(() => {
    controllerRef.current?.setStations(stations);
  }, [stations, controllerRef]);

  useEffect(() => {
    controllerRef.current?.setStationsVisible(showStations);
  }, [showStations, controllerRef]);

  return <div ref={containerRef} className="map-view" data-testid="map-container" aria-label="3D地図" role="region" />;
}
