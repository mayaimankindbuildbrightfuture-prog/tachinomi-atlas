import { STATION_RADII_M } from '../../domain/density';
import { MARK_KINDS, MARK_LABELS } from '../../domain/visit';
import { StationSelect } from '../StationSelect/StationSelect';
import { useMemo } from 'react';
import {
  activeFilterChips,
  collectOptions,
  EMPTY_FILTER,
  type SeatingStyle,
  type VisitedFilter,
  type ShopFilter,
} from '../../domain/search';
import {
  CATEGORIES,
  DAY_LABELS,
  PREFECTURES,
  PRICE_LEVEL_LABELS,
  STATUS_LABELS,
  getCategory,
  primaryCategory,
  type PriceLevel,
  type Shop,
  type ShopStatus,
  type Station,
} from '../../domain/shop';

type Props = {
  filter: ShopFilter;
  onChange: (filter: ShopFilter) => void;
  allShops: readonly Shop[];
  results: readonly Shop[];
  stations: readonly Station[];
  selectedShopId: string | null;
  onSelectShop: (id: string) => void;
  loading: boolean;
};

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** 検索条件・適用中の条件・検索結果（仕様書 4.4） */
export function FilterPanel({
  filter,
  onChange,
  allShops,
  results,
  stations,
  selectedShopId,
  onSelectShop,
  loading,
}: Props) {
  const options = useMemo(() => collectOptions(allShops), [allShops]);
  const chips = activeFilterChips(filter, stations);
  const set = <K extends keyof ShopFilter>(key: K, value: ShopFilter[K]) => onChange({ ...filter, [key]: value });

  return (
    <div className="filter-panel">
      <div className="result-summary" aria-live="polite">
        <strong data-testid="result-count">{results.length}</strong> 件
        <span className="hint"> ／ 登録 {allShops.length} 件</span>
      </div>

      {chips.length > 0 && (
        <div className="chips" aria-label="適用中の条件">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              className="chip"
              onClick={() => onChange(c.clear(filter))}
              title="この条件を解除"
            >
              {c.label} ✕
            </button>
          ))}
          <button type="button" className="btn btn--small" onClick={() => onChange(EMPTY_FILTER)}>
            条件をすべて解除
          </button>
        </div>
      )}

      <details className="filter-groups">
        <summary>絞り込み条件</summary>

        <fieldset className="filter-group">
          <legend>自分の記録</legend>
          <div className="checks">
            {(
              [
                ['any', '指定なし'],
                ['visited', '訪問済み'],
                ['unvisited', '未訪問'],
              ] as [VisitedFilter, string][]
            ).map(([value, label]) => (
              <label key={value} className="check">
                <input
                  type="radio"
                  name="visited"
                  checked={filter.visited === value}
                  onChange={() => set('visited', value)}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="checks">
            {MARK_KINDS.map((k) => (
              <label key={k} className="check">
                <input
                  type="checkbox"
                  checked={filter.marks.includes(k)}
                  onChange={() => set('marks', toggle(filter.marks, k))}
                />
                {MARK_LABELS[k]}
              </label>
            ))}
          </div>
          <p className="hint">お気に入り等を複数選ぶと、いずれかに当てはまる店舗が対象です。</p>
        </fieldset>

        <fieldset className="filter-group">
          <legend>地域</legend>
          <div className="checks">
            {PREFECTURES.map((p) => (
              <label key={p} className="check">
                <input
                  type="checkbox"
                  checked={filter.prefectures.includes(p)}
                  onChange={() => set('prefectures', toggle(filter.prefectures, p))}
                />
                {p}
              </label>
            ))}
          </div>
          <label className="form-field">
            <span className="form-field__label">市区町村</span>
            <select
              value={filter.municipality}
              onChange={(e) => set('municipality', e.target.value)}
              disabled={options.municipalities.length === 0}
            >
              <option value="">指定なし</option>
              {options.municipalities.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <StationSelect
            label="駅を起点に探す"
            stations={stations}
            value={filter.stationId}
            onChange={(id) => set('stationId', id)}
          />
          {filter.stationId && (
            <label className="form-field form-field--inline">
              <span className="form-field__label">駅からの直線距離</span>
              <select value={filter.stationRadiusM} onChange={(e) => set('stationRadiusM', Number(e.target.value))}>
                {STATION_RADII_M.map((r) => (
                  <option key={r} value={r}>
                    {r}m以内
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="hint">最寄り駅として登録された店舗と、駅から指定距離（直線）以内の店舗が対象です。</p>
        </fieldset>

        <fieldset className="filter-group">
          <legend>料理ジャンル（いずれかを含む）</legend>
          <div className="checks">
            {CATEGORIES.map((c) => (
              <label key={c.key} className="check">
                <input
                  type="checkbox"
                  checked={filter.categories.includes(c.key)}
                  onChange={() => set('categories', toggle(filter.categories, c.key))}
                />
                <span className="tag__dot" style={{ background: c.color }} aria-hidden="true">
                  {c.short}
                </span>
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="filter-group">
          <legend>酒の種類（いずれかを含む）</legend>
          {options.drinkTags.length === 0 ? (
            <p className="hint">登録データに酒の種類がありません。</p>
          ) : (
            <div className="checks">
              {options.drinkTags.map((d) => (
                <label key={d} className="check">
                  <input
                    type="checkbox"
                    checked={filter.drinkTags.includes(d)}
                    onChange={() => set('drinkTags', toggle(filter.drinkTags, d))}
                  />
                  {d}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset className="filter-group">
          <legend>予算帯</legend>
          <div className="checks checks--column">
            {(Object.keys(PRICE_LEVEL_LABELS) as PriceLevel[]).map((p) => (
              <label key={p} className="check">
                <input
                  type="checkbox"
                  checked={filter.priceLevels.includes(p)}
                  onChange={() => set('priceLevels', toggle(filter.priceLevels, p))}
                />
                {PRICE_LEVEL_LABELS[p]}
              </label>
            ))}
          </div>
          <p className="hint">予算内の注文モデルでの絞り込みは今後追加予定です。</p>
        </fieldset>

        <fieldset className="filter-group">
          <legend>立ち呑み形式</legend>
          <div className="checks">
            {(
              [
                ['any', '指定なし'],
                ['standingOnly', '立ち呑み専業'],
                ['withSeating', '座席あり'],
              ] as [SeatingStyle, string][]
            ).map(([value, label]) => (
              <label key={value} className="check">
                <input
                  type="radio"
                  name="seating"
                  checked={filter.seating === value}
                  onChange={() => set('seating', value)}
                />
                {label}
              </label>
            ))}
          </div>
          <p className="hint">形式が未確認の店舗は、形式を指定すると結果に含まれません。</p>
        </fieldset>

        <fieldset className="filter-group">
          <legend>営業日時</legend>
          <div className="form-row">
            <label className="form-field">
              <span className="form-field__label">曜日</span>
              <select
                value={filter.openDay === null ? '' : String(filter.openDay)}
                onChange={(e) => {
                  const v = e.target.value;
                  onChange(v === '' ? { ...filter, openDay: null, openTime: '' } : { ...filter, openDay: Number(v) });
                }}
              >
                <option value="">指定なし</option>
                {DAY_ORDER.map((d) => (
                  <option key={d} value={d}>
                    {DAY_LABELS[d]}曜日
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="form-field__label">時刻</span>
              <input
                type="time"
                value={filter.openTime}
                disabled={filter.openDay === null}
                onChange={(e) => set('openTime', e.target.value)}
              />
            </label>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={filter.includeUnknownHours}
              disabled={filter.openDay === null}
              onChange={(e) => set('includeUnknownHours', e.target.checked)}
            />
            営業時間が未確認の店舗も含める
          </label>
          <p className="hint">登録された営業時間に基づく判定です。臨時休業や祝日は反映されません。</p>
        </fieldset>

        <fieldset className="filter-group">
          <legend>情報の確認状況</legend>
          <div className="checks checks--column">
            {(Object.keys(STATUS_LABELS) as ShopStatus[]).map((s) => (
              <label key={s} className="check">
                <input
                  type="checkbox"
                  checked={filter.statuses.includes(s)}
                  onChange={() => set('statuses', toggle(filter.statuses, s))}
                />
                {STATUS_LABELS[s]}
              </label>
            ))}
          </div>
        </fieldset>
      </details>

      {loading ? (
        <p className="empty-state" role="status">
          店舗データを読み込み中…
        </p>
      ) : allShops.length === 0 ? (
        <div className="empty-state">
          <p>店舗データがまだ登録されていません。</p>
          <p className="hint">画面上部の「＋ 店舗を追加」から登録できます。</p>
        </div>
      ) : results.length === 0 ? (
        <div className="empty-state">
          <p>条件に合う店舗がありません。</p>
          <p className="hint">条件を減らすか「条件をすべて解除」を押してください。</p>
        </div>
      ) : (
        <ul className="result-list" aria-label="検索結果">
          {results.map((s) => {
            const cat = getCategory(primaryCategory(s));
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`result-item ${s.id === selectedShopId ? 'is-selected' : ''} is-${s.status}`}
                  onClick={() => onSelectShop(s.id)}
                  aria-current={s.id === selectedShopId ? 'true' : undefined}
                >
                  <span className="tag__dot" style={{ background: cat.color }} aria-hidden="true">
                    {cat.short}
                  </span>
                  <span className="result-item__body">
                    <span className="result-item__name">{s.name}</span>
                    <span className="result-item__meta">
                      {[s.municipality, STATUS_LABELS[s.status]].filter(Boolean).join('・')}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
