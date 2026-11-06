import { expect, test } from '@playwright/test';

/**
 * 実際の地図サービス（OpenFreeMap）に接続するテスト。
 * ネットワーク環境に依存するため、E2E_EXTERNAL=1 を指定したときだけ実行する。
 */
test.skip(!process.env.E2E_EXTERNAL, 'E2E_EXTERNAL=1 のときのみ実行');

test('OpenFreeMap の地図と3D建物が表示される', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('地図表示中')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap');
  await page.getByRole('tab', { name: '地図の表示' }).click();
  // 3D建物が利用可能（チェックボックスが有効）
  await expect(page.getByRole('checkbox', { name: '3D建物' })).toBeEnabled();
  await page.getByRole('button', { name: '3D表示（傾ける）' }).click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/external-3d.png' });
});
