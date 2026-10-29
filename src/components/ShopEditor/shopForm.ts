/**
 * 店舗編集フォームの入力状態と Shop の相互変換。
 * 入力欄は文字列で保持し、保存時に型変換・検証する。
 */
import {
  findPossibleDuplicates,
  validateShop,
  type DataSource,
  type OpeningHours,
  type Prefecture,
  type PriceLevel,
  type Shop,
  type ShopStatus,
} from '../../domain/shop';

export type TriStateInput = 'unknown' | 'yes' | 'no';
export type DayStateInput = 'unknown' | 'open' | 'closed';

export type PriceRow = { itemName: string; priceYen: string; checkedAt: string; sourceId: string };
export type HoursRow = { state: DayStateInput; opensAt: string; closesAt: string; note: string };

export type ShopFormState = {
  name: string;
  latitude: string;
  longitude: string;
  address: string;
  prefecture: Prefecture | '';
  municipality: string;
  stationIds: string[];
  categories: string[];
  drinkTags: string[];
  standingOnly: TriStateInput;
  hasSeating: TriStateInput;
  priceLevel: PriceLevel;
  priceExamples: PriceRow[];
  /** index = 曜日（0=日〜6=土） */
  hours: HoursRow[];
  officialUrl: string;
  status: ShopStatus;
  sourceIds: string[];
  lastVerifiedAt: string;
  notes: string;
};

const toTri = (v: boolean | null): TriStateInput => (v === null ? 'unknown' : v ? 'yes' : 'no');
const fromTri = (v: TriStateInput): boolean | null => (v === 'unknown' ? null : v === 'yes');
const blankToNull = (v: string): string | null => (v.trim() === '' ? null : v.trim());

function formatCoord(v: number): string {
  return Number.isFinite(v) ? String(v) : '';
}

export function shopToForm(shop: Shop): ShopFormState {
  const hours: HoursRow[] = Array.from({ length: 7 }, (_, day) => {
    const e = shop.openingHours.find((h) => h.dayOfWeek === day);
    if (!e || e.isClosed === null)
      return { state: 'unknown', opensAt: e?.opensAt ?? '', closesAt: e?.closesAt ?? '', note: e?.note ?? '' };
    return {
      state: e.isClosed ? 'closed' : 'open',
      opensAt: e.opensAt ?? '',
      closesAt: e.closesAt ?? '',
      note: e.note ?? '',
    };
  });
  return {
    name: shop.name,
    latitude: formatCoord(shop.latitude),
    longitude: formatCoord(shop.longitude),
    address: shop.address ?? '',
    prefecture: shop.prefecture ?? '',
    municipality: shop.municipality ?? '',
    stationIds: [...shop.stationIds],
    categories: [...shop.categories],
    drinkTags: [...shop.drinkTags],
    standingOnly: toTri(shop.standingOnly),
    hasSeating: toTri(shop.hasSeating),
    priceLevel: shop.priceLevel,
    priceExamples: shop.priceExamples.map((p) => ({
      itemName: p.itemName,
      priceYen: p.priceYen === null ? '' : String(p.priceYen),
      checkedAt: p.checkedAt ?? '',
      sourceId: p.sourceId ?? '',
    })),
    hours,
    officialUrl: shop.officialUrl ?? '',
    status: shop.status,
    sourceIds: [...shop.sourceIds],
    lastVerifiedAt: shop.lastVerifiedAt ?? '',
    notes: shop.notes ?? '',
  };
}

function parseNumber(v: string): number {
  const t = v.trim().normalize('NFKC');
  return t === '' ? Number.NaN : Number(t);
}

export type FormResult = {
  shop: Shop;
  errors: string[];
  warnings: string[];
  duplicates: Shop[];
};

/** フォーム入力を Shop に変換し、検証結果と重複候補を返す */
export function formToShop(form: ShopFormState, base: Shop, now: string, existing: readonly Shop[]): FormResult {
  const errors: string[] = [];
  const latitude = parseNumber(form.latitude);
  const longitude = parseNumber(form.longitude);
  if (form.latitude.trim() === '' || form.longitude.trim() === '')
    errors.push('緯度・経度は必須です（地図をクリックして選ぶこともできます）。');
  else if (Number.isNaN(latitude) || Number.isNaN(longitude)) errors.push('緯度・経度は数値で入力してください。');

  const priceExamples = form.priceExamples
    .filter((p) => p.itemName.trim() !== '' || p.priceYen.trim() !== '')
    .map((p) => {
      const price = p.priceYen.trim() === '' ? null : parseNumber(p.priceYen.replace(/[,円¥]/g, ''));
      return {
        itemName: p.itemName.trim(),
        priceYen: price,
        checkedAt: blankToNull(p.checkedAt),
        sourceId: blankToNull(p.sourceId),
      };
    });

  const openingHours: OpeningHours[] = [];
  form.hours.forEach((h, day) => {
    const note = h.note.trim();
    if (h.state === 'unknown') {
      if (note) openingHours.push({ dayOfWeek: day, opensAt: null, closesAt: null, isClosed: null, note });
      return;
    }
    const entry: OpeningHours = {
      dayOfWeek: day,
      opensAt: h.state === 'open' ? blankToNull(h.opensAt) : null,
      closesAt: h.state === 'open' ? blankToNull(h.closesAt) : null,
      isClosed: h.state === 'closed',
    };
    if (note) entry.note = note;
    openingHours.push(entry);
  });

  const shop: Shop = {
    ...base,
    name: form.name.trim(),
    latitude,
    longitude,
    address: blankToNull(form.address),
    prefecture: form.prefecture === '' ? null : form.prefecture,
    municipality: blankToNull(form.municipality),
    stationIds: [...form.stationIds],
    categories: [...form.categories],
    drinkTags: [...new Set(form.drinkTags.map((d) => d.trim()).filter(Boolean))],
    standingOnly: fromTri(form.standingOnly),
    hasSeating: fromTri(form.hasSeating),
    priceLevel: form.priceLevel,
    priceExamples,
    openingHours,
    officialUrl: blankToNull(form.officialUrl),
    status: form.status,
    sourceIds: [...form.sourceIds],
    lastVerifiedAt: blankToNull(form.lastVerifiedAt),
    updatedAt: now,
  };
  const notes = form.notes.trim();
  if (notes) shop.notes = notes;
  else delete shop.notes;

  const validation = validateShop(shop);
  // 緯度経度の必須エラーはフォーム側の文言を優先する
  const allErrors = [...errors, ...validation.errors.filter((e) => !(errors.length && /緯度|経度/.test(e)))];
  const duplicates = allErrors.length === 0 ? findPossibleDuplicates(shop, existing) : [];
  return { shop, errors: [...new Set(allErrors)], warnings: validation.warnings, duplicates };
}

export function emptyPriceRow(): PriceRow {
  return { itemName: '', priceYen: '', checkedAt: '', sourceId: '' };
}

export type NewSourceInput = Omit<DataSource, 'id'>;
