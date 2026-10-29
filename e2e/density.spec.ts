import { expect, test, type Page } from '@playwright/test';
import { readZoom, serveFixtureStyle } from './fixtures';

async function clickMapCenter(page: Page) {
  const box = await page.getByTestId('map-container').boundingBox();
  if (!box) throw new Error('地図の領域が取得できません');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

test.describe('密度・比較（外部通信なし）', () => {
  test('表示モードを切り替えても地図が動作し、凡例が切り替わる', async ({ page }) => {
    const errors = collectErrors(page);
    await serveFixtureStyle(page);
    await page.goto('/');
    await expect(page.getByText('地図表示中')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: '地図の表示' }).click();
    const legend = page.getByRole('region', { name: '凡例' });
    for (const [mode, title] of [
      ['密度（ヒートマップ）', '凡例：密度（ヒートマップ）'],
      ['密度（3D柱）', '凡例：密度（3D柱）'],
      ['ジャンル別の分布', '凡例：ジャンル別の分布'],
      ['予算帯別の分布', '凡例：予算帯別の分布'],
      ['店舗マーカー', '凡例：店舗マーカー'],
    ] as const) {
      await page.getByRole('radio', { name: mode }).check();
      await expect(legend).toContainText(title);
      await page.waitForTimeout(300);
    }
    await page.getByRole('checkbox', { name: /^駅（\d+駅）$/ }).check();
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });

  test('3D柱のマスをクリックすると件数を表示し、分布表示の点から店舗を選べる', async ({ page }) => {
    const errors = collectErrors(page);
    await serveFixtureStyle(page);
    await page.goto('/');
    await expect(page.getByText('地図表示中')).toBeVisible({ timeout: 20_000 });

    // 店舗へ移動（店舗が地図の中央に来る）してから詳細を閉じる
    await page.getByRole('button', { name: /晩杯屋 吉祥寺店/ }).click();
    await expect.poll(() => readZoom(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(15.9);
    await page.getByRole('button', { name: '詳細パネルを閉じる' }).click();
    await page.waitForTimeout(800);

    await page.getByRole('tab', { name: '地図の表示' }).click();
    await page.getByRole('button', { name: '2D表示（真上から）' }).click();
    await page.waitForTimeout(1200);

    await page.getByRole('radio', { name: '密度（3D柱）' }).check();
    await page.waitForTimeout(800);
    await clickMapCenter(page);
    await expect(page.locator('.maplibregl-popup-content')).toContainText('このマス（約500m四方）の登録店舗：1件');
    await expect(page.locator('.maplibregl-popup-content')).toContainText('網羅的な調査ではありません');

    await page.getByRole('radio', { name: 'ジャンル別の分布' }).check();
    await page.waitForTimeout(800);
    await clickMapCenter(page);
    await expect(page.getByRole('complementary', { name: '店舗の詳細' })).toContainText('立呑み晩杯屋 吉祥寺店');
    expect(errors).toEqual([]);
  });

  test('比較タブで駅から店舗を探し、調査済みエリアを登録すると凡例に反映される', async ({ page }) => {
    await serveFixtureStyle(page);
    await page.goto('/');
    await expect(page.getByText('地図表示中')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('tab', { name: '比較・集計' }).click();
    await expect(page.getByRole('cell', { name: /台東区/ })).toBeVisible();
    const ranking = page.getByRole('list', { name: '駅周辺の店舗数' });
    await ranking.getByRole('button').first().click();
    await expect(page.getByRole('button', { name: /駅から500m以内 ✕/ })).toBeVisible();

    await page.getByRole('tab', { name: '比較・集計' }).click();
    await page.getByRole('button', { name: '＋ 調査済みエリアを追加' }).click();
    const form = page.getByRole('group', { name: '調査済みエリアの追加' });
    await form.getByLabel('中心にする駅を駅名で絞り込み').fill('吉祥寺');
    await form
      .getByLabel('中心にする駅', { exact: true })
      .selectOption({ label: '吉祥寺（京王電鉄 井の頭線・東日本旅客鉄道 中央線）' });
    await form.getByRole('button', { name: 'エリアを保存' }).click();
    await expect(page.getByRole('button', { name: '吉祥寺駅周辺' })).toBeVisible();

    await page.getByRole('tab', { name: '地図の表示' }).click();
    await page.getByRole('radio', { name: '密度（3D柱）' }).check();
    await expect(page.getByRole('region', { name: '凡例' })).toContainText('緑の破線は調査済みエリア（1件）');

    // 再読み込み後も残る
    await page.reload();
    await page.getByRole('tab', { name: '比較・集計' }).click();
    await expect(page.getByRole('button', { name: '吉祥寺駅周辺' })).toBeVisible({ timeout: 20_000 });
  });
});
