import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog/ConfirmDialog';
import { FilterPanel } from '../components/FilterPanel/FilterPanel';
import { MapStatusBanner } from '../components/MapStatusBanner/MapStatusBanner';
import { MapView } from '../components/MapView/MapView';
import { ShopDetail } from '../components/ShopDetail/ShopDetail';
import { ShopEditor } from '../components/ShopEditor/ShopEditor';
import { ComparePanel } from '../components/ComparePanel/ComparePanel';
import { DataManager } from '../components/DataManager/DataManager';
import { RecordsPanel } from '../components/RecordsPanel/RecordsPanel';
import { RoutePlanner } from '../components/RoutePlanner/RoutePlanner';
import { useRoutes, type RouteStore } from '../hooks/useRoutes';
import {
  MAX_ROUTE_SHOPS,
  addShopToRoute,
  createRoute,
  removeShopFromRoute,
  routePoints,
  type PlannedRoute,
} from '../domain/route';
import { buildRouteFeatures } from '../services/map/routeLayers';
import {
  RoutingError,
  fetchOrsWalkingRoute,
  routeCacheKey,
  type WalkingRoute,
} from '../services/routing/routingService';
import { PersonalRecordSection } from '../components/ShopDetail/PersonalRecordSection';
import { VisitEditor } from '../components/VisitEditor/VisitEditor';
import { usePersonalStore, type PersonalStore } from '../hooks/usePersonalStore';
import type { Visit } from '../domain/visit';
import type { BackupRepository } from '../services/storage/backupRepository';
import { DensityLegend } from '../components/DensityLegend/DensityLegend';
import { Sidebar, type SidebarTab } from '../components/Sidebar/Sidebar';
import { StatusBar } from '../components/StatusBar/StatusBar';
import { EMPTY_FILTER, filterShops, type ShopFilter } from '../domain/search';
import { buildDensityGrid, DEFAULT_GRID_SIZE_M, type GridSizeM } from '../domain/density';
import { createEmptyShop, createId, primaryCategory, type DataSource, type Shop } from '../domain/shop';
import type { SurveyArea } from '../domain/survey';
import { useShopStore, type ShopStore } from '../hooks/useShopStore';
import { useSurveyAreas, type SurveyAreaStore } from '../hooks/useSurveyAreas';
import {
  EMPTY_GRID,
  stationsToFeatureCollection,
  surveyAreasToFeatureCollection,
  type DisplayMode,
} from '../services/map/densityLayers';
import type { BuildingsAvailability, CameraState, MapController, MapStatus } from '../services/map/mapAdapter';
import {
  DEFAULT_STYLE_ID,
  MAP_STYLES,
  REGION_PRESETS,
  type MapStyleId,
  type RegionId,
} from '../services/map/mapConfig';
import type { MapIssue } from '../services/map/mapErrors';
import { shopsToFeatureCollection } from '../services/map/shopLayers';

type Panel =
  { kind: 'none' } | { kind: 'detail'; shopId: string } | { kind: 'edit'; base: Shop; mode: 'create' | 'edit' };

type LatLng = { latitude: number; longitude: number };

type Props = {
  /** テスト用に差し替え可能な店舗ストア */
  useStore?: () => ShopStore;
  /** テスト用に差し替え可能な調査済みエリアのストア */
  useSurveyStore?: () => SurveyAreaStore;
  /** テスト用に差し替え可能な個人記録のストア */
  usePersonal?: () => PersonalStore;
  /** テスト用に差し替え可能なバックアップの保存先 */
  backupRepository?: BackupRepository;
  /** テスト用に差し替え可能なルートのストア */
  useRouteStore?: () => RouteStore;
  /** テスト用に差し替え可能な通信関数（徒歩経路の取得） */
  fetchImpl?: typeof fetch;
};

/** 地図クリックで位置を選ぶ対象 */
type PickTarget = 'shop' | 'survey' | null;

export function App({
  useStore = useShopStore,
  useSurveyStore = useSurveyAreas,
  usePersonal = usePersonalStore,
  backupRepository,
  useRouteStore = useRoutes,
  fetchImpl,
}: Props) {
  const store = useStore();
  const survey = useSurveyStore();
  const personal = usePersonal();
  const routeStore = useRouteStore();
  const controllerRef = useRef<MapController | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [issue, setIssue] = useState<MapIssue | null>(null);
  const [camera, setCamera] = useState<CameraState | null>(null);
  const [buildingsAvailability, setBuildingsAvailability] = useState<BuildingsAvailability>('unknown');
  const [styleId, setStyleId] = useState<MapStyleId>(DEFAULT_STYLE_ID);
  const [showBuildings, setShowBuildings] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [regionId, setRegionId] = useState<RegionId | ''>('');
  const [filter, setFilter] = useState<ShopFilter>(EMPTY_FILTER);
  const [panel, setPanel] = useState<Panel>({ kind: 'none' });
  const [pickTarget, setPickTarget] = useState<PickTarget>(null);
  const pickMode = pickTarget !== null;
  const setPickMode = useCallback((enabled: boolean) => setPickTarget(enabled ? 'shop' : null), []);
  const [pickedPosition, setPickedPosition] = useState<LatLng | null>(null);
  const [pickedSurveyPosition, setPickedSurveyPosition] = useState<LatLng | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('shops');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('markers');
  const [gridSizeM, setGridSizeM] = useState<GridSizeM>(DEFAULT_GRID_SIZE_M);
  const [showStations, setShowStations] = useState(false);
  const [surveyDeleteTarget, setSurveyDeleteTarget] = useState<SurveyArea | null>(null);
  const [draftPosition, setDraftPosition] = useState<LatLng | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Shop | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteVisitsWithShop, setDeleteVisitsWithShop] = useState(false);
  const [visitEdit, setVisitEdit] = useState<{ shop: Shop; visit: Visit | null } | null>(null);
  const [visitDeleteTarget, setVisitDeleteTarget] = useState<Visit | null>(null);
  const [dataManagerOpen, setDataManagerOpen] = useState(false);
  const [currentRouteId, setCurrentRouteId] = useState<string | null>(null);
  const [routeDeleteTarget, setRouteDeleteTarget] = useState<PlannedRoute | null>(null);
  const [walkingRoutes, setWalkingRoutes] = useState<ReadonlyMap<string, WalkingRoute>>(new Map());
  const [walkingStatus, setWalkingStatus] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null,
  });

  const mapUsable = status !== 'failed';

  // 検索条件や店舗データが変わったときだけ再計算する（地図の移動では再計算しない）
  const visitedShopIds = useMemo(() => new Set(personal.visitsByShop.keys()), [personal.visitsByShop]);
  const results = useMemo(
    () => filterShops(store.shops, filter, store.stations, { visitedShopIds, marks: personal.marks }),
    [store.shops, filter, store.stations, visitedShopIds, personal.marks],
  );
  const featureCollection = useMemo(() => shopsToFeatureCollection(results, visitedShopIds), [results, visitedShopIds]);
  const visitedResultCount = useMemo(
    () => results.filter((s) => visitedShopIds.has(s.id)).length,
    [results, visitedShopIds],
  );
  // 密度の集計も検索条件を反映する。格子は3D柱表示のときだけ計算する
  const densityGrid = useMemo(
    () => (displayMode === 'grid' ? buildDensityGrid(results, gridSizeM, survey.areas) : EMPTY_GRID),
    [displayMode, results, gridSizeM, survey.areas],
  );
  const surveyFeatures = useMemo(() => surveyAreasToFeatureCollection(survey.areas), [survey.areas]);
  const stationFeatures = useMemo(() => stationsToFeatureCollection(store.stations), [store.stations]);
  // はしご酒ルート：選択中のルートの地点と、取得済みの徒歩経路（同じ地点の並びのときだけ使う）
  const currentRoute = routeStore.routes.find((r) => r.id === currentRouteId) ?? null;
  const currentRoutePoints = useMemo(
    () => (currentRoute ? routePoints(currentRoute, store.shops, store.stations) : []),
    [currentRoute, store.shops, store.stations],
  );
  const routeKey = routeCacheKey(currentRoutePoints);
  const currentWalkingRoute = walkingRoutes.get(routeKey) ?? null;
  const routeFeatures = useMemo(
    () => buildRouteFeatures(currentRoutePoints, currentWalkingRoute?.geometry ?? null),
    [currentRoutePoints, currentWalkingRoute],
  );

  const changeRoute = useCallback(
    (route: PlannedRoute) => {
      setWalkingStatus((s) => (s.error ? { ...s, error: null } : s));
      routeStore.save(route).catch(() => undefined); // エラーは routeStore.error として表示する
    },
    [routeStore],
  );

  const createNewRoute = useCallback(() => {
    const now = new Date().toISOString();
    const route = createRoute(createId('route'), now, `はしご酒 ${routeStore.routes.length + 1}`);
    changeRoute(route);
    setCurrentRouteId(route.id);
    return route;
  }, [changeRoute, routeStore.routes.length]);

  const toggleShopInRoute = useCallback(
    (shopId: string) => {
      const now = new Date().toISOString();
      if (currentRoute?.shopIds.includes(shopId)) {
        changeRoute(removeShopFromRoute(currentRoute, shopId, now));
        return;
      }
      const base = currentRoute ?? createNewRoute();
      changeRoute(addShopToRoute(base, shopId, now));
    },
    [currentRoute, changeRoute, createNewRoute],
  );

  const fetchWalkingRoute = async () => {
    if (routeStore.routing.provider !== 'openrouteservice' || currentRoutePoints.length < 2) return;
    setWalkingStatus({ loading: true, error: null });
    try {
      const result = await fetchOrsWalkingRoute(currentRoutePoints, routeStore.routing.orsApiKey, fetchImpl);
      setWalkingRoutes((prev) => new Map(prev).set(routeKey, result));
      setWalkingStatus({ loading: false, error: null });
    } catch (e) {
      setWalkingStatus({
        loading: false,
        error:
          e instanceof RoutingError
            ? e.message
            : `徒歩ルートを取得できませんでした：${e instanceof Error ? e.message : String(e)}`,
      });
    }
  };

  const legendCounts = useMemo(() => {
    const categoryCounts: Record<string, number> = {};
    const priceCounts: Record<string, number> = {};
    for (const s of results) {
      const c = primaryCategory(s);
      categoryCounts[c] = (categoryCounts[c] ?? 0) + 1;
      priceCounts[s.priceLevel] = (priceCounts[s.priceLevel] ?? 0) + 1;
    }
    return { categoryCounts, priceCounts };
  }, [results]);

  const selectedShopId =
    panel.kind === 'detail' ? panel.shopId : panel.kind === 'edit' && panel.mode === 'edit' ? panel.base.id : null;
  const selectedShop = panel.kind === 'detail' ? (store.shops.find((s) => s.id === panel.shopId) ?? null) : null;

  const handleRegionChange = useCallback((id: RegionId | '') => {
    setRegionId(id);
    if (id) controllerRef.current?.flyToRegion(id);
  }, []);

  const rightPanelOpen = panel.kind !== 'none' && (panel.kind !== 'detail' || selectedShop !== null);

  // 左右のパネルを開閉しても、地図の中心地点がずれないようにする。
  // 下の移動処理より先に実行されるよう、ここで宣言する（effect は宣言順に実行される）
  useEffect(() => {
    controllerRef.current?.resizeKeepingCenter();
  }, [rightPanelOpen, sidebarOpen]);

  // 詳細パネルを開くと地図の幅が変わるため、移動はレイアウト確定後（effect）で行う
  const [flyTarget, setFlyTarget] = useState<{ latitude: number; longitude: number; zoom?: number } | null>(null);
  useEffect(() => {
    if (!flyTarget) return;
    controllerRef.current?.flyToPoint(flyTarget.latitude, flyTarget.longitude, flyTarget.zoom);
  }, [flyTarget]);

  const showShop = useCallback(
    (id: string, fly: boolean) => {
      setPickMode(false);
      setPanel({ kind: 'detail', shopId: id });
      const shop = store.shops.find((s) => s.id === id);
      // 同じ店舗を再度選んだ場合も移動するよう、毎回新しいオブジェクトにする
      if (fly && shop) setFlyTarget({ latitude: shop.latitude, longitude: shop.longitude });
    },
    [store.shops],
  );

  const startCreate = () => {
    setPickedPosition(null);
    setPanel({ kind: 'edit', mode: 'create', base: createEmptyShop(new Date().toISOString()) });
  };

  const closeEditor = useCallback(() => {
    setPickMode(false);
    setPanel((p) =>
      p.kind === 'edit' && p.mode === 'edit' ? { kind: 'detail', shopId: p.base.id } : { kind: 'none' },
    );
  }, []);

  const handleSave = useCallback(
    async (shop: Shop, newSources: DataSource[]) => {
      await store.saveShop(shop, newSources);
      setPickMode(false);
      setPanel({ kind: 'detail', shopId: shop.id });
    },
    [store],
  );

  const handleMapPick = useCallback(
    (p: LatLng) => {
      if (pickTarget === 'survey') setPickedSurveyPosition(p);
      else setPickedPosition(p);
      setPickTarget(null);
    },
    [pickTarget],
  );

  const exploreStation = useCallback(
    (stationId: string, radiusM: number) => {
      const station = store.stations.find((s) => s.id === stationId);
      setFilter((f) => ({ ...f, stationId, stationRadiusM: radiusM }));
      setSidebarTab('shops');
      if (station) setFlyTarget({ latitude: station.latitude, longitude: station.longitude, zoom: 15 });
    },
    [store.stations],
  );

  const confirmSurveyDelete = async () => {
    if (!surveyDeleteTarget) return;
    try {
      await survey.remove(surveyDeleteTarget.id);
    } finally {
      setSurveyDeleteTarget(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const deleteVisits = deleteVisitsWithShop && (personal.visitsByShop.get(deleteTarget.id)?.length ?? 0) > 0;
      await store.deleteShop(deleteTarget.id, { deleteVisits });
      personal.forgetShop(deleteTarget.id, deleteVisits);
      setPanel({ kind: 'none' });
      setDeleteTarget(null);
    } catch {
      // エラー内容は store.error として画面上部に表示される
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={`app ${sidebarOpen ? '' : 'is-sidebar-collapsed'} ${rightPanelOpen ? 'has-right-panel' : ''}`}>
      <header className="app-header">
        <div className="app-title">
          <h1>立ち呑み地形図</h1>
          <span className="app-title__sub">Tachinomi Atlas</span>
        </div>
        <div className="search-box">
          <input
            type="search"
            aria-label="店名・住所で検索"
            placeholder="店名・住所で検索"
            value={filter.keyword}
            onChange={(e) => setFilter((f) => ({ ...f, keyword: e.target.value }))}
          />
          <span className="search-box__count" aria-hidden="true">
            {results.length}件
          </span>
        </div>
        <button type="button" className="btn btn--primary" onClick={startCreate}>
          ＋ 店舗を追加
        </button>
        <button type="button" className="btn" onClick={() => setDataManagerOpen(true)}>
          データ管理
        </button>
        <div className="app-header__controls">
          <label className="field">
            <span className="field__label">地域</span>
            <select
              value={regionId}
              onChange={(e) => handleRegionChange(e.target.value as RegionId | '')}
              disabled={!mapUsable}
            >
              <option value="">地域を選んで移動…</option>
              {REGION_PRESETS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">地図スタイル</span>
            <select
              value={styleId}
              onChange={(e) => setStyleId(e.target.value as MapStyleId)}
              disabled={!mapUsable}
              title={MAP_STYLES.find((s) => s.id === styleId)?.description}
            >
              {MAP_STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((o) => !o)}
        tab={sidebarTab}
        onTabChange={setSidebarTab}
        displayMode={displayMode}
        onDisplayModeChange={setDisplayMode}
        gridSizeM={gridSizeM}
        onGridSizeChange={setGridSizeM}
        showStations={showStations}
        onShowStationsChange={setShowStations}
        stationCount={store.stations.length}
        routePanel={
          <RoutePlanner
            routes={routeStore.routes}
            current={currentRoute}
            shops={store.shops}
            stations={store.stations}
            onSelectRoute={(id) => {
              setCurrentRouteId(id);
              setWalkingStatus({ loading: false, error: null });
            }}
            onCreateRoute={createNewRoute}
            onChange={changeRoute}
            onDelete={setRouteDeleteTarget}
            onSelectShop={(id) => showShop(id, true)}
            onShowOnMap={() => controllerRef.current?.fitPoints(currentRoutePoints)}
            routing={routeStore.routing}
            onSaveRouting={(s) => {
              routeStore.saveRouting(s);
              setWalkingStatus({ loading: false, error: null });
            }}
            walkingRoute={currentWalkingRoute}
            onFetchWalkingRoute={fetchWalkingRoute}
            walkingStatus={walkingStatus}
            saveError={routeStore.error}
          />
        }
        recordsPanel={
          <RecordsPanel
            visits={personal.visits}
            marks={personal.marks}
            shops={store.shops}
            loading={personal.status === 'loading'}
            onSelectShop={(id) => showShop(id, true)}
            onOpenDataManager={() => setDataManagerOpen(true)}
          />
        }
        comparePanel={
          <ComparePanel
            shops={results}
            stations={store.stations}
            surveyAreas={survey.areas}
            onSaveSurveyArea={survey.save}
            onDeleteSurveyArea={setSurveyDeleteTarget}
            onExploreStation={exploreStation}
            onFlyTo={(p) => setFlyTarget({ ...p, zoom: 15 })}
            pickMode={pickTarget === 'survey'}
            onPickModeChange={(on) => setPickTarget(on ? 'survey' : null)}
            pickedPosition={pickedSurveyPosition}
          />
        }
        showBuildings={showBuildings}
        onShowBuildingsChange={setShowBuildings}
        buildingsAvailability={buildingsAvailability}
        mapUsable={mapUsable}
        onResetView={() => {
          setRegionId('');
          controllerRef.current?.resetView();
        }}
        onShowAll={() => handleRegionChange('all')}
        onViewMode={(mode) => controllerRef.current?.setViewMode(mode)}
        onResetNorth={() => controllerRef.current?.resetNorth()}
        shopPanel={
          <FilterPanel
            filter={filter}
            onChange={setFilter}
            allShops={store.shops}
            results={results}
            stations={store.stations}
            selectedShopId={selectedShopId}
            onSelectShop={(id) => showShop(id, true)}
            loading={store.status === 'loading'}
          />
        }
      />

      <main className="map-area">
        <MapView
          styleId={styleId}
          showBuildings={showBuildings}
          shops={featureCollection}
          selectedShopId={selectedShopId}
          pickMode={pickMode}
          draftPosition={panel.kind === 'edit' ? draftPosition : null}
          displayMode={displayMode}
          densityGrid={densityGrid}
          gridSizeM={gridSizeM}
          surveyAreas={surveyFeatures}
          stations={stationFeatures}
          showStations={showStations}
          route={routeFeatures}
          controllerRef={controllerRef}
          onStatusChange={setStatus}
          onIssue={setIssue}
          onCameraChange={setCamera}
          onBuildingsAvailability={setBuildingsAvailability}
          onShopClick={(id) => {
            if (panel.kind !== 'edit') showShop(id, false);
          }}
          onMapPick={handleMapPick}
        />
        <MapStatusBanner
          status={status}
          issue={issue}
          onRetry={() => controllerRef.current?.retry()}
          onDismiss={() => setIssue(null)}
        />
        <DensityLegend
          mode={displayMode}
          shownCount={results.length}
          categoryCounts={legendCounts.categoryCounts}
          priceCounts={legendCounts.priceCounts}
          gridSizeM={gridSizeM}
          surveyAreaCount={survey.areas.length}
          visitedCount={visitedResultCount}
        />
        {pickMode && (
          <div className="pick-hint" role="status">
            {pickTarget === 'survey'
              ? '地図上で調査済みエリアの中心をクリックしてください（中止はフォームのボタンから）'
              : '地図上で店舗の位置をクリックしてください（中止はフォームのボタンから）'}
          </div>
        )}
        {(store.error || survey.error || personal.error || store.dataIssues.length > 0) && (
          <div className="app-notices">
            {personal.error && (
              <div className="notice notice--danger" role="alert">
                <p>{personal.error}</p>
              </div>
            )}
            {survey.error && (
              <div className="notice notice--danger" role="alert">
                <p>{survey.error}</p>
              </div>
            )}
            {store.error && (
              <div className="notice notice--danger" role="alert">
                <p>{store.error}</p>
                <button type="button" className="btn btn--small" onClick={store.clearError}>
                  閉じる
                </button>
              </div>
            )}
            {store.dataIssues.length > 0 && (
              <details className="notice notice--warn">
                <summary>店舗データに確認が必要な点があります（{store.dataIssues.length}件）</summary>
                <ul>
                  {store.dataIssues.map((d, i) => (
                    <li key={`${d.id}-${i}`}>
                      {d.id ?? 'ID不明'}：{d.messages.join(' ')}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </main>

      {rightPanelOpen && (
        <aside
          // 表示内容が変わったらスクロール位置を先頭に戻す
          key={panel.kind === 'detail' ? `detail-${panel.shopId}` : `edit-${panel.base.id}`}
          className="right-panel"
          aria-label={panel.kind === 'edit' ? '店舗の編集' : '店舗の詳細'}
        >
          {panel.kind === 'detail' && selectedShop && (
            <ShopDetail
              shop={selectedShop}
              sources={store.sources}
              stations={store.stations}
              isSeedShop={store.seedShopIds.has(selectedShop.id)}
              onClose={() => setPanel({ kind: 'none' })}
              onEdit={() => {
                setPickedPosition(null);
                setPanel({ kind: 'edit', mode: 'edit', base: selectedShop });
              }}
              onDelete={() => {
                setDeleteVisitsWithShop(false);
                setDeleteTarget(selectedShop);
              }}
              personalSection={
                <PersonalRecordSection
                  mark={personal.marks.get(selectedShop.id)}
                  visits={personal.visitsByShop.get(selectedShop.id) ?? []}
                  onToggleMark={(kind) => personal.toggle(selectedShop.id, kind)}
                  onAddVisit={() => setVisitEdit({ shop: selectedShop, visit: null })}
                  onEditVisit={(visit) => setVisitEdit({ shop: selectedShop, visit })}
                  onDeleteVisit={setVisitDeleteTarget}
                  routeInfo={{
                    routeName: currentRoute?.name ?? null,
                    order:
                      currentRoute && currentRoute.shopIds.includes(selectedShop.id)
                        ? currentRoute.shopIds.indexOf(selectedShop.id)
                        : null,
                    full: (currentRoute?.shopIds.length ?? 0) >= MAX_ROUTE_SHOPS,
                  }}
                  onToggleRoute={() => toggleShopInRoute(selectedShop.id)}
                />
              }
              onShowOnMap={() => controllerRef.current?.flyToPoint(selectedShop.latitude, selectedShop.longitude)}
            />
          )}
          {panel.kind === 'edit' && (
            <ShopEditor
              key={panel.base.id}
              mode={panel.mode}
              base={panel.base}
              existingShops={store.shops}
              sources={store.sources}
              stations={store.stations}
              pickMode={pickTarget === 'shop'}
              onPickModeChange={setPickMode}
              pickedPosition={pickedPosition}
              onDraftPositionChange={setDraftPosition}
              onSave={handleSave}
              onCancel={closeEditor}
            />
          )}
        </aside>
      )}

      <StatusBar camera={camera} status={status} />

      {surveyDeleteTarget && (
        <ConfirmDialog
          title="調査済みエリアを削除しますか？"
          confirmLabel="削除する"
          danger
          onConfirm={confirmSurveyDelete}
          onCancel={() => setSurveyDeleteTarget(null)}
        >
          <p>「{surveyDeleteTarget.name}」を削除します。店舗データは削除されません。</p>
        </ConfirmDialog>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="店舗を削除しますか？"
          confirmLabel="削除する"
          danger
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        >
          <p>
            「{deleteTarget.name}」を削除します。この操作は取り消せません。
            {store.seedShopIds.has(deleteTarget.id) &&
              ' 初期データの店舗のため、削除した記録を保存し、次回以降も表示しません。'}
          </p>
          {(personal.visitsByShop.get(deleteTarget.id)?.length ?? 0) > 0 ? (
            <fieldset className="filter-group">
              <legend>この店舗の訪問記録（{personal.visitsByShop.get(deleteTarget.id)?.length}件）の扱い</legend>
              <label className="check">
                <input
                  type="radio"
                  name="delete-visits"
                  checked={!deleteVisitsWithShop}
                  onChange={() => setDeleteVisitsWithShop(false)}
                />
                訪問記録を残す（記録時の店名で「記録」タブに表示されます）
              </label>
              <label className="check">
                <input
                  type="radio"
                  name="delete-visits"
                  checked={deleteVisitsWithShop}
                  onChange={() => setDeleteVisitsWithShop(true)}
                />
                訪問記録も削除する
              </label>
            </fieldset>
          ) : (
            <p className="hint">この店舗の訪問記録はありません。お気に入り等の登録は削除されます。</p>
          )}
        </ConfirmDialog>
      )}

      {visitEdit && (
        <VisitEditor
          shopId={visitEdit.shop.id}
          shopName={visitEdit.shop.name}
          visit={visitEdit.visit}
          onSave={async (v) => {
            await personal.saveVisit(v);
            setVisitEdit(null);
          }}
          onCancel={() => setVisitEdit(null)}
        />
      )}

      {visitDeleteTarget && (
        <ConfirmDialog
          title="訪問記録を削除しますか？"
          confirmLabel="削除する"
          danger
          onConfirm={async () => {
            try {
              await personal.deleteVisit(visitDeleteTarget.id);
            } finally {
              setVisitDeleteTarget(null);
            }
          }}
          onCancel={() => setVisitDeleteTarget(null)}
        >
          <p>この訪問記録を削除します。この操作は取り消せません。</p>
        </ConfirmDialog>
      )}

      {routeDeleteTarget && (
        <ConfirmDialog
          title="はしご酒ルートを削除しますか？"
          confirmLabel="削除する"
          danger
          onConfirm={async () => {
            try {
              await routeStore.remove(routeDeleteTarget.id);
              if (currentRouteId === routeDeleteTarget.id) setCurrentRouteId(null);
            } finally {
              setRouteDeleteTarget(null);
            }
          }}
          onCancel={() => setRouteDeleteTarget(null)}
        >
          <p>「{routeDeleteTarget.name}」を削除します。店舗や訪問記録は削除されません。</p>
        </ConfirmDialog>
      )}

      {dataManagerOpen && (
        <DataManager
          allShops={store.shops}
          allSources={store.sources}
          onClose={() => setDataManagerOpen(false)}
          repository={backupRepository}
          onImported={() => {
            store.reload();
            survey.reload();
            personal.reload();
            routeStore.reload();
          }}
        />
      )}
    </div>
  );
}
