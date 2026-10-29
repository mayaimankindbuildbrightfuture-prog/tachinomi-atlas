/**
 * ブラウザでのファイル入出力（JSON の保存・読み込み）。
 * データは外部に送信せず、利用者のPCに保存する。
 */
import { MAX_IMPORT_BYTES } from '../../domain/backup';

/** JSON をファイルとして保存させる（ブラウザのダウンロード） */
export function downloadJson(fileName: string, data: unknown): void {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // ダウンロード開始後に解放する
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 選択されたファイルを文字列として読む。大きすぎるファイルは読まずに拒否する */
export async function readTextFile(file: File): Promise<string> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error(`ファイルが大きすぎます（上限 ${MAX_IMPORT_BYTES / 1024 / 1024}MB）。`);
  }
  return file.text();
}
