import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseRoute, routePath } from '../src/router.js';
import { bindTemplate } from '../src/template.js';
import { ApiClient } from '../src/api.js';

describe('website routes and unchanged design', () => {
  it('round trips selected records and rejects paths outside the console', () => {
    for (const view of ['orders', 'pack', 'disputes', 'shared-causes'] as const) {
      const route = { view, id: 'SEED-PP-D-1' };
      expect(parseRoute(routePath(route))).toEqual(route);
    }
    for (const path of [
      '/api/orders',
      '/console/nope',
      '/console/orders/a/b',
      '/console/orders/%2Fetc',
      '/console/store-report/1',
    ])
      expect(parseRoute(path)).toBeNull();
  });
  it('preserves source CSS and removes the simulated console entrypoint', async () => {
    const source = await readFile(
      new URL('../../../standalone/Fairfold Console.html', import.meta.url),
      'utf8',
    );
    const result = bindTemplate(source);
    expect(result.match(/<style>[\s\S]*?<\/style>/)?.[0]).toBe(
      source.match(/<style>[\s\S]*?<\/style>/)?.[0],
    );
    expect(result).toContain('src="/assets/site.js"');
    expect(result).not.toContain('src="/assets/console.js"');
    expect(result).not.toMatch(/FF-3D90|FF-6E12|≈31×|0\.0014|7340 1182 61/);
  });
});
describe('console transport', () => {
  it('shares sign-in across concurrent reads without persisting or logging the token', async () => {
    const activity = vi.fn();
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ token: 'test-secret' }))
      .mockImplementation(async () => Response.json([]));
    const api = new ApiClient(true, activity, send);
    await Promise.all([api.request('/api/orders'), api.request('/api/merchant/alerts')]);
    expect(send.mock.calls.filter(([path]) => path === '/api/auth/demo-login')).toHaveLength(1);
    expect(JSON.stringify(activity.mock.calls)).not.toContain('test-secret');
    expect(send.mock.calls[1]?.[1]?.headers).toMatchObject({ authorization: 'Bearer test-secret' });
  });
  it('never automatically retries a POST with an unknown result', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ token: 't' }))
      .mockRejectedValueOnce(new TypeError('offline'));
    const api = new ApiClient(true, vi.fn(), send);
    await expect(api.request('/api/disputes/D/packs/P/approve', {})).rejects.toThrow(
      'outcome is unknown',
    );
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('keeps demo access gated and allows public reports without sign-in', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ band: 'new' }));
    const api = new ApiClient(false, vi.fn(), send);
    await expect(api.request('/api/orders')).rejects.toThrow('disabled');
    expect(send).not.toHaveBeenCalled();
    await api.request('/api/stores/store/report', undefined, true);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[1]?.headers).not.toHaveProperty('authorization');
  });
  it('rejects repeating pagination cursors rather than duplicating rows', async () => {
    const batch = Array.from({ length: 100 }, (_, i) => ({ id: String(i) }));
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ token: 't' }))
      .mockImplementation(async () => Response.json(batch));
    await expect(new ApiClient(true, vi.fn(), send).list('/api/orders')).rejects.toThrow(
      'Records changed',
    );
  });
});
