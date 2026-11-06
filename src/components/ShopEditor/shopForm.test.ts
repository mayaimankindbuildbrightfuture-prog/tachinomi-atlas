import { makeShop, testSource } from '../../tests/fixtures';
import { createEmptyShop } from '../../domain/shop';
import { formToShop, shopToForm } from './shopForm';

const NOW = '2026-10-29T00:00:00.000Z';

describe('shopForm', () => {
  it('Shop → フォーム → Shop で内容が保たれる', () => {
    const shop = makeShop({
      address: '架空町1-1',
      priceExamples: [{ itemName: 'ホッピーセット', priceYen: 500, checkedAt: '2026-10-01', sourceId: testSource.id }],
      openingHours: [
        { dayOfWeek: 0, opensAt: null, closesAt: null, isClosed: true, note: '祝日も休み' },
        { dayOfWeek: 1, opensAt: '16:00', closesAt: '23:00', isClosed: false },
      ],
      sourceIds: [testSource.id],
      notes: 'メモ',
    });
    const { shop: back, errors } = formToShop(shopToForm(shop), shop, NOW, []);
    expect(errors).toEqual([]);
    expect(back).toEqual({ ...shop, updatedAt: NOW });
  });

  it('新規作成：座標未入力はエラー、全角数字や「円」も受け付ける', () => {
    const base = createEmptyShop(NOW);
    const form = shopToForm(base);
    expect(formToShop({ ...form, name: '架空' }, base, NOW, []).errors.join()).toContain('緯度・経度は必須');
    const ok = formToShop(
      {
        ...form,
        name: '架空',
        latitude: '３５.７',
        longitude: '139.7',
        priceExamples: [{ itemName: 'ビール', priceYen: '1,200円', checkedAt: '', sourceId: '' }],
      },
      base,
      NOW,
      [],
    );
    expect(ok.errors).toEqual([]);
    expect(ok.shop.latitude).toBe(35.7);
    expect(ok.shop.priceExamples[0]!.priceYen).toBe(1200);
    expect(ok.warnings.join()).toContain('確認日がありません');
  });

  it('数値でない座標はエラー', () => {
    const base = createEmptyShop(NOW);
    const r = formToShop({ ...shopToForm(base), name: 'x', latitude: 'abc', longitude: '139' }, base, NOW, []);
    expect(r.errors).toEqual(['緯度・経度は数値で入力してください。']);
  });

  it('未確認の曜日は保存しない（備考がある場合のみ未確認として残す）', () => {
    const base = createEmptyShop(NOW);
    const form = { ...shopToForm(base), name: 'x', latitude: '35.7', longitude: '139.7' };
    form.hours = form.hours.map((h, d) => (d === 2 ? { ...h, note: '不定休' } : h));
    expect(formToShop(form, base, NOW, []).shop.openingHours).toEqual([
      { dayOfWeek: 2, opensAt: null, closesAt: null, isClosed: null, note: '不定休' },
    ]);
  });

  it('重複候補を返す', () => {
    const existing = makeShop({ id: 'existing' });
    const base = createEmptyShop(NOW);
    const r = formToShop(
      { ...shopToForm(base), name: existing.name, latitude: '35.7001', longitude: '139.7' },
      base,
      NOW,
      [existing],
    );
    expect(r.duplicates.map((s) => s.id)).toEqual(['existing']);
  });
});
