import type { ReactNode } from 'react';
import { formatDay, formatHoursEntry, entryForDay, openStateAt, tokyoNow, type TokyoNow } from '../../domain/hours';
import { nearestStations } from '../../domain/density';
import { formatDate, formatDateTime, formatTriState, formatYen, hostnameOf } from '../../domain/format';
import {
  PRICE_LEVEL_LABELS,
  SOURCE_TYPE_LABELS,
  STATUS_LABELS,
  getCategory,
  type DataSource,
  type Shop,
  type Station,
} from '../../domain/shop';

type Props = {
  shop: Shop;
  sources: readonly DataSource[];
  stations: readonly Station[];
  isSeedShop: boolean;
  now?: TokyoNow;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onShowOnMap: () => void;
  /** 個人記録（お気に入り・訪問記録）。店舗の事実情報とは分けて表示する */
  personalSection?: ReactNode;
};

/** 月曜始まりで表示する */
const DISPLAY_DAYS = [1, 2, 3, 4, 5, 6, 0];

function ExternalLink({ url, label }: { url: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={url}>
      {label}（{hostnameOf(url)}）↗
    </a>
  );
}

function Unknown() {
  return <span className="unknown">未確認</span>;
}

/** 右側の店舗詳細パネル（仕様書 4.3）。不明な情報は「未確認」と表示し、補完しない */
export function ShopDetail({
  shop,
  sources,
  stations,
  isSeedShop,
  now = tokyoNow(),
  onClose,
  onEdit,
  onDelete,
  onShowOnMap,
  personalSection,
}: Props) {
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const shopSources = shop.sourceIds.map((id) => sourceById.get(id) ?? null);
  const stationNames = shop.stationIds.map((id) => stations.find((s) => s.id === id)?.name ?? `不明な駅（${id}）`);
  const openState = openStateAt(shop.openingHours, now.day, now.minutes);
  const nearby = nearestStations(shop, stations, 3);

  return (
    <article className="detail" aria-labelledby="shop-detail-title">
      <header className="detail__header">
        <h2 id="shop-detail-title">{shop.name}</h2>
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label="詳細パネルを閉じる"
          title="詳細パネルを閉じる"
        >
          ✕
        </button>
      </header>

      <div className="detail__status">
        <span className={`badge badge--${shop.status}`}>{STATUS_LABELS[shop.status]}</span>
        <span className="detail__verified">最終確認日：{formatDate(shop.lastVerifiedAt)}</span>
      </div>
      {shop.status === 'unverified' && (
        <p className="notice notice--warn">この店舗の情報は確認されていません。訪問前に公式情報を確認してください。</p>
      )}
      {shop.status === 'possibly_closed' && <p className="notice notice--warn">閉店している可能性があります。</p>}
      {shop.status === 'closed' && <p className="notice notice--danger">閉店が確認されています。</p>}

      <div className="detail__actions">
        <button type="button" className="btn" onClick={onShowOnMap}>
          地図で表示
        </button>
        <button type="button" className="btn" onClick={onEdit}>
          編集
        </button>
        <button type="button" className="btn btn--danger" onClick={onDelete}>
          削除
        </button>
      </div>

      {personalSection}

      <h3 className="detail__facts-title">店舗の情報</h3>

      <dl className="detail__list">
        <dt>住所</dt>
        <dd>{shop.address ?? <Unknown />}</dd>
        <dt>地域</dt>
        <dd>{[shop.prefecture, shop.municipality].filter(Boolean).join(' ') || <Unknown />}</dd>
        <dt>座標</dt>
        <dd className="mono">
          {shop.latitude.toFixed(6)}, {shop.longitude.toFixed(6)}
        </dd>
        <dt>最寄り駅</dt>
        <dd>{stationNames.length ? stationNames.join('、') : <Unknown />}</dd>
        <dt>近くの駅</dt>
        <dd>
          {nearby.length ? (
            <>
              {nearby.map((n) => `${n.station.name}（約${Math.round(n.distanceM / 10) * 10}m）`).join('、')}
              <span className="hint">（直線距離・参考）</span>
            </>
          ) : (
            <span className="hint">2km以内に駅データがありません</span>
          )}
        </dd>
        <dt>立ち呑み形式</dt>
        <dd>
          {formatTriState(shop.standingOnly, '立ち呑み専業', '立ち呑み専業ではない')}／
          {formatTriState(shop.hasSeating, '座席あり', '座席なし')}
        </dd>
        <dt>料理ジャンル</dt>
        <dd>
          {shop.categories.length ? (
            <ul className="tags">
              {shop.categories.map((c) => {
                const def = getCategory(c);
                return (
                  <li key={c} className="tag">
                    <span className="tag__dot" style={{ background: def.color }} aria-hidden="true">
                      {def.short}
                    </span>
                    {def.label}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Unknown />
          )}
        </dd>
        <dt>酒の種類</dt>
        <dd>
          {shop.drinkTags.length ? (
            <ul className="tags">
              {shop.drinkTags.map((d) => (
                <li key={d} className="tag">
                  {d}
                </li>
              ))}
            </ul>
          ) : (
            <Unknown />
          )}
        </dd>
        <dt>予算帯</dt>
        <dd>{PRICE_LEVEL_LABELS[shop.priceLevel]}</dd>
      </dl>

      <section className="detail__section">
        <h3>価格例</h3>
        {shop.priceExamples.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>品目</th>
                <th>価格</th>
                <th>確認日</th>
                <th>出典</th>
              </tr>
            </thead>
            <tbody>
              {shop.priceExamples.map((p, i) => (
                <tr key={`${p.itemName}-${i}`}>
                  <td>{p.itemName}</td>
                  <td>{formatYen(p.priceYen)}</td>
                  <td>{formatDate(p.checkedAt)}</td>
                  <td>{p.sourceId ? (sourceById.get(p.sourceId)?.name ?? '不明な出典') : '未確認'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>
            <Unknown />
          </p>
        )}
        <p className="hint">価格は確認日時点のものです。税・お通し・チャージが含まれない場合があります。</p>
      </section>

      <section className="detail__section">
        <h3>営業時間</h3>
        <table className="table table--hours">
          <tbody>
            {DISPLAY_DAYS.map((d) => {
              const entry = entryForDay(shop.openingHours, d);
              const text = formatHoursEntry(entry);
              return (
                <tr key={d} className={d === now.day ? 'is-today' : ''}>
                  <th scope="row">{formatDay(d)}</th>
                  <td className={text === '未確認' ? 'unknown' : ''}>
                    {text}
                    {entry?.note ? <span className="hint">（{entry.note}）</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="detail__open-state" data-state={openState}>
          {openState === 'open' && '登録された営業時間では、現在は営業時間内です。'}
          {openState === 'closed' && '登録された営業時間では、現在は営業時間外です。'}
          {openState === 'unknown' && '現在の営業状況は判定できません（営業時間が未確認）。'}
        </p>
        <p className="hint">
          日本時間で判定しています。臨時休業・祝日・最新の変更は反映されません。
          {shop.status !== 'verified' && ' この店舗の情報は確認済みではありません。'}
        </p>
      </section>

      <section className="detail__section">
        <h3>リンク・出典</h3>
        <p>公式サイト：{shop.officialUrl ? <ExternalLink url={shop.officialUrl} label="開く" /> : <Unknown />}</p>
        {shopSources.length ? (
          <ul className="sources">
            {shopSources.map((src, i) =>
              src ? (
                <li key={src.id}>
                  <strong>{src.name}</strong>（{SOURCE_TYPE_LABELS[src.type]}）
                  {src.url && (
                    <>
                      {' '}
                      <ExternalLink url={src.url} label="出典を開く" />
                    </>
                  )}
                  <span className="hint"> 参照日：{formatDate(src.accessedAt)}</span>
                  {src.notes && <div className="hint">{src.notes}</div>}
                </li>
              ) : (
                <li key={`missing-${i}`} className="unknown">
                  見つからない出典（{shop.sourceIds[i]}）
                </li>
              ),
            )}
          </ul>
        ) : (
          <p>
            出典：
            <Unknown />
          </p>
        )}
        <p className="hint">出典は情報の根拠を示すもので、内容の正確さを保証するものではありません。</p>
      </section>

      {shop.notes && (
        <section className="detail__section">
          <h3>メモ</h3>
          <p className="pre-wrap">{shop.notes}</p>
        </section>
      )}

      <footer className="detail__footer hint">
        <div>登録：{formatDateTime(shop.createdAt)}</div>
        <div>更新：{formatDateTime(shop.updatedAt)}</div>
        <div>{isSeedShop ? '初期データの店舗' : '自分で追加した店舗'}</div>
      </footer>
    </article>
  );
}
