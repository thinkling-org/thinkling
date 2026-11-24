import { t } from './locale.ts'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { VOICE_CONTROLS } from '../src/lib/voice-design.ts'

const EMBEDDING_SIZE = 192
let anchors

function loadAnchors(directory: string) {
  const files = fs.readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.embedding.npy'))
    .sort()
  const embeddings = files.flatMap((file) => {
    const npy = fs.readFileSync(path.join(directory, file))
    if (npy.length < 10 || npy.toString('ascii', 1, 6) !== 'NUMPY' || npy[6] !== 1) return []
    const offset = 10 + npy.readUInt16LE(8)
    const header = npy.toString('ascii', 10, offset)
    if (!header.includes("'<f4'") || !/\(192,\s*\)/.test(header) || npy.length !== offset + EMBEDDING_SIZE * 4) return []
    const vector = Array.from({ length: EMBEDDING_SIZE }, (_, i) => npy.readFloatLE(offset + i * 4))
    return [{ npy, offset, vector, norm: Math.hypot(...vector) }]
  })
  if (embeddings.length < 6) throw new Error(t('The voice design data is missing.'))
  return embeddings
}

export function designedSpeaker(design, directory) {
  anchors ??= loadAnchors(directory)
  // Each project blends six release embeddings. The seed fixes the blend across texts.
  const selected = anchors.map((anchor, index) => ({
    anchor,
    weight: createHash('sha256').update(`${design.seed}:${index}`).digest().readUInt32LE() / 0x100000000,
  })).sort((a, b) => b.weight - a.weight).slice(0, 6)

  const mix = Array(EMBEDDING_SIZE).fill(0)
  let normSum = 0
  let weightSum = 0
  for (const { anchor, weight } of selected) {
    normSum += anchor.norm * weight
    weightSum += weight
    for (let i = 0; i < mix.length; i++) mix[i] += anchor.vector[i] * weight
  }
  const scale = normSum / (weightSum * Math.hypot(...mix))
  const { npy, offset } = selected[0].anchor
  const output = Buffer.from(npy)
  for (let i = 0; i < mix.length; i++) output.writeFloatLE(mix[i] * scale, offset + i * 4)
  return {
    speaker_mode: 'embedding',
    speaker_embedding_name: 'design.npy',
    speaker_embedding_base64: output.toString('base64'),
    controls: Object.fromEntries(VOICE_CONTROLS.filter(({ key }) => design[key] !== 0)
      .map(({ key, direction }) => [direction, design[key]])),
  }
}
