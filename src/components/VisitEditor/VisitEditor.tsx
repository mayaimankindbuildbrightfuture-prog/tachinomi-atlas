import { useEffect, useId, useRef, useState } from 'react';
import { createId } from '../../domain/shop';
import {
  ATMOSPHERE_SUGGESTIONS,
  RATING_MAX,
  RATING_MIN,
  fromDateTimeLocal,
  linesToList,
  toDateTimeLocal,
  toJstIso,
  validateVisit,
  type Visit,
} from '../../domain/visit';

type Props = {
  shopId: string;
  shopName: string;
  /** 編集する記録。新規なら null */
  visit: Visit | null;
  onSave: (visit: Visit) => Promise<void>;
  onCancel: () => void;
};

const RATINGS = Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, i) => RATING_MIN + i);

/** 訪問記録の追加・編集（仕様書 7.1）。感想などの入力はすべて任意 */
export function VisitEditor({ shopId, shopName, visit, onSave, onCancel }: Props) {
  const id = useId();
  const firstRef = useRef<HTMLInputElement>(null);
  const [visitedAt, setVisitedAt] = useState(() =>
    visit ? toDateTimeLocal(visit.visitedAt) : toDateTimeLocal(toJstIso(new Date())),
  );
  const [items, setItems] = useState(visit?.orderedItems.join('\n') ?? '');
  const [amount, setAmount] = useState(visit?.amountYen === null || !visit ? '' : String(visit.amountYen));
  const [rating, setRating] = useState<number | null>(visit?.rating ?? null);
  const [tags, setTags] = useState<string[]>(visit?.atmosphereTags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [memo, setMemo] = useState(visit?.memo ?? '');
  const [photos, setPhotos] = useState(visit?.photoRefs.join('\n') ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const toggleTag = (t: string) => setTags((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));
  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString();
    const iso = fromDateTimeLocal(visitedAt);
    const amountText = amount
      .trim()
      .normalize('NFKC')
      .replace(/[,円¥]/g, '');
    const record: Visit = {
      id: visit?.id ?? createId('visit'),
      shopId,
      visitedAt: iso ?? '',
      orderedItems: linesToList(items),
      amountYen: amountText === '' ? null : Number(amountText),
      rating,
      atmosphereTags: tags,
      memo: memo.trim(),
      photoRefs: linesToList(photos),
      createdAt: visit?.createdAt ?? now,
      updatedAt: now,
      shopNameAtVisit: visit?.shopNameAtVisit ?? shopName,
    };
    const result = validateVisit(record);
    if (!iso) result.errors.unshift('訪問日時を入力してください。');
    setErrors([...new Set(result.errors)]);
    if (result.errors.length) return;
    setSaving(true);
    try {
      await onSave(record);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
      setSaving(false);
    }
  };

  const tagOptions = [...new Set([...ATMOSPHERE_SUGGESTIONS, ...tags])];

  return (
    <div className="modal-backdrop">
      <form
        className="modal modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onSubmit={save}
        noValidate
      >
        <h2 id={`${id}-title`}>{visit ? '訪問記録を編集' : '訪問記録を追加'}</h2>
        <p className="hint">
          {shopName}。日時以外はすべて任意です。記録はこのブラウザ内にのみ保存され、外部には送信されません。
        </p>

        <div className="form-row">
          <label className="form-field">
            <span className="form-field__label">
              訪問日時<span className="required">必須</span>
            </span>
            <input
              ref={firstRef}
              type="datetime-local"
              value={visitedAt}
              onChange={(e) => setVisitedAt(e.target.value)}
            />
          </label>
          <label className="form-field">
            <span className="form-field__label">
              支払った金額（円）<span className="optional">任意</span>
            </span>
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="例：1800"
            />
          </label>
        </div>

        <fieldset className="form-field rating-field">
          <legend className="form-field__label">
            評価<span className="optional">任意</span>
          </legend>
          <div className="checks">
            <label className="check">
              <input type="radio" name={`${id}-rating`} checked={rating === null} onChange={() => setRating(null)} />
              未評価
            </label>
            {RATINGS.map((r) => (
              <label key={r} className="check">
                <input type="radio" name={`${id}-rating`} checked={rating === r} onChange={() => setRating(r)} />
                {'★'.repeat(r)}
                <span className="visually-hidden">{r}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="form-field">
          <span className="form-field__label">
            注文した品（1行に1品）<span className="optional">任意</span>
          </span>
          <textarea
            rows={3}
            value={items}
            onChange={(e) => setItems(e.target.value)}
            placeholder={'例：\nホッピーセット\nもつ煮込み'}
          />
        </label>

        <div className="form-field">
          <span className="form-field__label">
            雰囲気<span className="optional">任意・複数可</span>
          </span>
          <div className="checks">
            {tagOptions.map((t) => (
              <label key={t} className="check">
                <input type="checkbox" checked={tags.includes(t)} onChange={() => toggleTag(t)} />
                {t}
              </label>
            ))}
          </div>
          <div className="form-row form-row--inline">
            <input
              aria-label="雰囲気のタグを追加"
              placeholder="その他のタグ"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
            <button type="button" className="btn" onClick={addTag}>
              追加
            </button>
          </div>
        </div>

        <label className="form-field">
          <span className="form-field__label">
            感想・メモ<span className="optional">任意</span>
          </span>
          <textarea rows={4} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>

        <label className="form-field">
          <span className="form-field__label">
            写真の参照先（1行に1件）<span className="optional">任意</span>
          </span>
          <textarea
            rows={2}
            value={photos}
            onChange={(e) => setPhotos(e.target.value)}
            placeholder="例：C:\Users\me\Pictures\2026-10-29_赤羽.jpg"
          />
          <span className="hint">ファイル名や保存場所のメモです。画像そのものは保存・アップロードされません。</span>
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

        <div className="modal__buttons">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            キャンセル
          </button>
        </div>
      </form>
    </div>
  );
}
