/** 表示用の書式（通貨は日本円、日時は日本時間） */

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' });

export function formatYen(value: number | null): string {
  return value === null ? '未確認' : yen.format(value);
}

/** "YYYY-MM-DD" または ISO 日時を日本時間の日付で表示する */
export function formatDate(value: string | null): string {
  if (!value) return '未確認';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replace(/-/g, '/');
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function formatDateTime(value: string | null): string {
  if (!value) return '未確認';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** 今日の日付（日本時間）を YYYY-MM-DD で返す */
export function todayJst(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(date);
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function formatTriState(value: boolean | null, yes: string, no: string): string {
  if (value === null) return '未確認';
  return value ? yes : no;
}
