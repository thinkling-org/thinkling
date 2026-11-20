export const VOICE_CONTROLS = [
  { key: 'gender', label: 'Barwa', low: 'Męska', high: 'Żeńska', min: -2, max: 2, direction: 'identity.gender' },
  { key: 'age', label: 'Wiek głosu', low: 'Młodszy', high: 'Dojrzalszy', min: -2, max: 2, direction: 'identity.age' },
  { key: 'pitch', label: 'Wysokość', low: 'Niższa', high: 'Wyższa', min: -1.5, max: 1.5, direction: 'pitch.pitch' },
  { key: 'softness', label: 'Miękkość', low: 'Neutralna', high: 'Miękka', min: 0, max: 4, direction: 'texture.soft' },
  { key: 'pace', label: 'Tempo', low: 'Wolniej', high: 'Szybciej', min: -2, max: 2, direction: 'delivery.tempo' },
  { key: 'room', label: 'Brzmienie nagrania', low: 'Neutralne', high: 'Studyjne', min: 0, max: 4, direction: 'room.clean' },
  { key: 'accent', label: 'Polski akcent', low: 'Naturalny', high: 'Wzmocniony', min: 0, max: 1.5, direction: 'accents_l1.pol' },
]

export const DEFAULT_VOICE_DESIGN = {
  seed: 1084, gender: 0, age: 0, pitch: 0, softness: 0, pace: 0, room: 2, accent: 1.5,
}

export function normalizeVoiceDesign(design) {
  if (!Number.isInteger(design?.seed) || design.seed < 0 || design.seed > 0x7fffffff) {
    throw new Error('Nieprawidłowy numer projektu głosu.')
  }
  const normalized = { seed: design.seed }
  for (const { key, min, max } of VOICE_CONTROLS) {
    const value = design[key] ?? DEFAULT_VOICE_DESIGN[key]
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error('Nieprawidłowe ustawienia projektu głosu.')
    }
    normalized[key] = value
  }
  return normalized
}
