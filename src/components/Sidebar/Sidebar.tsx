import type { ReactNode } from 'react';
import { GRID_SIZES_M, type GridSizeM } from '../../domain/density';
import { DISPLAY_MODES, type DisplayMode } from '../../services/map/densityLayers';
import type { BuildingsAvailability } from '../../services/map/mapAdapter';
import { BUILDING_MIN_ZOOM } from '../../services/map/mapConfig';

export type SidebarTab = 'shops' | 'map' | 'compare';

type Props = {
  open: boolean;
  onToggle: () => void;
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  showBuildings: boolean;
  onShowBuildingsChange: (visible: boolean) => void;
  buildingsAvailability: BuildingsAvailability;
  mapUsable: boolean;
  onResetView: () => void;
  onShowAll: () => void;
  onViewMode: (mode: '2d' | '3d') => void;
  onResetNorth: () => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  gridSizeM: GridSizeM;
  onGridSizeChange: (size: GridSizeM) => void;
  showStations: boolean;
  onShowStationsChange: (visible: boolean) => void;
  stationCount: number;
  /** 「店舗を探す」タブの中身（検索条件と結果） */
  shopPanel: ReactNode;
  /** 「比較・集計」タブの中身 */
  comparePanel: ReactNode;
};

const TABS: readonly { id: SidebarTab; label: string }[] = [
  { id: 'shops', label: '店舗を探す' },
  { id: 'map', label: '地図の表示' },
  { id: 'compare', label: '比較・集計' },
];

/** 左側パネル：店舗の検索、地図の表示設定、比較・集計 */
export function Sidebar(props: Props) {
  const { open, onToggle, mapUsable, tab } = props;
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
          <div className="tabs" role="tablist" aria-label="パネルの切り替え">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`tabpanel-${t.id}`}
                onClick={() => props.onTabChange(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'shops' && (
            <div role="tabpanel" id="tabpanel-shops" aria-labelledby="tab-shops">
              {props.shopPanel}
            </div>
          )}
          {tab === 'compare' && (
            <div role="tabpanel" id="tabpanel-compare" aria-labelledby="tab-compare">
              {props.comparePanel}
            </div>
          )}
          {tab === 'map' && (
            <div role="tabpanel" id="tabpanel-map" aria-labelledby="tab-map">
              <section className="panel-section">
                <h2>表示モード</h2>
                <div className="checks checks--column" role="radiogroup" aria-label="表示モード">
                  {DISPLAY_MODES.map((m) => (
                    <label key={m.id} className="check" title={m.description}>
                      <input
                        type="radio"
                        name="display-mode"
                        checked={props.displayMode === m.id}
                        onChange={() => props.onDisplayModeChange(m.id)}
                        disabled={!mapUsable}
                      />
                      {m.label}
                    </label>
                  ))}
                  <label className="check is-disabled" title="訪問記録の機能（今後のフェーズ）の実装後に利用できます">
                    <input type="radio" name="display-mode" disabled />
                    訪問済み店舗の分布（訪問記録の実装後に利用可）
                  </label>
                </div>
                <p className="hint">{DISPLAY_MODES.find((m) => m.id === props.displayMode)?.description}</p>
                {props.displayMode === 'grid' && (
                  <label className="form-field form-field--inline">
                    <span className="form-field__label">マスの大きさ</span>
                    <select
                      value={props.gridSizeM}
                      onChange={(e) => props.onGridSizeChange(Number(e.target.value) as GridSizeM)}
                    >
                      {GRID_SIZES_M.map((s) => (
                        <option key={s} value={s}>
                          {s >= 1000 ? `${s / 1000}km` : `${s}m`}四方
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </section>

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
                <label className="check">
                  <input
                    type="checkbox"
                    checked={props.showStations}
                    onChange={(e) => props.onShowStationsChange(e.target.checked)}
                    disabled={!mapUsable || props.stationCount === 0}
                  />
                  駅（{props.stationCount}駅）
                </label>
                <p className="hint">駅はズーム12以上で表示されます（国土数値情報）。</p>
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
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
