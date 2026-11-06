import { useCallback, useRef, useState } from 'react';
import { MapView } from '../components/MapView/MapView';
import { MapStatusBanner } from '../components/MapStatusBanner/MapStatusBanner';
import { Sidebar } from '../components/Sidebar/Sidebar';
import { StatusBar } from '../components/StatusBar/StatusBar';
import type {
  BuildingsAvailability,
  CameraState,
  MapController,
  MapStatus,
} from '../services/map/mapAdapter';
import {
  DEFAULT_STYLE_ID,
  MAP_STYLES,
  REGION_PRESETS,
  type MapStyleId,
  type RegionId,
} from '../services/map/mapConfig';
import type { MapIssue } from '../services/map/mapErrors';

export function App() {
  const controllerRef = useRef<MapController | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [issue, setIssue] = useState<MapIssue | null>(null);
  const [camera, setCamera] = useState<CameraState | null>(null);
  const [buildingsAvailability, setBuildingsAvailability] = useState<BuildingsAvailability>('unknown');
  const [styleId, setStyleId] = useState<MapStyleId>(DEFAULT_STYLE_ID);
  const [showBuildings, setShowBuildings] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [regionId, setRegionId] = useState<RegionId | ''>('');

  const mapUsable = status !== 'failed';

  const handleRegionChange = useCallback((id: RegionId | '') => {
    setRegionId(id);
    if (id) controllerRef.current?.flyToRegion(id);
  }, []);

  return (
    <div className={`app ${sidebarOpen ? '' : 'is-sidebar-collapsed'}`}>
      <header className="app-header">
        <div className="app-title">
          <h1>立ち呑み地形図</h1>
          <span className="app-title__sub">Tachinomi Atlas</span>
        </div>
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
      />

      <main className="map-area">
        <MapView
          styleId={styleId}
          showBuildings={showBuildings}
          controllerRef={controllerRef}
          onStatusChange={setStatus}
          onIssue={setIssue}
          onCameraChange={setCamera}
          onBuildingsAvailability={setBuildingsAvailability}
        />
        <MapStatusBanner
          status={status}
          issue={issue}
          onRetry={() => controllerRef.current?.retry()}
          onDismiss={() => setIssue(null)}
        />
      </main>

      <StatusBar camera={camera} status={status} />
    </div>
  );
}
