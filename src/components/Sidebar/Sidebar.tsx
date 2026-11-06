import type { BuildingsAvailability } from '../../services/map/mapAdapter';
import { BUILDING_MIN_ZOOM } from '../../services/map/mapConfig';

type Props = {
  open: boolean;
  onToggle: () => void;
  showBuildings: boolean;
  onShowBuildingsChange: (visible: boolean) => void;
  buildingsAvailability: BuildingsAvailability;
  mapUsable: boolean;
  onResetView: () => void;
  onShowAll: () => void;
  onViewMode: (mode: '2d' | '3d') => void;
  onResetNorth: () => void;
};

/** 左側パネル：表示レイヤーと地図操作。検索条件は Phase 2 で追加する */
export function Sidebar(props: Props) {
  const { open, onToggle, mapUsable } = props;
  return (
    <aside className={`sidebar ${open ? '' : 'is-collapsed'}`} aria-label="表示設定と地図操作">
      <button
        type="button"
        className="sidebar__toggle"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="sidebar-content"
        title={open ? 'パネルを閉じて地図を広く表示' : 'パネルを開く'}
      >
        {open ? '◀ 閉じる' : '▶'}
      </button>
      {open && (
        <div id="sidebar-content" className="sidebar__content">
          <section className="panel-section">
            <h2>表示レイヤー</h2>
            <label className="check">
              <input
                type="checkbox"
                checked={props.showBuildings}
                onChange={(e) => props.onShowBuildingsChange(e.target.checked)}
                disabled={!mapUsable || props.buildingsAvailability === 'unavailable'}
              />
              3D建物
            </label>
            <p className="hint">
              {props.buildingsAvailability === 'unavailable'
                ? 'この地図スタイルには建物データがないため、3D建物を表示できません。'
                : `建物はズーム ${BUILDING_MIN_ZOOM} 以上で立体表示されます。`}
            </p>
          </section>

          <section className="panel-section">
            <h2>地図操作</h2>
            <div className="button-grid">
              <button type="button" className="btn" onClick={props.onResetView} disabled={!mapUsable}>
                初期表示に戻る
              </button>
              <button type="button" className="btn" onClick={props.onShowAll} disabled={!mapUsable}>
                東京・埼玉 全域
              </button>
              <button type="button" className="btn" onClick={() => props.onViewMode('3d')} disabled={!mapUsable}>
                3D表示（傾ける）
              </button>
              <button type="button" className="btn" onClick={() => props.onViewMode('2d')} disabled={!mapUsable}>
                2D表示（真上から）
              </button>
              <button type="button" className="btn" onClick={props.onResetNorth} disabled={!mapUsable}>
                北を上にする
              </button>
            </div>
          </section>

          <section className="panel-section">
            <h2>操作方法</h2>
            <dl className="help-list">
              <dt>移動</dt>
              <dd>左ドラッグ／矢印キー</dd>
              <dt>拡大・縮小</dt>
              <dd>マウスホイール／ダブルクリック／＋−キー</dd>
              <dt>回転・傾き</dt>
              <dd>右ドラッグ、または Ctrl＋左ドラッグ</dd>
              <dt>傾きのみ</dt>
              <dd>Shift＋↑↓キー</dd>
            </dl>
          </section>

          <section className="panel-section panel-section--muted">
            <h2>今後追加される機能</h2>
            <p className="hint">
              店舗の検索・絞り込み、店舗詳細、密度表示などは次のフェーズで実装予定です（現在は地図の基礎のみ）。
            </p>
          </section>
        </div>
      )}
    </aside>
  );
}
