import { formatDateTime, formatYen } from '../../domain/format';
import { MARK_KINDS, MARK_LABELS, sortVisitsDesc, type MarkKind, type ShopMark, type Visit } from '../../domain/visit';

type Props = {
  mark: ShopMark | undefined;
  visits: readonly Visit[];
  onToggleMark: (kind: MarkKind) => void;
  onAddVisit: () => void;
  onEditVisit: (visit: Visit) => void;
  onDeleteVisit: (visit: Visit) => void;
  /** はしご酒プラン（現在のルート）に入っているか */
  routeInfo: { routeName: string | null; order: number | null; full: boolean };
  onToggleRoute: () => void;
};

const MARK_ICONS: Record<MarkKind, string> = { favorite: '♥', wantToGo: '⚑', revisit: '↻' };

export function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="hint">未評価</span>;
  return (
    <span className="stars" aria-label={`評価 ${rating}`}>
      {'★'.repeat(rating)}
      <span className="stars__off">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

/** 店舗詳細内の「自分の記録」（お気に入り等と訪問記録）。店舗の事実情報とは分けて表示する */
export function PersonalRecordSection({
  mark,
  visits,
  onToggleMark,
  onAddVisit,
  onEditVisit,
  onDeleteVisit,
  routeInfo,
  onToggleRoute,
}: Props) {
  const sorted = sortVisitsDesc(visits);
  return (
    <section className="personal" aria-label="自分の記録">
      <h3>自分の記録</h3>
      <div className="mark-buttons">
        {MARK_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className={`mark-btn ${mark?.[k] ? 'is-on' : ''}`}
            aria-pressed={mark?.[k] ?? false}
            onClick={() => onToggleMark(k)}
          >
            <span aria-hidden="true">{MARK_ICONS[k]}</span> {MARK_LABELS[k]}
          </button>
        ))}
      </div>

      <div className="route-add">
        <button
          type="button"
          className={`btn btn--small ${routeInfo.order !== null ? '' : 'btn--route'}`}
          onClick={onToggleRoute}
          disabled={routeInfo.order === null && routeInfo.full}
        >
          {routeInfo.order !== null ? 'はしご酒プランから外す' : '＋ はしご酒に追加'}
        </button>
        <span className="hint">
          {routeInfo.order !== null
            ? `「${routeInfo.routeName}」の${routeInfo.order + 1}軒目`
            : routeInfo.full
              ? 'ルートが上限の軒数に達しています'
              : routeInfo.routeName
                ? `「${routeInfo.routeName}」に追加します`
                : '新しいルートを作って追加します'}
        </span>
      </div>

      <div className="personal__visits-header">
        <h4>訪問記録（{visits.length}件）</h4>
        <button type="button" className="btn btn--small btn--primary" onClick={onAddVisit}>
          ＋ 訪問記録を追加
        </button>
      </div>
      {sorted.length === 0 ? (
        <p className="hint">まだ訪問記録はありません。</p>
      ) : (
        <ul className="visit-list">
          {sorted.map((v) => (
            <li key={v.id} className="visit-item">
              <div className="visit-item__head">
                <time dateTime={v.visitedAt}>{formatDateTime(v.visitedAt)}</time>
                <Stars rating={v.rating} />
                {v.amountYen !== null && <span>{formatYen(v.amountYen)}</span>}
              </div>
              {v.orderedItems.length > 0 && <div className="visit-item__items">注文：{v.orderedItems.join('、')}</div>}
              {v.atmosphereTags.length > 0 && (
                <ul className="tags">
                  {v.atmosphereTags.map((t) => (
                    <li key={t} className="tag">
                      {t}
                    </li>
                  ))}
                </ul>
              )}
              {v.memo && <p className="pre-wrap visit-item__memo">{v.memo}</p>}
              {v.photoRefs.length > 0 && <div className="hint">写真：{v.photoRefs.join('、')}</div>}
              <div className="visit-item__actions">
                <button type="button" className="btn btn--small" onClick={() => onEditVisit(v)}>
                  編集
                </button>
                <button type="button" className="btn btn--small btn--danger" onClick={() => onDeleteVisit(v)}>
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
