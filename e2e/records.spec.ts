import { expect, test, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveFixtureStyle } from './fixtures';

/**
 * テスト用ファイルの置き場所。Playwright の setInputFiles は、パスに日本語（テスト名由来の
 * 出力フォルダ名）が含まれるとファイルを渡せないことがあるため、ASCII のみの一時フォルダを使う。
 */
function asciiTempPath(name: string): string {
  return join(mkdtempSync(join(tmpdir(), 'tachinomi-e2e-')), name);
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function openApp(page: Page) {
  await serveFixtureStyle(page);
  await page.goto('/');
  await expect(page.getByText('地図表示中')).toBeVisible({ timeout: 20_000 });
}

test.describe('個人記録とバックアップ（外部通信なし）', () => {
  test('訪問記録・お気に入りを保存し、再読み込み後も残り、バックアップから別のブラウザに復元できる', async ({
    page,
    browser,
  }) => {
    const errors = collectErrors(page);
    await openApp(page);

    // ---- お気に入りと訪問記録 ----
    await page.getByRole('button', { name: /晩杯屋 吉祥寺店/ }).click();
    const detail = page.getByRole('complementary', { name: '店舗の詳細' });
    await detail.getByRole('button', { name: /お気に入り/ }).click();
    await expect(detail.getByRole('button', { name: /お気に入り/ })).toHaveAttribute('aria-pressed', 'true');

    await detail.getByRole('button', { name: '＋ 訪問記録を追加' }).click();
    const dialog = page.getByRole('dialog', { name: '訪問記録を追加' });
    await dialog.getByLabel(/訪問日時/).fill('2026-10-28T19:30');
    await dialog.getByLabel(/支払った金額/).fill('1800');
    await dialog.getByLabel(/注文した品/).fill('ホッピーセット\nもつ煮込み');
    await dialog.getByLabel(/感想・メモ/).fill('E2E用の感想');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(detail.getByText('訪問記録（1件）')).toBeVisible();

    // ---- 再読み込み後も残る ----
    await page.reload();
    await page.getByRole('tab', { name: '記録' }).click();
    const history = page.getByRole('list', { name: '訪問履歴' });
    await expect(history.getByRole('button', { name: '立呑み晩杯屋 吉祥寺店' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /お気に入り（1）/ }).click();
    await expect(page.getByRole('list', { name: 'お気に入り' })).toContainText('立呑み晩杯屋 吉祥寺店');

    // ---- 訪問済みの絞り込みと分布表示 ----
    await page.getByRole('tab', { name: '店舗を探す' }).click();
    await page.getByText('絞り込み条件').click();
    await page.getByRole('group', { name: '自分の記録' }).getByRole('radio', { name: '訪問済み' }).check();
    await expect(page.getByTestId('result-count')).toHaveText('1');
    await page.getByRole('button', { name: '条件をすべて解除' }).click();
    await page.getByRole('tab', { name: '地図の表示' }).click();
    await page.getByRole('radio', { name: '訪問済み店舗の分布' }).check();
    await expect(page.getByRole('region', { name: '凡例' })).toContainText('訪問済み（1）');

    // ---- 全データのバックアップを書き出す ----
    await page.getByRole('button', { name: 'データ管理', exact: true }).click();
    const manager = page.getByRole('dialog', { name: 'データ管理' });
    await expect(manager.getByTestId('last-backup')).toContainText('まだありません');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      manager.getByRole('button', { name: '全データのバックアップを書き出す' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^tachinomi-atlas-backup-\d{12}\.json$/);
    const backupPath = asciiTempPath('backup.json');
    await download.saveAs(backupPath);
    await expect(manager.getByTestId('last-backup')).not.toContainText('まだありません');
    expect(errors).toEqual([]);

    // ---- 何も保存されていない別のブラウザで復元する ----
    const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page2 = await fresh.newPage();
    await openApp(page2);
    await page2.getByRole('tab', { name: '記録' }).click();
    await expect(page2.getByText('訪問記録はまだありません。')).toBeVisible();
    await page2.getByRole('button', { name: 'データ管理', exact: true }).click();
    const manager2 = page2.getByRole('dialog', { name: 'データ管理' });
    await manager2.getByLabel('書き出した JSON ファイルを選ぶ').setInputFiles(backupPath);
    const preview = manager2.getByLabel('読み込む内容');
    await expect(preview).toContainText('訪問記録');
    await preview.getByRole('radio', { name: /置き換える/ }).check();
    await preview.getByRole('button', { name: '読み込む…' }).click();
    await preview.getByRole('button', { name: '置き換えて読み込む' }).click();
    await expect(manager2.getByText('読み込みが完了しました。')).toBeVisible();
    await manager2.getByRole('button', { name: 'データ管理を閉じる' }).click();
    await expect(page2.getByRole('list', { name: '訪問履歴' })).toContainText('立呑み晩杯屋 吉祥寺店');

    // 復元後も再読み込みで残る
    await page2.reload();
    await page2.getByRole('tab', { name: '記録' }).click();
    await expect(page2.getByRole('list', { name: '訪問履歴' })).toContainText('立呑み晩杯屋 吉祥寺店', {
      timeout: 20_000,
    });
    await fresh.close();
  });

  test('不正なJSONは読み込まず、データを変更しない', async ({ page }) => {
    await openApp(page);
    const bad = asciiTempPath('bad.json');
    writeFileSync(bad, '{"format":"tachinomi-atlas-backup","version":1,"data":{"visits":[{"id":"x"}]}}');
    await page.getByRole('button', { name: 'データ管理', exact: true }).click();
    const manager = page.getByRole('dialog', { name: 'データ管理' });
    await manager.getByLabel('書き出した JSON ファイルを選ぶ').setInputFiles(bad);
    await expect(manager.getByText('このファイルは読み込めません。データは変更していません。')).toBeVisible();
    await expect(manager.getByRole('button', { name: '読み込む…' })).toHaveCount(0);
  });
});
