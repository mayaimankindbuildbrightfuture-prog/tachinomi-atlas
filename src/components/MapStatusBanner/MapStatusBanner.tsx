import type { MapIssue } from '../../services/map/mapErrors';
import type { MapStatus } from '../../services/map/mapAdapter';

type Props = {
  status: MapStatus;
  issue: MapIssue | null;
  onRetry: () => void;
  onDismiss: () => void;
};

/** 地図の読み込み状態とエラーを地図上部に表示する */
export function MapStatusBanner({ status, issue, onRetry, onDismiss }: Props) {
  return (
    <div className="map-status" aria-live="polite">
      {status === 'loading' && !issue && (
        <div className="map-status__loading" role="status">
          <span className="spinner" aria-hidden="true" />
          地図を読み込み中…
        </div>
      )}
      {issue && (
        <div className={`map-status__issue ${issue.fatal ? 'is-fatal' : ''}`} role="alert">
          <p className="map-status__title">{issue.title}</p>
          <ul className="map-status__actions">
            {issue.actions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          {status === 'fallback' && (
            <p className="map-status__note">
              現在は外部の地図データを使わない簡易表示です（背景のみ）。地図操作は引き続き可能です。
            </p>
          )}
          {issue.detail && (
            <details className="map-status__detail">
              <summary>技術的な詳細</summary>
              <code>{issue.detail}</code>
            </details>
          )}
          <div className="map-status__buttons">
            {!issue.fatal && (
              <button type="button" className="btn btn--primary" onClick={onRetry}>
                再読み込み
              </button>
            )}
            {!issue.fatal && (
              <button type="button" className="btn" onClick={onDismiss}>
                閉じる
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
