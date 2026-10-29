/**
 * 営業時間の判定。登録された営業時間から判定できる範囲だけを扱い、
 * 判定できない場合は必ず 'unknown' を返す（営業中と断定しない）。
 */
import { DAY_LABELS, type OpeningHours, isValidTime } from './shop';

export type OpenState = 'open' | 'closed' | 'unknown';

const DAY_MINUTES = 24 * 60;

export function parseMinutes(time: string | null): number | null {
  if (time === null || !isValidTime(time)) return null;
  const [h, m] = time.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** 営業区間（分）。閉店が開店以前なら翌日にまたがるとみなす */
function interval(entry: OpeningHours | undefined): [number, number] | null {
  if (!entry || entry.isClosed !== false) return null;
  const o = parseMinutes(entry.opensAt);
  let c = parseMinutes(entry.closesAt);
  if (o === null || c === null) return null;
  if (c <= o) c += DAY_MINUTES;
  return [o, c];
}

/** その曜日の営業情報が確定しているか（営業時間が入っている、または定休日と分かっている） */
function isKnown(entry: OpeningHours | undefined): boolean {
  if (!entry) return false;
  if (entry.isClosed === true) return true;
  return interval(entry) !== null;
}

export function entryForDay(hours: readonly OpeningHours[], day: number): OpeningHours | undefined {
  return hours.find((h) => h.dayOfWeek === day);
}

/**
 * 指定曜日・時刻（0:00 からの分）に、登録営業時間上で営業しているか。
 * 前日からの深夜営業も考慮する。
 */
export function openStateAt(hours: readonly OpeningHours[], day: number, minutes: number): OpenState {
  const today = entryForDay(hours, day);
  const prevDay = (day + 6) % 7;
  const yesterday = entryForDay(hours, prevDay);

  const t = interval(today);
  if (t && minutes >= t[0] && minutes < t[1]) return 'open';
  const y = interval(yesterday);
  if (y && y[1] > DAY_MINUTES && minutes < y[1] - DAY_MINUTES) return 'open';

  if (isKnown(today) && isKnown(yesterday)) return 'closed';
  // 当日の営業開始前で前日分が不明なケースなどは判定できない
  if (isKnown(today) && t && minutes >= t[0]) return 'closed';
  return 'unknown';
}

/** 指定曜日に営業日として登録されているか（時刻は問わない） */
export function openStateOnDay(hours: readonly OpeningHours[], day: number): OpenState {
  const entry = entryForDay(hours, day);
  if (!entry || entry.isClosed === null) return 'unknown';
  return entry.isClosed ? 'closed' : 'open';
}

export type TokyoNow = { day: number; minutes: number };

/** PC のタイムゾーン設定に関わらず日本時間の曜日・時刻を得る */
export function tokyoNow(date: Date = new Date()): TokyoNow {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

export function formatHoursEntry(entry: OpeningHours | undefined): string {
  if (!entry || entry.isClosed === null) return '未確認';
  if (entry.isClosed) return '定休日';
  if (!entry.opensAt || !entry.closesAt) return '未確認';
  return `${entry.opensAt}〜${entry.closesAt}`;
}

export function formatDay(day: number): string {
  return DAY_LABELS[day] ?? '?';
}
