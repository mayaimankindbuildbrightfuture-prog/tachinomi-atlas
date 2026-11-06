import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { nearestStations, stationLabel } from '../../domain/density';
import { todayJst } from '../../domain/format';
import {
  CATEGORIES,
  DAY_LABELS,
  DRINK_TAG_SUGGESTIONS,
  PREFECTURES,
  PRICE_LEVEL_LABELS,
  SOURCE_TYPE_LABELS,
  STATUS_LABELS,
  createId,
  validateCoordinates,
  validateDataSource,
  type DataSource,
  type DataSourceType,
  type PriceLevel,
  type Shop,
  type ShopStatus,
  type Station,
} from '../../domain/shop';
import {
  emptyPriceRow,
  formToShop,
  shopToForm,
  type DayStateInput,
  type ShopFormState,
  type TriStateInput,
} from './shopForm';

type Props = {
  mode: 'create' | 'edit';
  base: Shop;
  existingShops: readonly Shop[];
  sources: readonly DataSource[];
  stations: readonly Station[];
  pickMode: boolean;
  onPickModeChange: (enabled: boolean) => void;
  /** 地図で選択された位置（選択されるたびに新しいオブジェクトが渡る） */
  pickedPosition: { latitude: number; longitude: number } | null;
  onDraftPositionChange: (position: { latitude: number; longitude: number } | null) => void;
  onSave: (shop: Shop, newSources: DataSource[]) => Promise<void>;
  onCancel: () => void;
};

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="form-field">
      <span className="form-field__label">
        {label}
        {required ? <span className="required">必須</span> : <span className="optional">任意</span>}
      </span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const EMPTY_SOURCE = { type: 'official_site' as DataSourceType, name: '', url: '', accessedAt: '', notes: '' };

/** 店舗の追加・編集フォーム（仕様書 13.2） */
export function ShopEditor(props: Props) {
  const { mode, base, existingShops, stations, pickMode, onPickModeChange, pickedPosition, onDraftPositionChange } =
    props;
  const [form, setForm] = useState<ShopFormState>(() => shopToForm(base));
  const [newSources, setNewSources] = useState<DataSource[]>([]);
  const [sourceDraft, setSourceDraft] = useState(EMPTY_SOURCE);
  const [sourceErrors, setSourceErrors] = useState<string[]>([]);
  const [drinkInput, setDrinkInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const formId = useId();

  const allSources = useMemo(() => [...props.sources, ...newSources], [props.sources, newSources]);
  const result = useMemo(
    () => formToShop(form, base, new Date().toISOString(), existingShops),
    [form, base, existingShops],
  );

  const set = <K extends keyof ShopFormState>(key: K, value: ShopFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // 地図で選んだ位置をフォームに反映する
  useEffect(() => {
    if (!pickedPosition) return;
    setForm((f) => ({
      ...f,
      latitude: pickedPosition.latitude.toFixed(6),
      longitude: pickedPosition.longitude.toFixed(6),
    }));
  }, [pickedPosition]);

  // 入力中の座標を地図上の仮マーカーで示す
  const lat = Number(form.latitude);
  const lng = Number(form.longitude);
  const coordsValid =
    form.latitude.trim() !== '' && form.longitude.trim() !== '' && validateCoordinates(lat, lng).errors.length === 0;
  useEffect(() => {
    onDraftPositionChange(coordsValid ? { latitude: lat, longitude: lng } : null);
  }, [coordsValid, lat, lng, onDraftPositionChange]);
  useEffect(() => () => onDraftPositionChange(null), [onDraftPositionChange]);

  const coordWarnings = coordsValid ? validateCoordinates(lat, lng).warnings : [];

  // 最寄り駅の候補：入力中の位置から近い駅と、すでに選択済みの駅
  const stationChoices = useMemo(() => {
    const near = coordsValid ? nearestStations({ latitude: lat, longitude: lng }, stations, 6) : [];
    const choices: { station: Station; distanceM: number | null }[] = near.map((n) => ({ ...n }));
    for (const id of form.stationIds) {
      if (choices.some((c) => c.station.id === id)) continue;
      const st = stations.find((s) => s.id === id);
      if (st) choices.push({ station: st, distanceM: null });
    }
    return choices;
  }, [coordsValid, lat, lng, stations, form.stationIds]);

  const addSource = () => {
    const src: DataSource = {
      id: createId('src'),
      type: sourceDraft.type,
      name: sourceDraft.name.trim(),
      url: sourceDraft.url.trim() || null,
      accessedAt: sourceDraft.accessedAt || null,
      notes: sourceDraft.notes.trim() || null,
    };
    const { errors } = validateDataSource(src);
    setSourceErrors(errors);
    if (errors.length) return;
    setNewSources((s) => [...s, src]);
    set('sourceIds', [...form.sourceIds, src.id]);
    setSourceDraft(EMPTY_SOURCE);
  };

  const addDrink = (value: string) => {
    const v = value.trim();
    if (v && !form.drinkTags.includes(v)) set('drinkTags', [...form.drinkTags, v]);
    setDrinkInput('');
  };

  const canSave = result.errors.length === 0 && (result.duplicates.length === 0 || allowDuplicate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setSaveError(null);
    if (!canSave) return;
    setSaving(true);
    try {
      const usedSources = newSources.filter(
        (s) => result.shop.sourceIds.includes(s.id) || result.shop.priceExamples.some((p) => p.sourceId === s.id),
      );
      await props.onSave(result.shop, usedSources);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const drinkOptions = [...new Set([...DRINK_TAG_SUGGESTIONS, ...form.drinkTags])];

  return (
    <form className="editor" onSubmit={handleSubmit} aria-labelledby={`${formId}-title`} noValidate>
      <header className="detail__header">
        <h2 id={`${formId}-title`}>{mode === 'create' ? '店舗を追加' : '店舗を編集'}</h2>
        <button
          type="button"
          className="icon-btn"
          onClick={props.onCancel}
          aria-label="編集をやめる"
          title="編集をやめる"
        >
          ✕
        </button>
      </header>
      <p className="hint">
        <span className="required">必須</span>{' '}
        は店名・緯度・経度のみです。分からない項目は空欄・「未確認」のままにしてください。
      </p>

      <fieldset className="form-group">
        <legend>基本情報</legend>
        <Field label="店名" required>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={100} />
        </Field>
        <div className="form-row">
          <Field label="緯度" required>
            <input
              value={form.latitude}
              onChange={(e) => set('latitude', e.target.value)}
              inputMode="decimal"
              placeholder="35.6812"
            />
          </Field>
          <Field label="経度" required>
            <input
              value={form.longitude}
              onChange={(e) => set('longitude', e.target.value)}
              inputMode="decimal"
              placeholder="139.7671"
            />
          </Field>
        </div>
        <button
          type="button"
          className={`btn ${pickMode ? 'btn--primary' : ''}`}
          onClick={() => onPickModeChange(!pickMode)}
          aria-pressed={pickMode}
        >
          {pickMode ? '地図をクリックしてください（もう一度押すと中止）' : '地図をクリックして位置を選択'}
        </button>
        {coordWarnings.map((w) => (
          <p key={w} className="notice notice--warn">
            {w}
          </p>
        ))}
        <Field label="住所">
          <input value={form.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <div className="form-row">
          <Field label="都道府県">
            <select
              value={form.prefecture}
              onChange={(e) => set('prefecture', e.target.value as ShopFormState['prefecture'])}
            >
              <option value="">未設定</option>
              {PREFECTURES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="市区町村">
            <input
              value={form.municipality}
              onChange={(e) => set('municipality', e.target.value)}
              placeholder="例：北区"
            />
          </Field>
        </div>
        <div className="form-field">
          <span className="form-field__label">
            最寄り駅<span className="optional">任意・複数可</span>
          </span>
          {stationChoices.length === 0 ? (
            <span className="hint">
              {stations.length === 0 ? '駅データがありません。' : '座標を入力すると、近くの駅（2km以内）から選べます。'}
            </span>
          ) : (
            <div className="checks checks--column">
              {stationChoices.map(({ station, distanceM }) => (
                <label key={station.id} className="check">
                  <input
                    type="checkbox"
                    checked={form.stationIds.includes(station.id)}
                    onChange={() => set('stationIds', toggle(form.stationIds, station.id))}
                  />
                  {stationLabel(station)}
                  {distanceM !== null && <span className="hint">約{Math.round(distanceM / 10) * 10}m</span>}
                </label>
              ))}
            </div>
          )}
          <span className="hint">
            店舗の位置から近い駅を表示しています（直線距離）。最寄り駅かどうかはご自身で判断してください。
          </span>
        </div>
      </fieldset>

      <fieldset className="form-group">
        <legend>店の特徴</legend>
        <div className="form-field">
          <span className="form-field__label">
            料理ジャンル<span className="optional">任意・複数可</span>
          </span>
          <div className="checks">
            {CATEGORIES.map((c) => (
              <label key={c.key} className="check">
                <input
                  type="checkbox"
                  checked={form.categories.includes(c.key)}
                  onChange={() => set('categories', toggle(form.categories, c.key))}
                />
                {c.label}
              </label>
            ))}
          </div>
          <span className="hint">最初に選んだジャンルが地図のマーカーになります。</span>
        </div>
        <div className="form-field">
          <span className="form-field__label">
            酒の種類<span className="optional">任意・複数可</span>
          </span>
          <div className="checks">
            {drinkOptions.map((d) => (
              <label key={d} className="check">
                <input
                  type="checkbox"
                  checked={form.drinkTags.includes(d)}
                  onChange={() => set('drinkTags', toggle(form.drinkTags, d))}
                />
                {d}
              </label>
            ))}
          </div>
          <div className="form-row form-row--inline">
            <input
              aria-label="酒の種類を追加"
              placeholder="その他の酒の種類"
              value={drinkInput}
              onChange={(e) => setDrinkInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDrink(drinkInput);
                }
              }}
            />
            <button type="button" className="btn" onClick={() => addDrink(drinkInput)}>
              追加
            </button>
          </div>
        </div>
        <div className="form-row">
          <Field label="立ち呑み専業">
            <select value={form.standingOnly} onChange={(e) => set('standingOnly', e.target.value as TriStateInput)}>
              <option value="unknown">未確認</option>
              <option value="yes">はい</option>
              <option value="no">いいえ</option>
            </select>
          </Field>
          <Field label="座席あり">
            <select value={form.hasSeating} onChange={(e) => set('hasSeating', e.target.value as TriStateInput)}>
              <option value="unknown">未確認</option>
              <option value="yes">はい</option>
              <option value="no">いいえ</option>
            </select>
          </Field>
        </div>
        <Field label="予算帯">
          <select value={form.priceLevel} onChange={(e) => set('priceLevel', e.target.value as PriceLevel)}>
            {(Object.keys(PRICE_LEVEL_LABELS) as PriceLevel[]).map((p) => (
              <option key={p} value={p}>
                {PRICE_LEVEL_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>

      <fieldset className="form-group">
        <legend>価格例</legend>
        <p className="hint">価格は確認できたものだけを、確認日・出典とともに登録してください。</p>
        {form.priceExamples.map((p, i) => (
          <div key={i} className="price-row" role="group" aria-label={`価格例${i + 1}`}>
            <input
              aria-label={`価格例${i + 1}の品目`}
              placeholder="品目（例：ホッピーセット）"
              value={p.itemName}
              onChange={(e) =>
                set(
                  'priceExamples',
                  form.priceExamples.map((r, j) => (j === i ? { ...r, itemName: e.target.value } : r)),
                )
              }
            />
            <input
              aria-label={`価格例${i + 1}の価格（円）`}
              placeholder="円"
              inputMode="numeric"
              value={p.priceYen}
              onChange={(e) =>
                set(
                  'priceExamples',
                  form.priceExamples.map((r, j) => (j === i ? { ...r, priceYen: e.target.value } : r)),
                )
              }
            />
            <input
              type="date"
              aria-label={`価格例${i + 1}の確認日`}
              value={p.checkedAt}
              onChange={(e) =>
                set(
                  'priceExamples',
                  form.priceExamples.map((r, j) => (j === i ? { ...r, checkedAt: e.target.value } : r)),
                )
              }
            />
            <select
              aria-label={`価格例${i + 1}の出典`}
              value={p.sourceId}
              onChange={(e) =>
                set(
                  'priceExamples',
                  form.priceExamples.map((r, j) => (j === i ? { ...r, sourceId: e.target.value } : r)),
                )
              }
            >
              <option value="">出典未設定</option>
              {allSources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon-btn"
              aria-label={`価格例${i + 1}を削除`}
              onClick={() =>
                set(
                  'priceExamples',
                  form.priceExamples.filter((_, j) => j !== i),
                )
              }
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          onClick={() => set('priceExamples', [...form.priceExamples, emptyPriceRow()])}
        >
          ＋ 価格例を追加
        </button>
      </fieldset>

      <fieldset className="form-group">
        <legend>営業時間</legend>
        <p className="hint">
          深夜営業は閉店時刻を開店時刻より前（例：17:00〜02:00）にすると翌日にまたがる扱いになります。
        </p>
        <table className="hours-table">
          <tbody>
            {DAY_ORDER.map((day) => {
              const h = form.hours[day]!;
              const update = (patch: Partial<typeof h>) =>
                set(
                  'hours',
                  form.hours.map((r, j) => (j === day ? { ...r, ...patch } : r)),
                );
              return (
                <tr key={day}>
                  <th scope="row">{DAY_LABELS[day]}</th>
                  <td>
                    <select
                      aria-label={`${DAY_LABELS[day]}曜日の営業`}
                      value={h.state}
                      onChange={(e) => update({ state: e.target.value as DayStateInput })}
                    >
                      <option value="unknown">未確認</option>
                      <option value="open">営業</option>
                      <option value="closed">定休日</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="time"
                      aria-label={`${DAY_LABELS[day]}曜日の開店時刻`}
                      value={h.opensAt}
                      disabled={h.state !== 'open'}
                      onChange={(e) => update({ opensAt: e.target.value })}
                    />
                  </td>
                  <td>〜</td>
                  <td>
                    <input
                      type="time"
                      aria-label={`${DAY_LABELS[day]}曜日の閉店時刻`}
                      value={h.closesAt}
                      disabled={h.state !== 'open'}
                      onChange={(e) => update({ closesAt: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`${DAY_LABELS[day]}曜日の備考`}
                      placeholder="備考"
                      value={h.note}
                      onChange={(e) => update({ note: e.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </fieldset>

      <fieldset className="form-group">
        <legend>確認状況・出典</legend>
        <div className="form-row">
          <Field label="確認状況">
            <select value={form.status} onChange={(e) => set('status', e.target.value as ShopStatus)}>
              {(Object.keys(STATUS_LABELS) as ShopStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="最終確認日">
            <input type="date" value={form.lastVerifiedAt} onChange={(e) => set('lastVerifiedAt', e.target.value)} />
          </Field>
        </div>
        <p className="hint">「確認済み」にするには、出典1件以上と最終確認日が必要です。</p>
        <Field label="公式サイトURL">
          <input
            type="url"
            value={form.officialUrl}
            onChange={(e) => set('officialUrl', e.target.value)}
            placeholder="https://"
          />
        </Field>

        <div className="form-field">
          <span className="form-field__label">
            この店舗の出典<span className="optional">任意・複数可</span>
          </span>
          {allSources.length === 0 ? (
            <p className="hint">登録済みの出典はありません。下のフォームで追加してください。</p>
          ) : (
            <div className="checks checks--column">
              {allSources.map((s) => (
                <label key={s.id} className="check">
                  <input
                    type="checkbox"
                    checked={form.sourceIds.includes(s.id)}
                    onChange={() => set('sourceIds', toggle(form.sourceIds, s.id))}
                  />
                  {s.name}（{SOURCE_TYPE_LABELS[s.type]}）
                </label>
              ))}
            </div>
          )}
        </div>

        <details className="subform">
          <summary>新しい出典を追加</summary>
          <div className="form-row">
            <Field label="種類">
              <select
                value={sourceDraft.type}
                onChange={(e) => setSourceDraft({ ...sourceDraft, type: e.target.value as DataSourceType })}
              >
                {(Object.keys(SOURCE_TYPE_LABELS) as DataSourceType[]).map((t) => (
                  <option key={t} value={t}>
                    {SOURCE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="参照日">
              <input
                type="date"
                value={sourceDraft.accessedAt}
                onChange={(e) => setSourceDraft({ ...sourceDraft, accessedAt: e.target.value })}
              />
            </Field>
          </div>
          <Field label="出典名" required>
            <input
              value={sourceDraft.name}
              onChange={(e) => setSourceDraft({ ...sourceDraft, name: e.target.value })}
              placeholder="例：店舗公式サイト"
            />
          </Field>
          <Field label="出典URL">
            <input
              type="url"
              value={sourceDraft.url}
              onChange={(e) => setSourceDraft({ ...sourceDraft, url: e.target.value })}
              placeholder="https://"
            />
          </Field>
          <Field label="出典メモ">
            <input
              value={sourceDraft.notes}
              onChange={(e) => setSourceDraft({ ...sourceDraft, notes: e.target.value })}
            />
          </Field>
          {sourceErrors.map((e) => (
            <p key={e} className="notice notice--danger">
              {e}
            </p>
          ))}
          <div className="form-row form-row--inline">
            <button type="button" className="btn" onClick={addSource}>
              出典を追加
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setSourceDraft({ ...sourceDraft, accessedAt: todayJst() })}
            >
              参照日を今日にする
            </button>
          </div>
        </details>

        <Field label="メモ">
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
        </Field>
      </fieldset>

      {submitted && result.errors.length > 0 && (
        <div className="notice notice--danger" role="alert">
          <p>保存できません。以下を確認してください。</p>
          <ul>
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {result.duplicates.length > 0 && (
        <div className="notice notice--warn" role="alert">
          <p>同じ名前の店舗が近く（150m以内）に登録されています：{result.duplicates.map((d) => d.name).join('、')}</p>
          <label className="check">
            <input type="checkbox" checked={allowDuplicate} onChange={(e) => setAllowDuplicate(e.target.checked)} />
            別の店舗として登録する
          </label>
        </div>
      )}
      {saveError && (
        <p className="notice notice--danger" role="alert">
          {saveError}
        </p>
      )}

      <div className="editor__buttons">
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
        <button type="button" className="btn" onClick={props.onCancel}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
