import {
  getErrorUrl,
  isTileLikeUrl,
  styleLoadFailedIssue,
  tilesFailedIssue,
  unknownIssue,
  webglUnavailableIssue,
} from './mapErrors';

describe('isTileLikeUrl', () => {
  it.each([
    'https://tiles.openfreemap.org/planet/20250101/14/14552/6451.pbf',
    'https://example.invalid/tiles/10/909/403.png',
    'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf',
    'https://tiles.openfreemap.org/sprites/ofm_f384/ofm@2x.json',
  ])('タイル系: %s', (url) => expect(isTileLikeUrl(url)).toBe(true));

  it.each(['https://tiles.openfreemap.org/styles/dark', null])('タイル系ではない: %s', (url) =>
    expect(isTileLikeUrl(url)).toBe(false),
  );
});

describe('MapIssue の生成', () => {
  const ajaxLike = Object.assign(new Error('Failed to fetch'), {
    status: 503,
    url: 'https://tiles.openfreemap.org/styles/dark',
  });

  it('スタイル取得失敗: 原因・対処・詳細を含む', () => {
    const issue = styleLoadFailedIssue(ajaxLike, true);
    expect(issue.kind).toBe('style_load_failed');
    expect(issue.fatal).toBe(false);
    expect(issue.actions.length).toBeGreaterThan(0);
    expect(issue.detail).toContain('HTTP 503');
    expect(issue.detail).toContain('styles/dark');
  });

  it('オフライン時はオフラインとして案内する', () => {
    expect(styleLoadFailedIssue(ajaxLike, false).kind).toBe('offline');
    expect(tilesFailedIssue(ajaxLike, 3, false).kind).toBe('offline');
  });

  it('タイル失敗は件数を表示する', () => {
    expect(tilesFailedIssue(ajaxLike, 7, true).title).toContain('7件');
  });

  it('WebGL 非対応は致命的', () => {
    const issue = webglUnavailableIssue(new Error('Failed to initialize WebGL'));
    expect(issue.fatal).toBe(true);
    expect(issue.detail).toContain('WebGL');
  });

  it('Error 以外の値も安全に扱う', () => {
    expect(unknownIssue('boom').detail).toBe('boom');
    expect(unknownIssue(undefined).detail).toBe('undefined');
    expect(getErrorUrl({ url: 42 })).toBeNull();
  });
});
