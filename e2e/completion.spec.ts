import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { readPitch, serveFixtureStyle } from './fixtures';

/**
 * 仕様書 19章「完成の定義」の一連の操作を、1つの流れとして確認する（外部通信なし）。
 */
test('完成の定義：起動から記録・密度・はしご酒・バックアップ・再起動後の確認まで', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 1. アプリを起動する
  await serveFixtureStyle(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '立ち呑み地形図' })).toBeVisible();

  // 2. 埼玉県・東京都の地図を3Dで眺める
  await expect(page.getByText('地図表示中')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => readPitch(page)).toBeGreaterThan(30);

  // 3. 店舗を検索して地図上で選ぶ
  await page.getByRole('searchbox', { name: '店名・住所で検索' }).fill('晩杯屋');
  await expect(page.getByTestId('result-count')).toHaveText('1');
  await page.getByRole('button', { name: /晩杯屋 吉祥寺店/ }).click();
  const detail = page.getByRole('complementary', { name: '店舗の詳細' });

  // 4. 価格やジャンルなどの情報を確認する
  await expect(detail).toContainText('料理ジャンル');
  await expect(detail).toContainText('価格例');
  await expect(detail).toContainText('13:00〜22:30');
  await expect(detail).toContainText('晩杯屋 公式サイト');

  // 5. 訪問した店を記録する
  await detail.getByRole('button', { name: '＋ 訪問記録を追加' }).click();
  const visit = page.getByRole('dialog', { name: '訪問記録を追加' });
  await visit.getByLabel(/訪問日時/).fill('2026-10-28T19:30');
  await visit.getByLabel(/感想・メモ/).fill('完成確認の記録');
  await visit.getByRole('button', { name: '保存' }).click();
  await expect(detail.getByText('訪問記録（1件）')).toBeVisible();
  await page.getByRole('searchbox', { name: '店名・住所で検索' }).fill('');

  // 6. 酒場密度を切り替えて街の違いを眺める
  await page.getByRole('tab', { name: '地図の表示' }).click();
  await page.getByRole('radio', { name: '密度（3D柱）' }).check();
  await expect(page.getByRole('region', { name: '凡例' })).toContainText('凡例：密度（3D柱）');
  await page.getByRole('tab', { name: '比較・集計' }).click();
  await expect(page.getByRole('cell', { name: /台東区/ })).toBeVisible();

  // 7. 複数店舗を選んではしご酒の計画を作る
  for (const name of [/立飲み たきおか/, /立呑み さいごう/]) {
    await page.getByRole('tab', { name: '店舗を探す' }).click();
    await page.getByRole('button', { name }).click();
    await page
      .getByRole('complementary', { name: '店舗の詳細' })
      .getByRole('button', { name: '＋ はしご酒に追加' })
      .click();
  }
  await page.getByRole('tab', { name: 'はしご酒' }).click();
  await page.getByLabel('ルート名').fill('上野で2軒');
  await expect(page.getByRole('list', { name: '行程' }).getByRole('group', { name: /軒目/ })).toHaveCount(2);

  // 8. 自分のデータをバックアップする
  await page.getByRole('button', { name: 'データ管理', exact: true }).click();
  const manager = page.getByRole('dialog', { name: 'データ管理' });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    manager.getByRole('button', { name: '全データのバックアップを書き出す' }).click(),
  ]);
  const saved = join(mkdtempSync(join(tmpdir(), 'tachinomi-e2e-')), 'backup.json');
  await download.saveAs(saved);
  const { readFileSync } = await import('node:fs');
  const backup = JSON.parse(readFileSync(saved, 'utf8'));
  expect(backup.data.visits).toHaveLength(1);
  expect(backup.data.routes).toHaveLength(1);
  await manager.getByRole('button', { name: 'データ管理を閉じる' }).click();

  // 9. 次回起動時にも記録が残っていることを確認する
  await page.reload();
  await page.getByRole('tab', { name: '記録' }).click();
  await expect(page.getByRole('list', { name: '訪問履歴' })).toContainText('立呑み晩杯屋 吉祥寺店', {
    timeout: 20_000,
  });
  await page.getByRole('tab', { name: 'はしご酒' }).click();
  await expect(page.getByLabel('ルート')).toContainText('上野で2軒（2軒）');

  expect(errors).toEqual([]);
});
