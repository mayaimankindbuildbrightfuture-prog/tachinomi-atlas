import { useId, useMemo, useState } from 'react';
import { PRICE_CAVEAT, pricedExamples, selectedItemsTotal } from '../../domain/budget';
import { formatYen } from '../../domain/format';
import { entryForDay, formatDay, formatHoursEntry } from '../../domain/hours';
import {
  DEFAULT_STAY_MINUTES,
  MAX_ROUTE_SHOPS,
  WALK_METERS_PER_MINUTE,
  buildLegs,
  buildSchedule,
  formatClock,
  formatDistance,
  formatDuration,
  moveShopInRoute,
  removeShopFromRoute,
  routePoints,
  stayMinutesOf,
  type PlannedRoute,
} from '../../domain/route';
import type { Shop, Station } from '../../domain/shop';
import { ORS_ATTRIBUTION, type RoutingSettings, type WalkingRoute } from '../../services/routing/routingService';
import { StationSelect } from '../StationSelect/StationSelect';

type Props = {
  routes: readonly PlannedRoute[];
  current: PlannedRoute | null;
  shops: readonly Shop[];
  stations: readonly Station[];
  onSelectRoute: (id: string | null) => void;
  onCreateRoute: () => void;
  onChange: (route: PlannedRoute) => void;
  onDelete: (route: PlannedRoute) => void;
  onSelectShop: (shopId: string) => void;
  onShowOnMap: () => void;
  routing: RoutingSettings;
  onSaveRouting: (settings: RoutingSettings) => void;
  /** 現在の地点の並びに対して外部サービスで取得した経路（無ければ null） */
  walkingRoute: WalkingRoute | null;
  onFetchWalkingRoute: () => void;
  walkingStatus: { loading: boolean; error: string | null };
  saveError: string | null;
};

const OPEN_CHECK_LABELS = {
  open: { text: '営業時間内（登録情報）', className: 'badge--verified' },
  closed: { text: '営業時間外を含む', className: 'badge--closed' },
  unknown: { text: '営業時間を判定できません', className: 'badge--unverified' },
} as const;

function dayOfDate(date: string | null | undefined): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** はしご酒プランナー（仕様書 10章） */
export function RoutePlanner(props: Props) {
  const { current, shops, stations, walkingRoute } = props;
  const id = useId();
  const now = () => new Date().toISOString();
  const update = (patch: Partial<PlannedRoute>) =>
    current && props.onChange({ ...current, ...patch, updatedAt: now() });

  const points = useMemo(() => (current ? routePoints(current, shops, stations) : []), [current, shops, stations]);
  const legs = useMemo(() => buildLegs(points), [points]);
  // 外部サービスで取得した経路があればその所要時間、無ければ直線距離からの概算を使う
  const walkMinutes = useMemo(
    () => (walkingRoute ? walkingRoute.legs.map((l) => l.durationMinutes) : legs.map((l) => l.estimatedMinutes)),
    [walkingRoute, legs],
  );
  const schedule = useMemo(
    () => (current ? buildSchedule(current, shops, points, walkMinutes, walkingRoute ? 'routed' : 'estimate') : null),
    [current, shops, points, walkMinutes, walkingRoute],
  );
  const missingShopIds = current ? current.shopIds.filter((sid) => !shops.some((s) => s.id === sid)) : [];

  if (!current) {
    return (
      <div className="route-planner">
        <RouteSelector {...props} />
        <div className="empty-state">
          <p>はしご酒のルートがありません。</p>
          <p className="hint">「＋ 新しいルート」を押すか、店舗の詳細で「はしご酒に追加」を押すと作成されます。</p>
        </div>
      </div>
    );
  }

  const day = dayOfDate(current.plannedDate);
  const shopStops = points.filter((p) => p.kind === 'shop');
  const stayTotal = shopStops.reduce((n, p) => n + stayMinutesOf(current, p.id), 0);
  const walkTotal = walkMinutes.reduce((n, m) => n + m, 0);
  const totalMinutes = stayTotal + walkTotal;
  const distanceTotal = walkingRoute
    ? walkingRoute.legs.reduce((n, l) => n + l.distanceM, 0)
    : legs.reduce((n, l) => n + l.straightM, 0);
  const price = shopStops.reduce(
    (acc, p) => {
      const shop = shops.find((s) => s.id === p.id)!;
      const r = selectedItemsTotal(shop, current.selectedItems?.[shop.id] ?? []);
      return { total: acc.total + r.totalYen, unpriced: acc.unpriced + r.unpricedCount + r.missingCount };
    },
    { total: 0, unpriced: 0 },
  );
  const anySelected = shopStops.some((p) => (current.selectedItems?.[p.id]?.length ?? 0) > 0);
  const canFetch = props.routing.provider === 'openrouteservice' && points.length >= 2;

  return (
    <div className="route-planner">
      <RouteSelector {...props} />

      {props.saveError && (
        <p className="notice notice--danger" role="alert">
          {props.saveError}
        </p>
      )}

      <section className="panel-section">
        <label className="form-field">
          <span className="form-field__label">ルート名</span>
          <input value={current.name} maxLength={100} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <div className="form-row">
          <label className="form-field">
            <span className="form-field__label">予定日</span>
            <input
              type="date"
              value={current.plannedDate ?? ''}
              onChange={(e) => update({ plannedDate: e.target.value || null })}
            />
          </label>
          <label className="form-field">
            <span className="form-field__label">開始時刻</span>
            <input
              type="time"
              value={current.startTime ?? ''}
              onChange={(e) => update({ startTime: e.target.value || null })}
            />
          </label>
        </div>
        <StationSelect
          label="出発駅"
          stations={stations}
          value={current.startStationId ?? ''}
          onChange={(sid) => update({ startStationId: sid || null })}
          emptyLabel="指定しない"
        />
        <div className="form-row">
          <label className="form-field">
            <span className="form-field__label">予算（円）</span>
            <input
              type="number"
              min={0}
              step={500}
              value={current.budgetYen ?? ''}
              onChange={(e) =>
                update({ budgetYen: e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value))) })
              }
            />
          </label>
          <label className="form-field">
            <span className="form-field__label">想定所要時間（分）</span>
            <input
              type="number"
              min={1}
              max={1440}
              step={15}
              value={current.plannedDurationMinutes ?? ''}
              onChange={(e) =>
                update({
                  plannedDurationMinutes:
                    e.target.value === '' ? null : Math.min(1440, Math.max(1, Math.floor(Number(e.target.value)))),
                })
              }
            />
          </label>
        </div>
        <label className="form-field">
          <span className="form-field__label">メモ</span>
          <textarea rows={2} value={current.memo} onChange={(e) => update({ memo: e.target.value })} />
        </label>
        <p className="hint">変更は自動で保存されます。</p>
      </section>

      <section className="panel-section">
        <h2>
          行程（{shopStops.length}軒／最大{MAX_ROUTE_SHOPS}軒）
        </h2>
        {missingShopIds.length > 0 && (
          <p className="notice notice--warn">
            削除された店舗が {missingShopIds.length} 件含まれているため、行程から除いて表示しています。
          </p>
        )}
        {shopStops.length === 0 ? (
          <p className="hint">店舗の詳細で「はしご酒に追加」を押すと、ここに追加されます。</p>
        ) : (
          <ol className="itinerary" aria-label="行程">
            {points.map((p, i) => {
              const leg = i > 0 ? legs[i - 1] : undefined;
              const routedLeg = i > 0 ? walkingRoute?.legs[i - 1] : undefined;
              return (
                <li key={`${p.kind}-${p.id}`} className={`itinerary__item is-${p.kind}`}>
                  {leg && (
                    <div className="itinerary__leg">
                      ↓{' '}
                      {routedLeg
                        ? `徒歩 ${formatDistance(routedLeg.distanceM)}・約${routedLeg.durationMinutes}分（経路検索）`
                        : `直線 ${formatDistance(leg.straightM)}・徒歩の目安 約${leg.estimatedMinutes}分（概算）`}
                    </div>
                  )}
                  {p.kind === 'station' ? (
                    <div className="itinerary__station">
                      <span className="route-num route-num--station">駅</span> 出発：{p.name}
                    </div>
                  ) : (
                    <StopCard
                      route={current}
                      shop={shops.find((s) => s.id === p.id)!}
                      order={shopStops.findIndex((s) => s.id === p.id)}
                      count={shopStops.length}
                      day={day}
                      schedule={schedule?.stops.find((s) => s.shopId === p.id) ?? null}
                      onChange={props.onChange}
                      onSelectShop={props.onSelectShop}
                      idPrefix={id}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {shopStops.length > 0 && (
        <section className="panel-section" aria-label="ルートの合計">
          <h2>合計</h2>
          <dl className="detail__list">
            <dt>移動距離</dt>
            <dd>
              {formatDistance(distanceTotal)}
              <span className="hint">
                {walkingRoute ? '（経路検索の道のり）' : '（直線距離の合計。実際の道のりはこれより長くなります）'}
              </span>
            </dd>
            <dt>所要時間</dt>
            <dd>
              {formatDuration(totalMinutes)}
              <span className="hint">
                （滞在 {formatDuration(stayTotal)}＋移動 {formatDuration(walkTotal)}
                {walkingRoute ? '' : `、移動は直線距離÷分速${WALK_METERS_PER_MINUTE}mの概算`}）
              </span>
              {current.plannedDurationMinutes !== null && (
                <div className={totalMinutes > current.plannedDurationMinutes ? 'text-warn' : 'text-ok'}>
                  想定 {formatDuration(current.plannedDurationMinutes)} に対して
                  {totalMinutes > current.plannedDurationMinutes
                    ? ` ${formatDuration(totalMinutes - current.plannedDurationMinutes)} 超過`
                    : ` 残り ${formatDuration(current.plannedDurationMinutes - totalMinutes)}`}
                </div>
              )}
            </dd>
            {schedule && (
              <>
                <dt>終了予定</dt>
                <dd>{formatClock(schedule.endMinutes)}</dd>
              </>
            )}
            <dt>予定の品の合計</dt>
            <dd>
              {anySelected ? formatYen(price.total) : '未選択'}
              {anySelected && price.unpriced > 0 && (
                <span className="hint">（価格が未確認の品 {price.unpriced} 件を除く）</span>
              )}
              {current.budgetYen !== null && anySelected && (
                <div className={price.total > current.budgetYen ? 'text-warn' : 'text-ok'}>
                  予算 {formatYen(current.budgetYen)} に対して
                  {price.total > current.budgetYen
                    ? ` ${formatYen(price.total - current.budgetYen)} 超過`
                    : ` 残り ${formatYen(current.budgetYen - price.total)}`}
                </div>
              )}
              <div className="hint">登録された価格例の合計です。{PRICE_CAVEAT}</div>
            </dd>
          </dl>
          {!schedule && (
            <p className="hint">予定日と開始時刻を入れると、到着時刻を計算して登録された営業時間と照合します。</p>
          )}
          {schedule && (
            <p className="hint">
              営業時間の照合は登録情報に基づく参考です。臨時休業・祝日・最新の変更は反映されません。終電は確認していません。
            </p>
          )}
        </section>
      )}

      <section className="panel-section">
        <div className="button-grid">
          <button type="button" className="btn" onClick={props.onShowOnMap} disabled={points.length === 0}>
            地図でルート全体を表示
          </button>
          <button
            type="button"
            className="btn"
            onClick={props.onFetchWalkingRoute}
            disabled={!canFetch || props.walkingStatus.loading}
            title={
              props.routing.provider === 'none'
                ? '下の「徒歩ルートの設定」で外部サービスを有効にすると使えます'
                : undefined
            }
          >
            {props.walkingStatus.loading ? '取得中…' : '徒歩ルートを取得'}
          </button>
        </div>
        {props.walkingStatus.error && (
          <p className="notice notice--danger" role="alert">
            {props.walkingStatus.error}
          </p>
        )}
        {walkingRoute ? (
          <p className="hint">徒歩ルートを取得済み。{walkingRoute.attribution}</p>
        ) : (
          <p className="hint">
            地図上の点線は地点を直線で結んだもので、実際の徒歩ルートではありません。
            {props.routing.provider === 'none' &&
              '徒歩ルートを取得するには、下の設定で外部サービスを有効にしてください。'}
          </p>
        )}
        <RoutingSettingsForm routing={props.routing} onSave={props.onSaveRouting} />
      </section>

      <section className="panel-section">
        <button type="button" className="btn btn--danger" onClick={() => props.onDelete(current)}>
          このルートを削除
        </button>
      </section>
    </div>
  );
}

function RouteSelector({ routes, current, onSelectRoute, onCreateRoute }: Props) {
  const sorted = [...routes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className="route-selector">
      <label className="form-field">
        <span className="form-field__label">ルート</span>
        <select value={current?.id ?? ''} onChange={(e) => onSelectRoute(e.target.value || null)}>
          <option value="">{routes.length ? 'ルートを選択…' : '保存されたルートはありません'}</option>
          {sorted.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}（{r.shopIds.length}軒）
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn" onClick={onCreateRoute}>
        ＋ 新しいルート
      </button>
    </div>
  );
}

type StopProps = {
  route: PlannedRoute;
  shop: Shop;
  order: number;
  count: number;
  day: number | null;
  schedule: { arrivalMinutes: number; departureMinutes: number; openCheck: 'open' | 'closed' | 'unknown' } | null;
  onChange: (route: PlannedRoute) => void;
  onSelectShop: (shopId: string) => void;
  idPrefix: string;
};

function StopCard({ route, shop, order, count, day, schedule, onChange, onSelectShop, idPrefix }: StopProps) {
  const now = new Date().toISOString();
  const indexInRoute = route.shopIds.indexOf(shop.id);
  const stay = stayMinutesOf(route, shop.id);
  const selected = route.selectedItems?.[shop.id] ?? [];
  const priced = pricedExamples(shop);
  const unpricedItems = shop.priceExamples.filter((p) => p.priceYen === null);
  const subtotal = selectedItemsTotal(shop, selected);
  const toggleItem = (name: string) => {
    const next = selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name];
    onChange({ ...route, selectedItems: { ...(route.selectedItems ?? {}), [shop.id]: next }, updatedAt: now });
  };
  const check = schedule ? OPEN_CHECK_LABELS[schedule.openCheck] : null;

  return (
    <div className="stop-card" role="group" aria-label={`${order + 1}軒目 ${shop.name}`}>
      <div className="stop-card__head">
        <span className="route-num">{order + 1}</span>
        <button type="button" className="link-btn" onClick={() => onSelectShop(shop.id)}>
          {shop.name}
        </button>
      </div>
      <div className="hint">住所：{shop.address ?? '未確認'}</div>
      <div className="hint">
        {day === null
          ? '営業時間：予定日を入れるとその曜日の営業時間を表示します'
          : `営業時間（${formatDay(day)}曜）：${formatHoursEntry(entryForDay(shop.openingHours, day))}`}
      </div>
      {schedule && check && (
        <div className="stop-card__time">
          {formatClock(schedule.arrivalMinutes)}〜{formatClock(schedule.departureMinutes)}{' '}
          <span className={`badge ${check.className}`}>{check.text}</span>
        </div>
      )}
      <label className="form-field form-field--inline">
        <span className="form-field__label">滞在</span>
        <input
          type="number"
          min={0}
          max={600}
          step={5}
          value={stay}
          aria-label={`${shop.name}の滞在時間（分）`}
          onChange={(e) =>
            onChange({
              ...route,
              stayMinutes: {
                ...(route.stayMinutes ?? {}),
                [shop.id]:
                  e.target.value === ''
                    ? DEFAULT_STAY_MINUTES
                    : Math.min(600, Math.max(0, Math.floor(Number(e.target.value)))),
              },
              updatedAt: now,
            })
          }
        />
        <span className="hint">分</span>
      </label>
      <details className="stop-card__order">
        <summary>
          頼む予定の品{selected.length ? `（${selected.length}品・${formatYen(subtotal.totalYen)}）` : ''}
        </summary>
        {shop.priceExamples.length === 0 ? (
          <p className="hint">価格例が登録されていません。</p>
        ) : (
          <div className="checks checks--column">
            {[...priced, ...unpricedItems].map((p) => (
              <label key={`${idPrefix}-${shop.id}-${p.itemName}`} className="check">
                <input
                  type="checkbox"
                  checked={selected.includes(p.itemName)}
                  onChange={() => toggleItem(p.itemName)}
                />
                {p.itemName}（{formatYen(p.priceYen)}）
              </label>
            ))}
          </div>
        )}
      </details>
      <div className="stop-card__actions">
        <button
          type="button"
          className="btn btn--small"
          onClick={() => onChange(moveShopInRoute(route, indexInRoute, -1, now))}
          disabled={order === 0}
          aria-label={`${shop.name}を前へ`}
        >
          ↑ 前へ
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => onChange(moveShopInRoute(route, indexInRoute, 1, now))}
          disabled={order === count - 1}
          aria-label={`${shop.name}を後ろへ`}
        >
          ↓ 後ろへ
        </button>
        <button
          type="button"
          className="btn btn--small btn--danger"
          onClick={() => onChange(removeShopFromRoute(route, shop.id, now))}
          aria-label={`${shop.name}をルートから外す`}
        >
          外す
        </button>
      </div>
    </div>
  );
}

function RoutingSettingsForm({ routing, onSave }: { routing: RoutingSettings; onSave: (s: RoutingSettings) => void }) {
  const [key, setKey] = useState(routing.orsApiKey);
  const [provider, setProvider] = useState(routing.provider);
  const [saved, setSaved] = useState(false);
  return (
    <details className="subform routing-settings">
      <summary>徒歩ルートの設定</summary>
      <div className="checks checks--column">
        <label className="check">
          <input
            type="radio"
            name="routing-provider"
            checked={provider === 'none'}
            onChange={() => setProvider('none')}
          />
          直線距離と概算のみ（外部と通信しない）
        </label>
        <label className="check">
          <input
            type="radio"
            name="routing-provider"
            checked={provider === 'openrouteservice'}
            onChange={() => setProvider('openrouteservice')}
          />
          openrouteservice で徒歩ルートを取得する（APIキーが必要）
        </label>
      </div>
      {provider === 'openrouteservice' && (
        <>
          <label className="form-field">
            <span className="form-field__label">openrouteservice の API キー</span>
            <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
          </label>
          <p className="hint">
            キーは openrouteservice.org
            で無料登録して発行できます（無料プランは1日2,000回まで）。キーはこのブラウザ内にだけ保存し、バックアップには含めません。
            「徒歩ルートを取得」を押したときだけ、ルート上の店舗・駅の座標を openrouteservice
            に送信します（個人記録は送信しません）。
          </p>
          <p className="hint">{ORS_ATTRIBUTION}</p>
        </>
      )}
      <button
        type="button"
        className="btn btn--small"
        onClick={() => {
          onSave({ provider, orsApiKey: provider === 'openrouteservice' ? key.trim() : routing.orsApiKey });
          setSaved(true);
        }}
        disabled={provider === 'openrouteservice' && !key.trim()}
      >
        設定を保存
      </button>
      {saved && (
        <span className="hint" role="status">
          {' '}
          保存しました
        </span>
      )}
    </details>
  );
}
