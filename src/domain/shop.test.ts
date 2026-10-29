import { makeShop, testSource } from '../tests/fixtures';
import {
  createEmptyShop,
  findPossibleDuplicates,
  isHttpUrl,
  normalizeName,
  primaryCategory,
  validateCoordinates,
  validateDataSource,
  validateShop,
} from './shop';

describe('validateShop', () => {
  it('妥当な店舗はエラーなし', () => {
    expect(validateShop(makeShop())).toEqual({ errors: [], warnings: [] });
  });

  it('店名・座標は必須', () => {
    const { errors } = validateShop(makeShop({ name: ' ', latitude: Number.NaN }));
    expect(errors.join()).toContain('店名は必須');
    expect(errors.join()).toContain('緯度');
  });

  it('オブジェクト以外を拒否する', () => {
    expect(validateShop(null).errors).toHaveLength(1);
    expect(validateShop([]).errors).toHaveLength(1);
    expect(validateShop('shop').errors).toHaveLength(1);
  });

  it('不正な値の型を拒否する', () => {
    const bad = { ...makeShop(), categories: 'yakitori', standingOnly: 'yes', priceLevel: 'cheap', status: 'open' };
    const { errors } = validateShop(bad);
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });

  it('確認済みには出典と確認日が必要', () => {
    const { errors } = validateShop(makeShop({ status: 'verified' }));
    expect(errors.join()).toContain('出典を1件以上');
    expect(errors.join()).toContain('最終確認日');
    expect(
      validateShop(makeShop({ status: 'verified', sourceIds: [testSource.id], lastVerifiedAt: '2026-10-01' })).errors,
    ).toEqual([]);
  });

  it('javascript: など http(s) 以外の URL を拒否する', () => {
    expect(validateShop(makeShop({ officialUrl: 'javascript:alert(1)' })).errors.join()).toContain('公式サイトURL');
    expect(isHttpUrl('https://example.com')).toBe(true);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
  });

  it('価格例を検証し、確認日の無い価格には警告を出す', () => {
    const shop = makeShop({
      priceExamples: [
        { itemName: 'ホッピーセット', priceYen: 500, checkedAt: null, sourceId: null },
        { itemName: '', priceYen: -1, checkedAt: '10/1', sourceId: null },
      ],
    });
    const { errors, warnings } = validateShop(shop);
    expect(warnings.join()).toContain('確認日がありません');
    expect(errors.join()).toContain('価格例2の品名');
    expect(errors.join()).toContain('0以上の整数');
    expect(errors.join()).toContain('YYYY-MM-DD');
  });

  it('営業時間の曜日重複・時刻形式・営業日の時刻欠落を検出する', () => {
    const shop = makeShop({
      openingHours: [
        { dayOfWeek: 1, opensAt: '17:00', closesAt: '23:00', isClosed: false },
        { dayOfWeek: 1, opensAt: '5pm', closesAt: null, isClosed: false },
        { dayOfWeek: 7, opensAt: null, closesAt: null, isClosed: true },
      ],
    });
    const msg = validateShop(shop).errors.join();
    expect(msg).toContain('重複');
    expect(msg).toContain('HH:MM');
    expect(msg).toContain('開店・閉店時刻');
    expect(msg).toContain('曜日が不正');
  });
});

describe('validateCoordinates', () => {
  it('緯度経度の入れ違いをエラーにする', () => {
    expect(validateCoordinates(139.7, 35.7).errors.join()).toContain('逆');
  });

  it('値域外はエラー、対象地域外は警告', () => {
    expect(validateCoordinates(95, 139).errors.join()).toContain('緯度は');
    expect(validateCoordinates(35.7, 200).errors.join()).toContain('経度は');
    expect(validateCoordinates(35.7, 39.7).warnings.join()).toContain('範囲外');
    expect(validateCoordinates(35.7, 139.7)).toEqual({ errors: [], warnings: [] });
  });
});

describe('重複判定', () => {
  it('表記ゆれを吸収する', () => {
    expect(normalizeName('ＡＢＣ 酒場')).toBe(normalizeName('abc酒場'));
  });

  it('同名かつ近距離の店舗を重複候補とし、自分自身は除外する', () => {
    const a = makeShop();
    const near = makeShop({ id: 'other', name: '架空酒場 テストA', latitude: 35.7005 });
    const far = makeShop({ id: 'far', latitude: 35.75 });
    expect(findPossibleDuplicates(near, [a, far]).map((s) => s.id)).toEqual(['test-shop-a']);
    expect(findPossibleDuplicates(a, [a])).toEqual([]);
  });
});

describe('その他', () => {
  it('代表ジャンルは先頭の既知ジャンル、無ければその他', () => {
    expect(primaryCategory({ categories: ['unknown', 'oden'] })).toBe('oden');
    expect(primaryCategory({ categories: [] })).toBe('other');
  });

  it('新規店舗は未確認・不明値で初期化される', () => {
    const s = createEmptyShop('2026-10-29T00:00:00.000Z');
    expect(s.status).toBe('unverified');
    expect(s.priceLevel).toBe('unknown');
    expect(s.standingOnly).toBeNull();
    expect(s.id).toMatch(/^shop-/);
  });

  it('出典の検証', () => {
    expect(validateDataSource(testSource).errors).toEqual([]);
    expect(validateDataSource({ ...testSource, name: '', url: 'notaurl' }).errors).toHaveLength(2);
  });
});
