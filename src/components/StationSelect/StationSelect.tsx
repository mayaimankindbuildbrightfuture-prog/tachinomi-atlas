import { useId, useMemo, useState } from 'react';
import { stationLabel } from '../../domain/density';
import { normalizeName, type Station } from '../../domain/shop';

type Props = {
  label: string;
  stations: readonly Station[];
  value: string;
  onChange: (stationId: string) => void;
  emptyLabel?: string;
};

/**
 * 駅の選択。駅数が多いため、駅名で候補を絞り込める。
 * 同名の駅を区別するため、路線を併記する。
 */
export function StationSelect({ label, stations, value, onChange, emptyLabel = '指定なし' }: Props) {
  const id = useId();
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = normalizeName(query);
    const filtered = q ? stations.filter((s) => normalizeName(s.name).includes(q)) : stations;
    const byPref = new Map<string, Station[]>();
    for (const s of filtered) {
      const key = s.prefecture ?? 'その他';
      byPref.set(key, [...(byPref.get(key) ?? []), s]);
    }
    return [...byPref.entries()];
  }, [stations, query]);
  const selected = stations.find((s) => s.id === value);
  const total = groups.reduce((n, [, list]) => n + list.length, 0);

  if (stations.length === 0) {
    return (
      <div className="form-field">
        <span className="form-field__label">{label}</span>
        <span className="hint">駅データがありません。</span>
      </div>
    );
  }

  return (
    <div className="form-field station-select">
      <label className="form-field__label" htmlFor={`${id}-select`}>
        {label}
      </label>
      <input
        type="search"
        aria-label={`${label}を駅名で絞り込み`}
        placeholder="駅名で絞り込み（例：赤羽）"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <select id={`${id}-select`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{emptyLabel}</option>
        {/* 絞り込みで選択中の駅が候補から外れても、選択状態を保つ */}
        {selected && !groups.some(([, list]) => list.includes(selected)) && (
          <option value={selected.id}>{stationLabel(selected)}</option>
        )}
        {groups.map(([pref, list]) => (
          <optgroup key={pref} label={pref}>
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {stationLabel(s)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {query && <span className="hint">{total}駅が該当</span>}
    </div>
  );
}
