import { useMemo, useState } from 'react';
import { formatDateTime, formatYen } from '../../domain/format';
import type { Shop } from '../../domain/shop';
import {
  MARK_KINDS,
  MARK_LABELS,
  groupVisitsByMonth,
  visitStats,
  type MarkKind,
  type ShopMark,
  type Visit,
} from '../../domain/visit';
import { Stars } from '../ShopDetail/PersonalRecordSection';

type Props = {
  visits: readonly Visit[];
  marks: ReadonlyMap<string, ShopMark>;
  shops: readonly Shop[];
  loading: boolean;
  onSelectShop: (shopId: string) => void;
  onOpenDataManager: () => void;
};

type View = 'history' | MarkKind;

/** 「記録」タブ：訪問履歴の時系列表示（F-17）と、お気に入り・行きたい店・再訪したい店の一覧 */
export function RecordsPanel({ visits, marks, shops, loading, onSelectShop, onOpenDataManager }: Props) {
  const [view, setView] = useState<View>('history');
  const shopById = useMemo(() => new Map(shops.map((s) => [s.id, s])), [shops]);
  const stats = useMemo(() => visitStats(visits), [visits]);
  const months = useMemo(() => groupVisitsByMonth(visits), [visits]);
  const markLists = useMemo(() => {
    const lists: Record<MarkKind, string[]> = { favorite: [], wantToGo: [], revisit: [] };
    for (const m of marks.values()) for (const k of MARK_KINDS) if (m[k]) lists[k].push(m.shopId);
    return lists;
  }, [marks]);

  if (loading) {
    return (
      <p className="empty-state" role="status">
        記録を読み込み中…
      </p>
    );
  }

  const shopName = (shopId: string, fallback?: string) => shopById.get(shopId)?.name ?? fallback;

  return (
    <div className="records-panel">
      <section className="panel-section">
        <h2>これまでの記録</h2>
        <dl className="stats">
          <div>
            <dt>訪問</dt>
            <dd>
              <strong>{stats.visitCount}</strong>回
            </dd>
          </div>
          <div>
            <dt>訪れた店</dt>
            <dd>
              <strong>{stats.shopCount}</strong>店
            </dd>
          </div>
          <div>
            <dt>支払い合計</dt>
            <dd>
              <strong>{formatYen(stats.totalAmountYen)}</strong>
              <span className="hint">（金額を記録した{stats.amountRecordedCount}回分）</span>
            </dd>
          </div>
          <div>
            <dt>平均評価</dt>
            <dd>
              {stats.averageRating === null ? (
                <span className="hint">評価なし</span>
              ) : (
                <>
                  <strong>{stats.averageRating.toFixed(1)}</strong>
                  <span className="hint">（{stats.ratedCount}回分）</span>
                </>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <div className="segmented" role="tablist" aria-label="記録の種類">
        {(['history', ...MARK_KINDS] as View[]).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}>
            {v === 'history' ? '訪問履歴' : `${MARK_LABELS[v]}（${markLists[v].length}）`}
          </button>
        ))}
      </div>

      {view === 'history' &&
        (months.length === 0 ? (
          <div className="empty-state">
            <p>訪問記録はまだありません。</p>
            <p className="hint">店舗の詳細パネルの「＋ 訪問記録を追加」から記録できます。</p>
          </div>
        ) : (
          <ol className="timeline" aria-label="訪問履歴">
            {months.map((m) => (
              <li key={m.month}>
                <h3 className="timeline__month">
                  {m.label}
                  <span className="hint">（{m.visits.length}回）</span>
                </h3>
                <ul className="timeline__items">
                  {m.visits.map((v) => {
                    const exists = shopById.has(v.shopId);
                    const name = shopName(v.shopId, v.shopNameAtVisit) ?? '名称不明の店舗';
                    return (
                      <li key={v.id} className="timeline__item">
                        <time dateTime={v.visitedAt}>{formatDateTime(v.visitedAt).slice(5)}</time>
                        {exists ? (
                          <button type="button" className="link-btn" onClick={() => onSelectShop(v.shopId)}>
                            {name}
                          </button>
                        ) : (
                          <span>
                            {name}
                            <span className="hint">（削除された店舗）</span>
                          </span>
                        )}
                        <span className="timeline__meta">
                          <Stars rating={v.rating} />
                          {v.amountYen !== null && <span>{formatYen(v.amountYen)}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        ))}

      {view !== 'history' &&
        (markLists[view].length === 0 ? (
          <p className="empty-state">「{MARK_LABELS[view]}」に登録した店舗はありません。</p>
        ) : (
          <ul className="mark-list" aria-label={MARK_LABELS[view]}>
            {markLists[view].map((id) => (
              <li key={id}>
                {shopById.has(id) ? (
                  <button type="button" className="link-btn" onClick={() => onSelectShop(id)}>
                    {shopName(id)}
                  </button>
                ) : (
                  <span className="hint">見つからない店舗（{id}）</span>
                )}
              </li>
            ))}
          </ul>
        ))}

      <section className="panel-section panel-section--muted">
        <h2>バックアップ</h2>
        <p className="hint">
          記録はこのブラウザ内にだけ保存されています。閲覧データの削除などで消えることがあるため、定期的に書き出してください。
        </p>
        <button type="button" className="btn" onClick={onOpenDataManager}>
          データ管理を開く
        </button>
      </section>
    </div>
  );
}
