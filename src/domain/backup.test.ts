import { makeShop, makeVisit, testSource } from '../tests/fixtures';
import {
  BACKUP_FORMAT,
  EMPTY_USER_DATA,
  backupFileName,
  buildBackup,
  describeBackup,
  parseBackup,
  withoutDangling,
  type UserData,
} from './backup';

const user: UserData = {
  ...EMPTY_USER_DATA,
  shops: [makeShop({ id: 'u1' })],
  deletedShopIds: ['seed-x'],
  sources: [testSource],
  visits: [makeVisit({ shopId: 'u1' })],
  marks: [{ shopId: 'u1', favorite: true, wantToGo: false, revisit: false, updatedAt: '2026-10-29T00:00:00.000Z' }],
};
const NOW = '2026-10-29T12:34:00.000Z';
const known = new Set(['u1', 'seed-1']);

describe('buildBackup', () => {
  it('種類ごとに含める内容を変える', () => {
    const all = [makeShop({ id: 'seed-1' }), makeShop({ id: 'u1' })];
    expect(Object.keys(buildBackup('full', user, all, [testSource], NOW).data).sort()).toEqual(
      ['deletedShopIds', 'marks', 'routes', 'shops', 'sources', 'surveyAreas', 'visits'].sort(),
    );
    const shops = buildBackup('shops', user, all, [testSource], NOW);
    expect(shops.data.shops).toHaveLength(2);
    expect(shops.data.visits).toBeUndefined();
    const personal = buildBackup('personal', user, all, [testSource], NOW);
    expect(Object.keys(personal.data).sort()).toEqual(['marks', 'routes', 'surveyAreas', 'visits']);
    expect(describeBackup(personal).map((d) => `${d.label}${d.count}`)).toEqual([
      '訪問記録1',
      'お気に入り等1',
      '調査済みエリア0',
      'はしご酒ルート0',
    ]);
  });

  it('ファイル名に種類と日時を含める', () => {
    expect(backupFileName('full', NOW)).toBe('tachinomi-atlas-backup-202610291234.json');
  });
});

describe('parseBackup', () => {
  const file = (patch: Record<string, unknown> = {}, data: Partial<UserData> = user) =>
    JSON.stringify({ format: BACKUP_FORMAT, version: 1, kind: 'full', exportedAt: NOW, data, ...patch });

  it('書き出した内容をそのまま読み込める', () => {
    const text = JSON.stringify(buildBackup('full', user, [], [], NOW));
    const p = parseBackup(text, known);
    expect(p.errors).toEqual([]);
    expect(p.warnings).toEqual([]);
    expect(p.data).toEqual(user);
  });

  it('JSONでない・形式違い・バージョン違いを拒否する', () => {
    expect(parseBackup('{', known).errors.join()).toContain('JSON として読み込めません');
    expect(parseBackup('[]', known).errors.join()).toContain('形式ではありません');
    expect(parseBackup(file({ format: 'other' }), known).errors.join()).toContain('format');
    expect(parseBackup(file({ version: 2 }), known).errors.join()).toContain('バージョン 2');
  });

  it('不正な値・重複IDを拒否する（データは返すが errors があれば保存しない）', () => {
    const bad = parseBackup(
      file({}, { ...user, visits: [makeVisit({ rating: 9 }), makeVisit({ id: 'dup' }), makeVisit({ id: 'dup' })] }),
      known,
    );
    expect(bad.errors.join()).toContain('訪問記録 1件目');
    expect(bad.errors.join()).toContain('IDが重複');
    expect(parseBackup(file({}, { shops: 'x' as never }), known).errors.join()).toContain('配列ではありません');
  });

  it('スクリプトを含む文字列もデータとして扱うだけ（実行しない）', () => {
    const p = parseBackup(
      file({}, { visits: [makeVisit({ shopId: 'u1', memo: '<script>alert(1)</script>' })] }),
      known,
    );
    expect(p.errors).toEqual([]);
    expect(p.data.visits[0]!.memo).toBe('<script>alert(1)</script>');
  });

  it('参照先の店舗が無い記録を報告し、除外も選べる', () => {
    const p = parseBackup(
      file(
        {},
        {
          visits: [makeVisit({ id: 'ok', shopId: 'u1' }), makeVisit({ id: 'orphan', shopId: 'gone' })],
          marks: [{ shopId: 'gone', favorite: true, wantToGo: false, revisit: false, updatedAt: NOW }],
        },
      ),
      known,
    );
    expect(p.danglingVisitIds).toEqual(['orphan']);
    expect(p.danglingMarkShopIds).toEqual(['gone']);
    expect(p.warnings).toHaveLength(2);
    const filtered = withoutDangling(p);
    expect(filtered.visits.map((v) => v.id)).toEqual(['ok']);
    expect(filtered.marks).toEqual([]);
  });

  it('同じファイル内の店舗を参照する記録は参照切れにしない', () => {
    const p = parseBackup(
      file({}, { shops: [makeShop({ id: 'new' })], visits: [makeVisit({ shopId: 'new' })] }),
      new Set(),
    );
    expect(p.danglingVisitIds).toEqual([]);
  });

  it('大きすぎるファイルを拒否する', () => {
    const huge = 'x'.repeat(20 * 1024 * 1024 + 1);
    expect(parseBackup(huge, known).errors.join()).toContain('大きすぎます');
  });

  it('空のデータは警告する', () => {
    expect(parseBackup(file({}, {}), known).warnings.join()).toContain('読み込むデータがありません');
  });
});
