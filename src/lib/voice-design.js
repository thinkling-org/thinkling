export const VOICE_CONTROLS = [
  { key: 'gender', label: 'Timbre', low: 'Masculine', high: 'Feminine', min: -2, max: 2, direction: 'identity.gender' },
  { key: 'age', label: 'Voice age', low: 'Younger', high: 'Mature', min: -2, max: 2, direction: 'identity.age' },
  { key: 'pitch', label: 'Pitch', low: 'Lower', high: 'Higher', min: -1.5, max: 1.5, direction: 'pitch.pitch' },
  { key: 'softness', label: 'Softness', low: 'Neutral softness', high: 'Soft', min: 0, max: 4, direction: 'texture.soft' },
  { key: 'pace', label: 'Pace', low: 'Slower', high: 'Faster', min: -2, max: 2, direction: 'delivery.tempo' },
  { key: 'room', label: 'Recording sound', low: 'Neutral sound', high: 'Studio', min: 0, max: 4, direction: 'room.clean' },
  { key: 'accent', label: 'Polish accent', low: 'Natural', high: 'Stronger', min: 0, max: 1.5, direction: 'accents_l1.pol' },
]

export const DEFAULT_VOICE_DESIGN = {
  seed: 1084, gender: 0, age: 0, pitch: 0, softness: 0, pace: 0, room: 2, accent: 1.5,
}

export function normalizeVoiceDesign(design) {
  if (!Number.isInteger(design?.seed) || design.seed < 0 || design.seed > 0x7fffffff) {
    throw new Error('Invalid voice design seed.')
  }
  const normalized = { seed: design.seed }
  for (const { key, min, max } of VOICE_CONTROLS) {
    const value = design[key] ?? DEFAULT_VOICE_DESIGN[key]
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error('Invalid voice design settings.')
    }
    normalized[key] = value
  }
  return normalized
}
