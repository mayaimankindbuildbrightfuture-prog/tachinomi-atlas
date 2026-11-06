import { expect, test, type Page } from '@playwright/test';
import { readZoom, serveFixtureStyle } from './fixtures';

async function openApp(page: Page) {
  await serveFixtureStyle(page);
  await page.goto('/');
  await expect(page.getByText('地図表示中')).toBeVisible({ timeout: 20_000 });
}

async function addToRoute(page: Page, name: RegExp) {
  await page.getByRole('tab', { name: '店舗を探す' }).click();
  await page.getByRole('button', { name }).click();
  await page
    .getByRole('complementary', { name: '店舗の詳細' })
    .getByRole('button', { name: '＋ はしご酒に追加' })
    .click();
}

test.describe('はしご酒プランナー（外部通信なし）', () => {
  test('ルートを作り、並べ替え、再読み込み後も残る。外部サービスは設定するまで呼ばない', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    let orsCalls = 0;
    await page.route('https://api.openrouteservice.org/**', (route) => {
      orsCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          features: [
            {
              geometry: {
                type: 'LineString',
                coordinates: [
                  [139.6258, 35.9081],
                  [139.6257, 35.9075],
                  [139.6256, 35.9069],
                ],
              },
              properties: { segments: [{ distance: 190, duration: 150 }] },
            },
          ],
        }),
      });
    });
    await openApp(page);

    await addToRoute(page, /焼鳥日高 大宮一番街店/);
    await addToRoute(page, /焼鳥日高 大宮すずらん通店/);
    await page.getByRole('tab', { name: 'はしご酒' }).click();
    const itinerary = page.getByRole('list', { name: '行程' });
    await expect(itinerary.getByRole('group', { name: /軒目/ })).toHaveCount(2);
    await expect(itinerary).toContainText('（概算）');

    await page.getByLabel('ルート名').fill('大宮で2軒');
    await page.getByLabel('予定日').fill('2026-10-30');
    await page.getByLabel('開始時刻').fill('18:00');
    await expect(itinerary.getByRole('group', { name: '1軒目 焼鳥日高 大宮一番街店' })).toContainText(
      '営業時間内（登録情報）',
    );

    await page.getByRole('button', { name: '焼鳥日高 大宮すずらん通店を前へ' }).click();
    await expect(itinerary.getByRole('group', { name: /軒目/ }).first()).toHaveAttribute(
      'aria-label',
      '1軒目 焼鳥日高 大宮すずらん通店',
    );

    await page.getByRole('button', { name: '地図でルート全体を表示' }).click();
    await expect.poll(() => readZoom(page), { timeout: 10_000 }).toBeGreaterThan(14);
    expect(orsCalls).toBe(0);

    // 外部サービスを設定して取得（応答はテスト用の固定値）
    await page.getByText('徒歩ルートの設定').click();
    await page.getByRole('radio', { name: /openrouteservice で徒歩ルートを取得する/ }).check();
    await page.getByLabel('openrouteservice の API キー').fill('dummy-key-for-test');
    await page.getByRole('button', { name: '設定を保存' }).click();
    await page.getByRole('button', { name: '徒歩ルートを取得' }).click();
    await expect(itinerary).toContainText('徒歩 190m・約3分（経路検索）');
    expect(orsCalls).toBe(1);

    // 再読み込み後もルートと設定が残る
    await page.reload();
    await page.getByRole('tab', { name: 'はしご酒' }).click();
    await page.getByLabel('ルート').selectOption({ label: '大宮で2軒（2軒）' });
    await expect(page.getByRole('list', { name: '行程' }).getByRole('group', { name: /軒目/ }).first()).toHaveAttribute(
      'aria-label',
      '1軒目 焼鳥日高 大宮すずらん通店',
    );
    await expect(page.getByLabel('開始時刻')).toHaveValue('18:00');
    expect(errors).toEqual([]);
  });
});
