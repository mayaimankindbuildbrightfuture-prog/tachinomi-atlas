import { useEffect, useId, useRef, type ReactNode } from 'react';

type Props = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** 確認ダイアログ。Esc キーでキャンセル、開いたときはキャンセルボタンにフォーカスする */
export function ConfirmDialog({ title, children, confirmLabel, danger, busy, onConfirm, onCancel }: Props) {
  const id = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`}>{title}</h2>
        <div className="modal__body">{children}</div>
        <div className="modal__buttons">
          <button
            type="button"
            className={`btn ${danger ? 'btn--danger-solid' : 'btn--primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '処理中…' : confirmLabel}
          </button>
          <button type="button" className="btn" onClick={onCancel} ref={cancelRef}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
