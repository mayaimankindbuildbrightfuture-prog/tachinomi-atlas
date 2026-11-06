import { useEffect, useId, useState } from 'react';
import {
  BACKUP_KIND_LABELS,
  USER_DATA_LABELS,
  backupFileName,
  buildBackup,
  countUserData,
  describeBackup,
  parseBackup,
  withoutDangling,
  type BackupKind,
  type ImportMode,
  type ImportPreview,
  type UserData,
} from '../../domain/backup';
import { formatDateTime } from '../../domain/format';
import type { DataSource, Shop } from '../../domain/shop';
import { downloadJson, readTextFile } from '../../services/importExport/fileIO';
import { backupRepository as defaultRepository, type BackupRepository } from '../../services/storage/backupRepository';

type Props = {
  /** 画面に表示している全店舗（初期データ＋自分で追加・編集） */
  allShops: readonly Shop[];
  allSources: readonly DataSource[];
  onClose: () => void;
  /** 読み込み完了後に、各データを読み込み直す */
  onImported: () => void;
  repository?: BackupRepository;
};

/** バックアップを促す目安（日） */
export const BACKUP_REMINDER_DAYS = 30;

const EXPORTS: { kind: BackupKind; description: string }[] = [
  {
    kind: 'full',
    description:
      'ブラウザ内に保存しているすべてのデータ（追加・編集した店舗、出典、削除記録、訪問記録、お気に入り等、調査済みエリア）。復元にはこれを使います。',
  },
  { kind: 'personal', description: '訪問記録・お気に入り等・調査済みエリアのみ。' },
  {
    kind: 'shops',
    description: '画面に表示しているすべての店舗データ（初期データを含む）と出典。個人記録は含みません。',
  },
];

/** データ管理（JSON の書き出し・読み込み、仕様書 8.3） */
export function DataManager({ allShops, allSources, onClose, onImported, repository = defaultRepository }: Props) {
  const id = useId();
  const [lastBackupAt, setLastBackupAt] = useState<string | null | undefined>(undefined);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportDone, setExportDone] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [includeDangling, setIncludeDangling] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    repository
      .getLastBackupAt()
      .then(setLastBackupAt)
      .catch(() => setLastBackupAt(null));
  }, [repository]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !importing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, importing]);

  const exportData = async (kind: BackupKind) => {
    setExportError(null);
    setExportDone(null);
    try {
      const user = await repository.exportUserData();
      const now = new Date().toISOString();
      const file = buildBackup(kind, user, allShops, allSources, now);
      const name = backupFileName(kind, now);
      downloadJson(name, file);
      if (kind === 'full') {
        await repository.setLastBackupAt(now);
        setLastBackupAt(now);
      }
      const summary = describeBackup(file)
        .map((d) => `${d.label}${d.count}件`)
        .join('、');
      setExportDone(`${BACKUP_KIND_LABELS[kind]}を ${name} として保存しました（${summary}）。`);
    } catch (e) {
      setExportError(
        `書き出しに失敗しました：${e instanceof Error ? e.message : String(e)}。ブラウザのダウンロード設定や空き容量を確認してください。`,
      );
    }
  };

  const onFile = async (file: File | undefined) => {
    setPreview(null);
    setFileError(null);
    setImportResult(null);
    setConfirming(false);
    if (!file) return;
    try {
      const text = await readTextFile(file);
      const known = new Set(allShops.map((s) => s.id));
      setPreview(parseBackup(text, known));
    } catch (e) {
      setFileError(e instanceof Error ? e.message : String(e));
    }
  };

  const dataToImport: UserData | null = preview ? (includeDangling ? preview.data : withoutDangling(preview)) : null;

  const runImport = async () => {
    if (!dataToImport) return;
    setImporting(true);
    try {
      await repository.importUserData(dataToImport, mode, new Date().toISOString());
      setImportResult({ ok: true, message: '読み込みが完了しました。' });
      setPreview(null);
      onImported();
    } catch (e) {
      // トランザクションのため、失敗時は何も変更されていない
      setImportResult({
        ok: false,
        message: `読み込みに失敗しました（データは変更されていません）：${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setImporting(false);
      setConfirming(false);
    }
  };

  const daysSince = lastBackupAt ? Math.floor((Date.now() - Date.parse(lastBackupAt)) / 86_400_000) : null;

  return (
    <div className="modal-backdrop">
      <div className="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <header className="detail__header">
          <h2 id={`${id}-title`}>データ管理</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="データ管理を閉じる"
            disabled={importing}
          >
            ✕
          </button>
        </header>

        <section className="panel-section">
          <h3>保存場所とバックアップ</h3>
          <p className="hint">
            追加・編集した店舗や個人記録は、このブラウザ内（IndexedDB）にだけ保存されています。閲覧データの削除や別のPC・ブラウザでは失われるため、定期的に「全データのバックアップ」を書き出してください。
          </p>
          <p data-testid="last-backup">
            最終バックアップ：
            {lastBackupAt === undefined
              ? '確認中…'
              : lastBackupAt === null
                ? 'まだありません'
                : formatDateTime(lastBackupAt)}
          </p>
          {(lastBackupAt === null || (daysSince !== null && daysSince >= BACKUP_REMINDER_DAYS)) && (
            <p className="notice notice--warn">
              {lastBackupAt === null
                ? 'まだバックアップがありません。'
                : `前回のバックアップから${daysSince}日たっています。`}
              「全データのバックアップ」の書き出しをおすすめします。
            </p>
          )}
          <p className="notice notice--warn">
            書き出したファイルには、訪問の感想など個人的なメモが含まれます。共有する場合は内容に注意してください。
          </p>
        </section>

        <section className="panel-section">
          <h3>書き出し（JSON）</h3>
          <ul className="export-list">
            {EXPORTS.map((e) => (
              <li key={e.kind}>
                <button
                  type="button"
                  className={`btn ${e.kind === 'full' ? 'btn--primary' : ''}`}
                  onClick={() => exportData(e.kind)}
                >
                  {BACKUP_KIND_LABELS[e.kind]}を書き出す
                </button>
                <span className="hint">{e.description}</span>
              </li>
            ))}
          </ul>
          {exportDone && (
            <p className="notice" role="status">
              {exportDone}
            </p>
          )}
          {exportError && (
            <p className="notice notice--danger" role="alert">
              {exportError}
            </p>
          )}
        </section>

        <section className="panel-section">
          <h3>読み込み（復元）</h3>
          <label className="form-field">
            <span className="form-field__label">書き出した JSON ファイルを選ぶ</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => onFile(e.target.files?.[0])}
              disabled={importing}
            />
          </label>
          <p className="hint">ファイルを選ぶと内容を検証して表示します。この時点ではデータは変更されません。</p>
          {fileError && (
            <p className="notice notice--danger" role="alert">
              {fileError}
            </p>
          )}

          {preview && (
            <div className="import-preview" aria-label="読み込む内容">
              <p>
                種類：{BACKUP_KIND_LABELS[preview.kind]}
                {preview.exportedAt && (
                  <span className="hint">（{formatDateTime(preview.exportedAt)} に書き出し）</span>
                )}
              </p>
              {preview.errors.length > 0 ? (
                <div className="notice notice--danger" role="alert">
                  <p>このファイルは読み込めません。データは変更していません。</p>
                  <ul>
                    {preview.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <>
                  <table className="table table--compact">
                    <tbody>
                      {Object.entries(countUserData(dataToImport!))
                        .filter(([, n]) => n > 0)
                        .map(([k, n]) => (
                          <tr key={k}>
                            <th scope="row">{USER_DATA_LABELS[k as keyof UserData]}</th>
                            <td className="num">{n}件</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {preview.warnings.map((w) => (
                    <p key={w} className="notice notice--warn">
                      {w}
                    </p>
                  ))}
                  {(preview.danglingVisitIds.length > 0 || preview.danglingMarkShopIds.length > 0) && (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={includeDangling}
                        onChange={(e) => setIncludeDangling(e.target.checked)}
                      />
                      店舗が見つからない記録も読み込む
                    </label>
                  )}
                  <fieldset className="filter-group">
                    <legend>読み込み方</legend>
                    <label className="check">
                      <input
                        type="radio"
                        name={`${id}-mode`}
                        checked={mode === 'merge'}
                        onChange={() => setMode('merge')}
                      />
                      統合する（同じIDのデータは読み込んだ内容で上書きし、それ以外は残す）
                    </label>
                    <label className="check">
                      <input
                        type="radio"
                        name={`${id}-mode`}
                        checked={mode === 'replace'}
                        onChange={() => setMode('replace')}
                      />
                      置き換える（今ブラウザにある自分のデータをすべて削除してから読み込む）
                    </label>
                  </fieldset>
                  {!confirming ? (
                    <button type="button" className="btn btn--primary" onClick={() => setConfirming(true)}>
                      読み込む…
                    </button>
                  ) : (
                    <div className="notice notice--warn" role="alertdialog" aria-label="読み込みの確認">
                      <p>
                        {mode === 'replace'
                          ? '今ブラウザにある自分のデータ（追加・編集した店舗、個人記録など）をすべて削除し、このファイルの内容に置き換えます。'
                          : '同じIDのデータは、このファイルの内容で上書きされます。'}
                        よろしいですか？
                      </p>
                      <div className="form-row form-row--inline">
                        <button
                          type="button"
                          className={`btn ${mode === 'replace' ? 'btn--danger-solid' : 'btn--primary'}`}
                          onClick={runImport}
                          disabled={importing}
                        >
                          {importing ? '読み込み中…' : mode === 'replace' ? '置き換えて読み込む' : '統合して読み込む'}
                        </button>
                        <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={importing}>
                          やめる
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {importResult && (
            <p
              className={`notice ${importResult.ok ? '' : 'notice--danger'}`}
              role={importResult.ok ? 'status' : 'alert'}
            >
              {importResult.message}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
