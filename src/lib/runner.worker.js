// Uruchamia kod ucznia + testy w izolowanym Web Workerze.

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

function fmt(v) {
  if (typeof v === 'string') return v
  if (v instanceof Error) return `${v.name}: ${v.message}`
  if (typeof v === 'function') return `[Function ${v.name || 'anonymous'}]`
  if (typeof v === 'undefined') return 'undefined'
  try {
    const seen = new WeakSet()
    return JSON.stringify(v, (_k, val) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]'
        seen.add(val)
      }
      if (typeof val === 'bigint') return `${val}n`
      if (typeof val === 'undefined') return '__undef__'
      if (val instanceof Map) return { Map: [...val.entries()] }
      if (val instanceof Set) return { Set: [...val] }
      return val
    }).replace(/"__undef__"/g, 'undefined')
  } catch {
    return String(v)
  }
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (a instanceof Map && b instanceof Map) return a.size === b.size && [...a].every(([k, v]) => b.has(k) && deepEqual(v, b.get(k)))
  if (a instanceof Set && b instanceof Set) return a.size === b.size && [...a].every((v) => b.has(v))
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]))
}

class AssertionError extends Error {}

function makeExpect() {
  function build(actual, negate) {
    const assert = (pass, msg, msgNot) => {
      if (negate ? pass : !pass) throw new AssertionError(negate ? msgNot : msg)
    }
    const m = {
      toBe: (exp) => assert(Object.is(actual, exp), `expected ${fmt(exp)}, received ${fmt(actual)}`, `expected value not to be ${fmt(exp)}`),
      toEqual: (exp) => assert(deepEqual(actual, exp), `expected ${fmt(exp)}, received ${fmt(actual)}`, `expected value not to equal ${fmt(exp)}`),
      toStrictEqual: (exp) => assert(deepEqual(actual, exp), `expected ${fmt(exp)}, received ${fmt(actual)}`, `expected value not to equal ${fmt(exp)}`),
      toBeTruthy: () => assert(!!actual, `expected truthy, received ${fmt(actual)}`, `expected falsy, received ${fmt(actual)}`),
      toBeFalsy: () => assert(!actual, `expected falsy, received ${fmt(actual)}`, `expected truthy, received ${fmt(actual)}`),
      toBeNull: () => assert(actual === null, `expected null, received ${fmt(actual)}`, 'expected not null'),
      toBeUndefined: () => assert(actual === undefined, `expected undefined, received ${fmt(actual)}`, 'expected not undefined'),
      toBeDefined: () => assert(actual !== undefined, 'expected value to be defined', 'expected undefined'),
      toContain: (x) =>
        assert(
          actual != null && (typeof actual === 'string' ? actual.includes(x) : [...actual].some((v) => Object.is(v, x) || deepEqual(v, x))),
          `expected ${fmt(actual)} to contain ${fmt(x)}`,
          `expected ${fmt(actual)} not to contain ${fmt(x)}`,
        ),
      toHaveLength: (n) => assert(actual?.length === n, `expected length ${n}, received ${fmt(actual?.length)}`, `expected length not ${n}`),
      toBeCloseTo: (n, digits = 2) =>
        assert(Math.abs(actual - n) < Math.pow(10, -digits) / 2, `expected ${actual} to be close to ${n}`, `expected ${actual} not to be close to ${n}`),
      toBeGreaterThan: (n) => assert(actual > n, `expected ${fmt(actual)} > ${n}`, `expected ${fmt(actual)} <= ${n}`),
      toBeGreaterThanOrEqual: (n) => assert(actual >= n, `expected ${fmt(actual)} >= ${n}`, `expected ${fmt(actual)} < ${n}`),
      toBeLessThan: (n) => assert(actual < n, `expected ${fmt(actual)} < ${n}`, `expected ${fmt(actual)} >= ${n}`),
      toBeLessThanOrEqual: (n) => assert(actual <= n, `expected ${fmt(actual)} <= ${n}`, `expected ${fmt(actual)} > ${n}`),
      toBeInstanceOf: (C) => assert(actual instanceof C, `expected instance of ${C?.name}`, `expected not instance of ${C?.name}`),
      toMatch: (re) => assert(new RegExp(re).test(actual), `expected ${fmt(actual)} to match ${re}`, `expected ${fmt(actual)} not to match ${re}`),
      toHaveBeenCalled: () => assert(actual?.calls?.length > 0, 'expected mock to have been called', 'expected mock not to have been called'),
      toHaveBeenCalledTimes: (n) => assert(actual?.calls?.length === n, `expected ${n} calls, received ${actual?.calls?.length}`, `expected not ${n} calls`),
      toHaveBeenCalledWith: (...args) =>
        assert(actual?.calls?.some((c) => deepEqual(c, args)), `expected call with ${fmt(args)}, calls: ${fmt(actual?.calls)}`, `expected no call with ${fmt(args)}`),
      toThrow: (expected) => {
        let threw = false
        let err
        try {
          actual()
        } catch (e) {
          threw = true
          err = e
        }
        let pass = threw
        if (threw && expected !== undefined) {
          const msg = err?.message ?? String(err)
          if (typeof expected === 'string') pass = msg.includes(expected)
          else if (expected instanceof RegExp) pass = expected.test(msg)
          else if (typeof expected === 'function') pass = err instanceof expected
        }
        assert(pass, threw ? `function threw "${err?.message}", expected ${fmt(expected)}` : 'expected function to throw', 'expected function not to throw')
      },
    }
    return m
  }
  const expect = (actual) => {
    const api = build(actual, false)
    api.not = build(actual, true)
    const asyncWrap = (negate, mode) =>
      new Proxy(
        {},
        {
          get: (_t, prop) =>
            async (...args) => {
              let value
              let rejected = false
              try {
                value = await actual
              } catch (e) {
                rejected = true
                value = e
              }
              if (mode === 'resolves' && rejected) throw new AssertionError(`expected promise to resolve, it rejected with ${fmt(value)}`)
              if (mode === 'rejects' && !rejected) throw new AssertionError(`expected promise to reject, it resolved with ${fmt(value)}`)
              const target = mode === 'rejects' && prop === 'toThrow' ? () => { throw value } : value
              return build(target, negate)[prop](...args)
            },
        },
      )
    api.resolves = asyncWrap(false, 'resolves')
    api.rejects = asyncWrap(false, 'rejects')
    return api
  }
  return expect
}

function mockFn(impl) {
  const f = function (...args) {
    f.calls.push(args)
    f.contexts.push(this)
    f.mock.calls = f.calls
    return impl ? impl.apply(this, args) : undefined
  }
  f.calls = []
  f.contexts = []
  f.mock = { calls: f.calls }
  return f
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms} ms`)), ms))])
}

function stripModuleSyntax(code) {
  return code
    .replace(/^\s*import\s[^;]*;?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+(?=(async\s+)?function|class)/gm, '')
    .replace(/^\s*export\s+(?=(async\s+)?function|class|const|let|var)/gm, '')
    .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '')
    .replace(/^\s*Object\.defineProperty\(exports,[^;]*;\s*$/gm, '')
}

self.onmessage = async (e) => {
  const { code, tests } = e.data
  const logs = []
  const push = (level) => (...a) => logs.push({ level, text: a.map(fmt).join(' ') })
  const cons = { log: push('log'), info: push('info'), warn: push('warn'), error: push('error'), debug: push('log'), table: push('log') }
  const registered = []
  const test = (name, fn) => registered.push({ name, fn })
  const expect = makeExpect()
  try {
    const body = `${stripModuleSyntax(code)}\n;\n${tests}`
    const fn = new AsyncFunction('test', 'it', 'expect', 'sleep', 'mockFn', 'console', 'exports', 'module', body)
    await withTimeout(fn(test, test, expect, sleep, mockFn, cons, {}, { exports: {} }), 3000)
  } catch (err) {
    self.postMessage({ compileError: `${err?.name || 'Error'}: ${err?.message || err}`, results: [], logs })
    return
  }
  const results = []
  for (const t of registered) {
    const t0 = performance.now()
    try {
      await withTimeout(Promise.resolve().then(() => t.fn()), 2500)
      results.push({ name: t.name, ok: true, ms: Math.round(performance.now() - t0) })
    } catch (err) {
      results.push({ name: t.name, ok: false, error: err?.message || String(err), ms: Math.round(performance.now() - t0) })
    }
  }
  self.postMessage({ results, logs })
}
