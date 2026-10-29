import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog/ConfirmDialog';
import { FilterPanel } from '../components/FilterPanel/FilterPanel';
import { MapStatusBanner } from '../components/MapStatusBanner/MapStatusBanner';
import { MapView } from '../components/MapView/MapView';
import { ShopDetail } from '../components/ShopDetail/ShopDetail';
import { ShopEditor } from '../components/ShopEditor/ShopEditor';
import { Sidebar } from '../components/Sidebar/Sidebar';
import { StatusBar } from '../components/StatusBar/StatusBar';
import { EMPTY_FILTER, filterShops, type ShopFilter } from '../domain/search';
import { createEmptyShop, type DataSource, type Shop } from '../domain/shop';
import { useShopStore, type ShopStore } from '../hooks/useShopStore';
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
};

export function App({ useStore = useShopStore }: Props) {
  const store = useStore();
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
  const [pickMode, setPickMode] = useState(false);
  const [pickedPosition, setPickedPosition] = useState<LatLng | null>(null);
  const [draftPosition, setDraftPosition] = useState<LatLng | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Shop | null>(null);
  const [deleting, setDeleting] = useState(false);

  const mapUsable = status !== 'failed';

  // 検索条件や店舗データが変わったときだけ再計算する（地図の移動では再計算しない）
  const results = useMemo(() => filterShops(store.shops, filter), [store.shops, filter]);
  const featureCollection = useMemo(() => shopsToFeatureCollection(results), [results]);

  const selectedShopId =
    panel.kind === 'detail' ? panel.shopId : panel.kind === 'edit' && panel.mode === 'edit' ? panel.base.id : null;
  const selectedShop = panel.kind === 'detail' ? (store.shops.find((s) => s.id === panel.shopId) ?? null) : null;

  const handleRegionChange = useCallback((id: RegionId | '') => {
    setRegionId(id);
    if (id) controllerRef.current?.flyToRegion(id);
  }, []);

  // 詳細パネルを開くと地図の幅が変わるため、移動はレイアウト確定後（effect）で行う
  const [flyTarget, setFlyTarget] = useState<{ latitude: number; longitude: number } | null>(null);
  useEffect(() => {
    if (!flyTarget) return;
    controllerRef.current?.flyToPoint(flyTarget.latitude, flyTarget.longitude);
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

  const handleMapPick = useCallback((p: LatLng) => {
    setPickedPosition(p);
    setPickMode(false);
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await store.deleteShop(deleteTarget.id);
      setPanel({ kind: 'none' });
      setDeleteTarget(null);
    } catch {
      // エラー内容は store.error として画面上部に表示される
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const rightPanelOpen = panel.kind !== 'none' && (panel.kind !== 'detail' || selectedShop !== null);

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
        {pickMode && (
          <div className="pick-hint" role="status">
            地図上で店舗の位置をクリックしてください（中止はフォームのボタンから）
          </div>
        )}
        {(store.error || store.dataIssues.length > 0) && (
          <div className="app-notices">
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
              onDelete={() => setDeleteTarget(selectedShop)}
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
              pickMode={pickMode}
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
          <p className="hint">
            訪問記録の機能は今後のフェーズで追加予定のため、現在この店舗に紐づく個人記録はありません。
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
