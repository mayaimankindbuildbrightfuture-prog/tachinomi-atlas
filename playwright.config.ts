import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;
/** E2E_USE_PREVIEW=1 のときは本番ビルド（dist）を配信して検証する */
const usePreview = !!process.env.E2E_USE_PREVIEW;

/**
 * E2E テスト設定。
 * 既定のテストは地図スタイルをローカルの固定データに差し替えるため、外部ネットワークなしで完結する。
 * 実際の OpenFreeMap に接続するテストは E2E_EXTERNAL=1 のときだけ実行する（e2e/external.spec.ts）。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    launchOptions: {
      // ヘッドレス環境でも WebGL を使えるようにソフトウェアレンダラーを許可する
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
      ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: usePreview
      ? `npx vite build && npx vite preview --port ${PORT} --strictPort`
      : `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
