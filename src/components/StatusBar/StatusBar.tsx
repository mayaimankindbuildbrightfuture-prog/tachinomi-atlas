import type { CameraState, MapStatus } from '../../services/map/mapAdapter';

type Props = {
  camera: CameraState | null;
  status: MapStatus;
};

const STATUS_LABEL: Record<MapStatus, string> = {
  loading: '読み込み中',
  ready: '地図表示中',
  fallback: '簡易表示（外部地図なし）',
  failed: '地図を表示できません',
};

/** 画面下部：現在の視点などの操作情報 */
export function StatusBar({ camera, status }: Props) {
  return (
    <footer className="status-bar" aria-label="地図の状態">
      <span className={`status-dot status-dot--${status}`} aria-hidden="true" />
      <span>{STATUS_LABEL[status]}</span>
      {camera && (
        <>
          <span className="status-bar__item">
            中心 {camera.lat.toFixed(4)}, {camera.lng.toFixed(4)}
          </span>
          <span className="status-bar__item">ズーム {camera.zoom.toFixed(1)}</span>
          <span className="status-bar__item">傾き {Math.round(camera.pitch)}°</span>
          <span className="status-bar__item">方位 {Math.round(normalizeBearing(camera.bearing))}°</span>
        </>
      )}
      <span className="status-bar__spacer" />
      <span className="status-bar__note">地図: OpenFreeMap / © OpenMapTiles / © OpenStreetMap contributors</span>
    </footer>
  );
}

export function normalizeBearing(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}
