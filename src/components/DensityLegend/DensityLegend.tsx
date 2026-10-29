import { useState } from 'react';
import { DENSITY_STEPS, SURVEYED_ZERO_COLOR, gridHeightPerShop, priceLevelLegend } from '../../domain/density';
import { CATEGORIES } from '../../domain/shop';
import { DISPLAY_MODES, UNVISITED_COLOR, VISITED_COLOR, type DisplayMode } from '../../services/map/densityLayers';

type Props = {
  mode: DisplayMode;
  /** 表示対象（検索条件を反映した店舗）の件数 */
  shownCount: number;
  categoryCounts: Record<string, number>;
  priceCounts: Record<string, number>;
  gridSizeM: number;
  surveyAreaCount: number;
  /** 表示対象のうち訪問済みの店舗数 */
  visitedCount: number;
};

function Swatch({ color, round }: { color: string; round?: boolean }) {
  return <span className={`swatch ${round ? 'swatch--round' : ''}`} style={{ background: color }} aria-hidden="true" />;
}

/** 地図下部の凡例。色・高さが何を表すか、データの網羅性の限界とあわせて示す（仕様書 4.5） */
export function DensityLegend({
  mode,
  shownCount,
  categoryCounts,
  priceCounts,
  gridSizeM,
  surveyAreaCount,
  visitedCount,
}: Props) {
  const [open, setOpen] = useState(true);
  const label = DISPLAY_MODES.find((m) => m.id === mode)?.label ?? '';
  const size = gridSizeM >= 1000 ? `${gridSizeM / 1000}km` : `${gridSizeM}m`;
  const density = mode === 'heatmap' || mode === 'grid';

  return (
    <section className={`legend ${open ? '' : 'is-collapsed'}`} aria-label="凡例">
      <header className="legend__header">
        <h2>凡例：{label}</h2>
        <button type="button" className="icon-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? '隠す' : '表示'}
        </button>
      </header>
      {open && (
        <div className="legend__body">
          {mode === 'markers' && (
            <>
              <ul className="legend__items legend__items--grid">
                {CATEGORIES.map((c) => (
                  <li key={c.key}>
                    <span className="tag__dot" style={{ background: c.color }} aria-hidden="true">
                      {c.short}
                    </span>
                    {c.label}
                  </li>
                ))}
              </ul>
              <p className="hint">オレンジの丸は複数店舗のまとまり（数字は件数）。クリックすると拡大します。</p>
            </>
          )}

          {mode === 'heatmap' && (
            <>
              <div className="legend__gradient" aria-hidden="true" />
              <div className="legend__gradient-labels">
                <span>まばら</span>
                <span>集中</span>
              </div>
              <p className="hint">
                登録店舗が近くに集まっているほど明るい色になります。濃さの基準は固定で、件数の少ない地域を強調しません。
              </p>
            </>
          )}

          {mode === 'grid' && (
            <>
              <ul className="legend__items">
                {DENSITY_STEPS.map((s) => (
                  <li key={s.min}>
                    <Swatch color={s.color} />
                    {s.label}
                  </li>
                ))}
                <li>
                  <Swatch color={SURVEYED_ZERO_COLOR} />
                  調査済み・0件
                </li>
                <li>
                  <span className="swatch swatch--empty" aria-hidden="true" />
                  色なし：データなし（未調査）
                </li>
              </ul>
              <p className="hint">
                約{size}四方のマスごとの登録店舗数。柱の高さは1件あたり{gridHeightPerShop(gridSizeM)}
                m。マスをクリックすると件数を表示します。
              </p>
            </>
          )}

          {mode === 'category' && (
            <>
              <ul className="legend__items legend__items--grid">
                {CATEGORIES.map((c) => (
                  <li key={c.key}>
                    <Swatch color={c.color} round />
                    {c.label}（{categoryCounts[c.key] ?? 0}）
                  </li>
                ))}
              </ul>
              <p className="hint">複数ジャンルの店舗は、最初に登録したジャンルの色で表示します。</p>
            </>
          )}

          {mode === 'visited' && (
            <>
              <ul className="legend__items">
                <li>
                  <Swatch color={VISITED_COLOR} round />
                  訪問済み（{visitedCount}）
                </li>
                <li>
                  <Swatch color={UNVISITED_COLOR} round />
                  未訪問（{shownCount - visitedCount}）
                </li>
              </ul>
              <p className="hint">自分の訪問記録がある店舗を明るい色で表示します。</p>
            </>
          )}

          {mode === 'priceLevel' && (
            <>
              <ul className="legend__items">
                {priceLevelLegend().map((p) => (
                  <li key={p.key}>
                    <Swatch color={p.color} round />
                    {p.label}（{priceCounts[p.key] ?? 0}）
                  </li>
                ))}
              </ul>
              <p className="hint">予算帯は登録時の目安です。「未確認」の店舗は灰色で表示します。</p>
            </>
          )}

          <p className="legend__count">
            対象：検索条件に合う <strong>{shownCount}</strong> 件
          </p>
          {density && (
            <p className="legend__caveat">
              {surveyAreaCount > 0
                ? `緑の破線は調査済みエリア（${surveyAreaCount}件）です。その外側は網羅的に調べておらず、店舗が表示されなくても「店が少ない」とは言えません。`
                : '調査済みエリアは未登録です。表示は登録済みの店舗だけに基づき、店舗が表示されない場所を「店が少ない」とは言えません。'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
