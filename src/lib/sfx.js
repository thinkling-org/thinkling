// Efekty dźwiękowe syntetyzowane w Web Audio — bez plików, bez licencji.
// Krótkie, "okrągłe" dźwięki w stylu gier edukacyjnych: plup, ding, bonk, fanfara.

let ctx = null
let master = null
let enabled = true
let volume = 0.6

export function configureSfx({ sound, volume: v } = {}) {
  if (typeof sound === 'boolean') enabled = sound
  if (typeof v === 'number') volume = Math.min(1, Math.max(0, v))
  if (master) master.gain.value = volume
}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = volume
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    master.connect(comp).connect(ctx.destination)
  }
  if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume().catch(() => {})
  return ctx
}

export function prepareSfx() {
  if (!enabled) return
  try {
    ac()
  } catch {
    /* audio nie jest krytyczne */
  }
}

/** Pojedynczy ton z obwiednią i opcjonalnym glissando. */
function tone({ freq, to, type = 'sine', at = 0, dur = 0.12, gain = 0.3, attack = 0.004 }) {
  const c = ac()
  if (!c) return
  const t = c.currentTime + at
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.03)
}

/** Szum przez filtr pasmowy — "whoosh" przy odwracaniu karty. */
function whoosh({ at = 0, dur = 0.18, gain = 0.18, from = 600, to = 3200 } = {}) {
  const c = ac()
  if (!c) return
  const t = c.currentTime + at
  const len = Math.ceil(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = 1.2
  f.frequency.setValueAtTime(from, t)
  f.frequency.exponentialRampToValueAtTime(to, t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(master)
  src.start(t)
  src.stop(t + dur + 0.02)
}

const semis = (n) => Math.pow(2, n / 12)
// skala pentatoniczna — kolejne kroki zawsze brzmią "ładnie"
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]

const SOUNDS = {
  /** plup — wybór, przejście dalej, krok w śledzeniu kodu */
  pop(pitch = 1) {
    tone({ freq: 360 * pitch, to: 820 * pitch, dur: 0.11, gain: 0.32 })
    tone({ freq: 820 * pitch, type: 'triangle', at: 0.012, dur: 0.06, gain: 0.06 })
  },
  /** cichy klik — zaznaczenie opcji */
  tick() {
    tone({ freq: 1100, to: 1500, dur: 0.045, gain: 0.12 })
  },
  /** dobra odpowiedź — jasne "ding-ding" w górę */
  correct() {
    tone({ freq: 880, type: 'triangle', dur: 0.16, gain: 0.22 })
    tone({ freq: 880, dur: 0.16, gain: 0.12 })
    tone({ freq: 1318.5, type: 'triangle', at: 0.085, dur: 0.32, gain: 0.24 })
    tone({ freq: 1318.5, at: 0.085, dur: 0.32, gain: 0.12 })
  },
  /** prawie — miękkie, pytające dwa dźwięki */
  almost() {
    tone({ freq: 659, type: 'triangle', dur: 0.15, gain: 0.2 })
    tone({ freq: 784, type: 'triangle', at: 0.1, dur: 0.24, gain: 0.18 })
  },
  /** zła odpowiedź — tępe "bonk" w dół */
  wrong() {
    tone({ freq: 311, to: 233, type: 'triangle', dur: 0.16, gain: 0.26 })
    tone({ freq: 233, to: 155, type: 'triangle', at: 0.11, dur: 0.28, gain: 0.26 })
    tone({ freq: 155, to: 110, type: 'sine', at: 0.11, dur: 0.26, gain: 0.14 })
  },
  /** nowa linia w konsoli / outpucie */
  blip() {
    tone({ freq: 1046, to: 1568, dur: 0.08, gain: 0.14 })
  },
  /** zmiana wartości w pamięci */
  ding() {
    tone({ freq: 1568, dur: 0.28, gain: 0.1 })
    tone({ freq: 3136, dur: 0.16, gain: 0.025 })
  },
  /** odwrócenie fiszki */
  flip() {
    whoosh({ dur: 0.16, gain: 0.16 })
    tone({ freq: 520, to: 780, at: 0.05, dur: 0.08, gain: 0.08 })
  },
  /** koniec prześledzenia / mała nagroda */
  sparkle() {
    ;[0, 4, 7, 12].forEach((s, k) => tone({ freq: 1046 * semis(s), type: 'triangle', at: k * 0.05, dur: 0.18, gain: 0.1 }))
  },
  /** ukończenie lekcji — fanfara */
  complete() {
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((f, k) => {
      tone({ freq: f, type: 'triangle', at: k * 0.1, dur: 0.22, gain: 0.2 })
      tone({ freq: f * 2, at: k * 0.1, dur: 0.12, gain: 0.04 })
    })
    for (const f of [523.25, 659.25, 783.99, 1046.5]) tone({ freq: f, type: 'triangle', at: 0.44, dur: 0.9, gain: 0.11 })
    tone({ freq: 2093, at: 0.44, dur: 0.5, gain: 0.04 })
  },
}

export function play(name, ...args) {
  if (!enabled) return
  try {
    SOUNDS[name]?.(...args)
  } catch {
    /* audio nie jest krytyczne */
  }
}

/** "plup" o wysokości zależnej od numeru kroku — rosnąca melodia. */
export function playStep(i) {
  play('pop', semis(PENTA[Math.min(i, PENTA.length - 1)]))
}
