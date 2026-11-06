import { useMemo, useState } from 'react';
import {
  STATION_RADII_M,
  aggregateByMunicipality,
  categoryBreakdown,
  countShopsNearStations,
  stationLabel,
  type StationRadiusM,
} from '../../domain/density';
import { formatDate, todayJst } from '../../domain/format';
import { createId, type Shop, type Station } from '../../domain/shop';
import { SURVEY_RADIUS_MAX_M, SURVEY_RADIUS_MIN_M, validateSurveyArea, type SurveyArea } from '../../domain/survey';
import { StationSelect } from '../StationSelect/StationSelect';

type LatLng = { latitude: number; longitude: number };

type Props = {
  /** 検索条件に合う店舗 */
  shops: readonly Shop[];
  stations: readonly Station[];
  surveyAreas: readonly SurveyArea[];
  onSaveSurveyArea: (area: SurveyArea) => Promise<void>;
  onDeleteSurveyArea: (area: SurveyArea) => void;
  /** 駅を起点に絞り込み、駅へ移動する */
  onExploreStation: (stationId: string, radiusM: number) => void;
  onFlyTo: (point: LatLng) => void;
  pickMode: boolean;
  onPickModeChange: (enabled: boolean) => void;
  pickedPosition: LatLng | null;
};

const RANKING_LIMIT = 15;

/** 「比較・集計」タブ：市区町村別・駅周辺の集計と、調査済みエリアの管理（Phase 3） */
export function ComparePanel(props: Props) {
  const { shops, stations } = props;
  const [radius, setRadius] = useState<StationRadiusM>(500);
  const areaStats = useMemo(() => aggregateByMunicipality(shops), [shops]);
  const stationCounts = useMemo(() => countShopsNearStations(stations, shops, radius), [stations, shops, radius]);

  return (
    <div className="compare-panel">
      <p className="notice notice--warn">
        数値は<strong>登録済みの店舗の件数</strong>
        です。網羅的な調査ではないため、実際の店舗数や街の酒場の多さを示すものではありません。
        検索条件を反映しています（対象 {shops.length} 件）。
      </p>

      <section className="panel-section">
        <h2>市区町村別</h2>
        {areaStats.length === 0 ? (
          <p className="hint">対象の店舗がありません。</p>
        ) : (
          <table className="table table--compact">
            <thead>
              <tr>
                <th>市区町村</th>
                <th>件数</th>
                <th>確認済</th>
                <th>主なジャンル</th>
              </tr>
            </thead>
            <tbody>
              {areaStats.map((a) => (
                <tr key={`${a.prefecture}/${a.municipality}`}>
                  <td>
                    {a.municipality}
                    <span className="hint"> {a.prefecture}</span>
                  </td>
                  <td className="num">{a.total}</td>
                  <td className="num">{a.verified}</td>
                  <td className="hint">
                    {categoryBreakdown(a.byCategory)
                      .slice(0, 2)
                      .map((c) => `${c.label}${c.count}`)
                      .join('・') || '未分類のみ'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel-section">
        <h2>駅周辺の店舗数</h2>
        <label className="form-field form-field--inline">
          <span className="form-field__label">駅からの直線距離</span>
          <select value={radius} onChange={(e) => setRadius(Number(e.target.value) as StationRadiusM)}>
            {STATION_RADII_M.map((r) => (
              <option key={r} value={r}>
                {r}m以内
              </option>
            ))}
          </select>
        </label>
        {stations.length === 0 ? (
          <p className="hint">駅データがありません。</p>
        ) : stationCounts.length === 0 ? (
          <p className="hint">この距離内に対象の店舗がある駅はありません。</p>
        ) : (
          <ol className="ranking" aria-label="駅周辺の店舗数">
            {stationCounts.slice(0, RANKING_LIMIT).map((c) => (
              <li key={c.station.id}>
                <button
                  type="button"
                  className="ranking__item"
                  onClick={() => props.onExploreStation(c.station.id, radius)}
                  title={`${stationLabel(c.station, 10)}から${radius}m以内の店舗で絞り込む`}
                >
                  <span className="ranking__name">
                    {c.station.name}
                    <span className="hint"> {c.station.municipality}</span>
                  </span>
                  <span className="ranking__count">{c.count}件</span>
                </button>
              </li>
            ))}
          </ol>
        )}
        <p className="hint">
          駅の位置は国土数値情報（鉄道データ）。距離は直線距離で、徒歩の道のりではありません。駅を押すと、その駅を起点に店舗を絞り込みます。
        </p>
      </section>

      <SurveyAreaSection {...props} />
    </div>
  );
}

const EMPTY_FORM = {
  name: '',
  stationId: '',
  latitude: '',
  longitude: '',
  radiusM: '500',
  surveyedAt: '',
  scope: '立ち呑み・角打ちの店舗を一通り確認した',
  notes: '',
};

function SurveyAreaSection(props: Props) {
  const { surveyAreas, stations, pickMode, onPickModeChange, pickedPosition } = props;
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [appliedPick, setAppliedPick] = useState<LatLng | null>(null);

  // 地図で選んだ位置を中心に反映する（同じ選択を二重に反映しない）
  if (adding && pickedPosition && pickedPosition !== appliedPick) {
    setAppliedPick(pickedPosition);
    setForm((f) => ({
      ...f,
      stationId: '',
      latitude: pickedPosition.latitude.toFixed(6),
      longitude: pickedPosition.longitude.toFixed(6),
    }));
  }

  const set = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const chooseStation = (stationId: string) => {
    const st = stations.find((s) => s.id === stationId);
    setForm((f) => ({
      ...f,
      stationId,
      latitude: st ? String(st.latitude) : f.latitude,
      longitude: st ? String(st.longitude) : f.longitude,
      name: f.name || (st ? `${st.name}駅周辺` : ''),
    }));
  };

  const start = () => {
    setForm({ ...EMPTY_FORM, surveyedAt: todayJst() });
    setErrors([]);
    setAppliedPick(pickedPosition);
    setAdding(true);
  };

  const cancel = () => {
    onPickModeChange(false);
    setAdding(false);
  };

  const save = async () => {
    const now = new Date().toISOString();
    const area: SurveyArea = {
      id: createId('survey'),
      name: form.name.trim(),
      centerLatitude: form.latitude.trim() === '' ? Number.NaN : Number(form.latitude),
      centerLongitude: form.longitude.trim() === '' ? Number.NaN : Number(form.longitude),
      radiusM: Number(form.radiusM),
      surveyedAt: form.surveyedAt,
      scope: form.scope.trim(),
      notes: form.notes.trim(),
      createdAt: now,
      updatedAt: now,
    };
    const result = validateSurveyArea(area);
    setErrors(result.errors);
    if (result.errors.length) return;
    setSaving(true);
    try {
      await props.onSaveSurveyArea(area);
      onPickModeChange(false);
      setAdding(false);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel-section">
      <h2>調査済みエリア</h2>
      <p className="hint">
        「この範囲の立ち呑み屋は一通り調べた」という範囲を登録すると、密度表示でその範囲内の店舗0件の場所を「調査済み・0件」として区別できます。
        ブラウザ内に保存されます。
      </p>
      {surveyAreas.length === 0 ? (
        <p className="hint">登録された調査済みエリアはありません。</p>
      ) : (
        <ul className="survey-list">
          {surveyAreas.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="survey-list__name"
                onClick={() => props.onFlyTo({ latitude: a.centerLatitude, longitude: a.centerLongitude })}
              >
                {a.name}
              </button>
              <span className="hint">
                半径{a.radiusM}m・{formatDate(a.surveyedAt)}調査
              </span>
              <button type="button" className="btn btn--small btn--danger" onClick={() => props.onDeleteSurveyArea(a)}>
                削除
              </button>
            </li>
          ))}
        </ul>
      )}

      {!adding ? (
        <button type="button" className="btn" onClick={start}>
          ＋ 調査済みエリアを追加
        </button>
      ) : (
        <div className="subform" role="group" aria-label="調査済みエリアの追加">
          <label className="form-field">
            <span className="form-field__label">
              エリア名<span className="required">必須</span>
            </span>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <StationSelect
            label="中心にする駅"
            stations={stations}
            value={form.stationId}
            onChange={chooseStation}
            emptyLabel="駅を選ばない"
          />
          <button
            type="button"
            className={`btn ${pickMode ? 'btn--primary' : ''}`}
            onClick={() => onPickModeChange(!pickMode)}
            aria-pressed={pickMode}
          >
            {pickMode ? '地図をクリックしてください' : '地図をクリックして中心を選択'}
          </button>
          <div className="form-row">
            <label className="form-field">
              <span className="form-field__label">中心の緯度</span>
              <input value={form.latitude} onChange={(e) => set('latitude', e.target.value)} inputMode="decimal" />
            </label>
            <label className="form-field">
              <span className="form-field__label">中心の経度</span>
              <input value={form.longitude} onChange={(e) => set('longitude', e.target.value)} inputMode="decimal" />
            </label>
          </div>
          <div className="form-row">
            <label className="form-field">
              <span className="form-field__label">半径（m）</span>
              <input
                type="number"
                min={SURVEY_RADIUS_MIN_M}
                max={SURVEY_RADIUS_MAX_M}
                step={50}
                value={form.radiusM}
                onChange={(e) => set('radiusM', e.target.value)}
              />
            </label>
            <label className="form-field">
              <span className="form-field__label">
                調査日<span className="required">必須</span>
              </span>
              <input type="date" value={form.surveyedAt} onChange={(e) => set('surveyedAt', e.target.value)} />
            </label>
          </div>
          <label className="form-field">
            <span className="form-field__label">調査した対象</span>
            <input value={form.scope} onChange={(e) => set('scope', e.target.value)} />
          </label>
          <label className="form-field">
            <span className="form-field__label">メモ</span>
            <input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </label>
          {errors.length > 0 && (
            <div className="notice notice--danger" role="alert">
              <ul>
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="form-row form-row--inline">
            <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
              {saving ? '保存中…' : 'エリアを保存'}
            </button>
            <button type="button" className="btn" onClick={cancel}>
              キャンセル
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
