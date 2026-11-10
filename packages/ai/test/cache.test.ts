import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { generateStructured } from '../src/generate.js';
import { mockModel } from './helpers.js';

const schema = z.object({ colour: z.string() });
const fallback = () => ({ colour: 'unknown' });
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fairfold-ai-cache-'));
  vi.stubEnv('AI_CACHE_DIR', dir);
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

const ask = (model: ReturnType<typeof mockModel>['model'], user = 'u') =>
  generateStructured({ schema, system: 's', user, fallback, model, component: 'test' });

describe('model result cache (AI_CACHE_DIR)', () => {
  it('answers a repeated identical request from the cache without calling the model', async () => {
    const { model, calls } = mockModel(['{"colour":"navy"}']);
    expect(await ask(model)).toEqual({
      value: { colour: 'navy' },
      usedFallback: false,
      model: 'mock-model',
    });
    expect(await ask(model)).toEqual({
      value: { colour: 'navy' },
      usedFallback: false,
      model: 'mock-model',
    });
    expect(calls).toHaveLength(1);
    expect(readdirSync(dir)).toHaveLength(1);
  });

  it('never caches a fallback, and a different input is a different entry', async () => {
    const bad = mockModel(['not json']);
    expect((await ask(bad.model)).usedFallback).toBe(true);
    expect(readdirSync(dir)).toHaveLength(0);
    const good = mockModel(['{"colour":"red"}']);
    await ask(good.model, 'first');
    await ask(good.model, 'second');
    expect(good.calls).toHaveLength(2);
    expect(readdirSync(dir)).toHaveLength(2);
  });

  it('is off when AI_CACHE_DIR is unset', async () => {
    vi.stubEnv('AI_CACHE_DIR', '');
    const { model, calls } = mockModel(['{"colour":"navy"}']);
    await ask(model);
    await ask(model);
    expect(calls).toHaveLength(2);
  });
});
