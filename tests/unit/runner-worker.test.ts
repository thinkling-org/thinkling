import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TestRun } from '../../src/domain.ts'

const worker = { onmessage: null as ((event: { data: { code: string; tests: string } }) => Promise<void>) | null, postMessage: vi.fn() }

beforeAll(async () => {
  vi.stubGlobal('self', worker)
  await import('../../src/lib/runner.worker.ts' as string)
  vi.unstubAllGlobals()
})
beforeEach(() => { worker.postMessage.mockClear(); vi.useFakeTimers() })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

async function run(code: string, tests: string): Promise<TestRun> {
  await worker.onmessage!({ data: { code, tests } })
  expect(worker.postMessage).toHaveBeenCalledTimes(1)
  return worker.postMessage.mock.calls[0][0]
}

describe('learner code execution through the worker message interface', () => {
  it('runs exported learner code and continues after a failed assertion', async () => {
    const result = await run('export function double(n) { return n * 2 }', `
      test('doubles', () => expect(double(3)).toBe(6));
      it('failure', () => expect(double(2)).toBe(5));
      test('still runs', () => expect(double(0)).toBe(0));
    `)
    expect(result.results).toEqual([
      { name: 'doubles', ok: true, ms: expect.any(Number) },
      { name: 'failure', ok: false, error: 'expected 5, received 4', ms: expect.any(Number) },
      { name: 'still runs', ok: true, ms: expect.any(Number) },
    ])
  })

  it.each([
    ['export default function answer() { return 42 }', 'expect(answer()).toBe(42)'],
    ['export default class Answer {}', 'expect(new Answer()).toBeInstanceOf(Answer)'],
    ['const answer = 42;\nexport { answer };', 'expect(answer).toBe(42)'],
    ['import ignored from "unavailable";\nexport const answer = 42;', 'expect(answer).toBe(42)'],
    ['Object.defineProperty(exports, "__esModule", { value: true });\nconst answer = 42;', 'expect(answer).toBe(42)'],
  ])('accepts supported module syntax: %s', async (code, assertion) => {
    const result = await run(code, `test('module', () => { ${assertion} })`)
    expect(result.results[0]).toMatchObject({ name: 'module', ok: true })
  })

  it('reports syntax errors and top-level failures separately from test failures', async () => {
    expect(await run('const = ;', '')).toMatchObject({ compileError: expect.stringContaining('SyntaxError'), results: [] })
    worker.postMessage.mockClear()
    expect(await run('throw new Error("top-level failure")', '')).toMatchObject({ compileError: 'Error: top-level failure', results: [] })
  })

  it.each([
    ['toEqual', '({ a: [1, { b: 2 }] })', '({ a: [1, { b: 2 }] })'],
    ['toStrictEqual', '[1, 2]', '[1, 2]'],
    ['toEqual', 'new Map([["key", { n: 1 }]])', 'new Map([["key", { n: 1 }]])'],
    ['toEqual', 'new Set([1, 2])', 'new Set([2, 1])'],
    ['toEqual', 'new Date("2026-01-01")', 'new Date("2026-01-01")'],
    ['toContain', '[{ a: 1 }]', '({ a: 1 })'],
    ['toContain', '"hello"', '"ell"'],
    ['toHaveLength', '[1, 2]', '2'],
    ['toBeCloseTo', '0.1 + 0.2', '0.3'],
    ['toBeGreaterThan', '3', '2'],
    ['toBeGreaterThanOrEqual', '3', '3'],
    ['toBeLessThan', '2', '3'],
    ['toBeLessThanOrEqual', '3', '3'],
    ['toMatch', '"hello"', '/ell/'],
    ['toBeTruthy', '1', ''], ['toBeFalsy', '0', ''],
    ['toBeNull', 'null', ''], ['toBeUndefined', 'undefined', ''], ['toBeDefined', '0', ''],
  ])('supports the %s assertion for %s', async (matcher, actual, expected) => {
    const result = await run('', `test('assertion', () => expect(${actual}).${matcher}(${expected}));`)
    expect(result.results[0]).toMatchObject({ ok: true })
  })

  it('detects unequal collections, primitives and object shapes', async () => {
    const result = await run('', `test('inequality', () => {
      expect({ a: 1 }).not.toEqual({ b: 1 });
      expect({ a: 1 }).not.toEqual({ a: 1, b: 2 });
      expect([1]).not.toEqual({ 0: 1 });
      expect(null).not.toEqual({});
      expect(1).not.toEqual('1');
      expect(new Date(0)).not.toEqual(new Date(1));
      expect(new Map([['a', 1]])).not.toEqual(new Map([['b', 1]]));
      expect(new Set([1])).not.toEqual(new Set([2]));
      expect(1).not.toBe(2);
    });`)
    expect(result.results[0].ok).toBe(true)
  })

  it('exposes mock calls, arguments and call context', async () => {
    const result = await run('', `test('mock', () => {
      const f = mockFn(function(n) { return this.factor * n });
      const context = { factor: 2 };
      expect(f.call(context, 3)).toBe(6);
      expect(f).toHaveBeenCalled();
      expect(f).toHaveBeenCalledTimes(1);
      expect(f).toHaveBeenCalledWith(3);
      expect(f.contexts[0]).toBe(context);
      expect(f.mock.calls).toEqual([[3]]);
      expect(mockFn()()).toBeUndefined();
    });`)
    expect(result.results[0].ok).toBe(true)
  })

  it('handles thrown errors and resolving or rejecting promises', async () => {
    const result = await run('', `test('async assertions', async () => {
      const fail = () => { throw new TypeError('bad input') };
      expect(fail).toThrow('bad');
      expect(fail).toThrow(/input/);
      expect(fail).toThrow(TypeError);
      expect(fail).toThrow();
      expect(() => 1).not.toThrow();
      await expect(Promise.resolve(42)).resolves.toBe(42);
      await expect(Promise.reject(new Error('rejected'))).rejects.toThrow('rejected');
      await expect(Promise.reject('oops')).rejects.toBe('oops');
    });`)
    expect(result.results[0].ok).toBe(true)
  })

  it('reports promise assertion mode mismatches', async () => {
    const result = await run('', `
      test('resolved', async () => await expect(Promise.resolve(1)).rejects.toBe(1));
      test('rejected', async () => await expect(Promise.reject('oops')).resolves.toBe(1));
      test('not', () => expect(1).not.toBe(1));
      test('throws', () => expect(() => 1).toThrow());
    `)
    expect(result.results.map((r) => r.ok)).toEqual([false, false, false, false])
    expect(result.results[0].error).toContain('expected promise to reject')
    expect(result.results[1].error).toContain('expected promise to resolve')
    expect(result.results[2].error).toBe('expected value not to be 1')
    expect(result.results[3].error).toBe('expected function to throw')
  })

  it('captures readable console output without losing circular or special values', async () => {
    const result = await run(`
      const circular = {}; circular.self = circular;
      console.log('hello', undefined, 2n, new Error('bad'), function named() {});
      console.info(new Map([['a', 1]]), new Set([2]));
      console.warn(circular);
      console.error({ missing: undefined });
      console.debug('debug'); console.table('table');
    `, '')
    expect(result.logs).toEqual([
      { level: 'log', text: 'hello undefined "2n" Error: bad [Function named]' },
      { level: 'info', text: '{"Map":[["a",1]]} {"Set":[2]}' },
      { level: 'warn', text: '{"self":"[Circular]"}' },
      { level: 'error', text: '{"missing":undefined}' },
      { level: 'log', text: 'debug' }, { level: 'log', text: 'table' },
    ])
  })

  it('times out a hanging test and still executes subsequent tests', async () => {
    const pending = run('', `test('hang', () => new Promise(() => {})); test('next', () => expect(1).toBe(1));`)
    await vi.advanceTimersByTimeAsync(2500)
    expect((await pending).results).toMatchObject([{ name: 'hang', ok: false, error: 'timeout 2500 ms' }, { name: 'next', ok: true }])
  })

  it('times out hanging top-level initialization', async () => {
    const pending = run('await new Promise(() => {})', '')
    await vi.advanceTimersByTimeAsync(3000)
    expect(await pending).toMatchObject({ compileError: 'Error: timeout 3000 ms', results: [] })
  })
})
