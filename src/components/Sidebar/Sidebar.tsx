import { useState, type ReactNode } from 'react';
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
  /** 「店舗」タブの中身（検索条件と結果） */
  shopPanel: ReactNode;
};

type Tab = 'shops' | 'map';

/** 左側パネル：店舗の検索（店舗タブ）と、表示レイヤー・地図操作（地図タブ） */
export function Sidebar(props: Props) {
  const { open, onToggle, mapUsable } = props;
  const [tab, setTab] = useState<Tab>('shops');
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
            <button
              type="button"
              role="tab"
              id="tab-shops"
              aria-selected={tab === 'shops'}
              aria-controls="tabpanel-shops"
              onClick={() => setTab('shops')}
            >
              店舗を探す
            </button>
            <button
              type="button"
              role="tab"
              id="tab-map"
              aria-selected={tab === 'map'}
              aria-controls="tabpanel-map"
              onClick={() => setTab('map')}
            >
              地図の表示
            </button>
          </div>
          {tab === 'shops' && (
            <div role="tabpanel" id="tabpanel-shops" aria-labelledby="tab-shops">
              {props.shopPanel}
            </div>
          )}
          {tab === 'map' && (
            <div role="tabpanel" id="tabpanel-map" aria-labelledby="tab-map">
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
                <h2>マーカーの見方</h2>
                <p className="hint">
                  丸の中の文字が料理ジャンル（焼＝焼きとん・焼き鳥、煮＝煮込み、お＝おでん、魚＝刺身・海鮮、酒＝日本酒、麦＝ビール・ホッピー、角＝角打ち、他＝その他）。
                  オレンジの大きな丸は複数店舗のまとまりで、クリックすると拡大します。半透明は閉店（可能性含む）の店舗です。
                </p>
              </section>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
