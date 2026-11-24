import type { ProviderId } from '../domain.ts'

export const AI_PROVIDERS: readonly { id: ProviderId; name: string; shortName: string; subscription: string; description: string }[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    shortName: 'Claude',
    subscription: 'Claude Pro / Max subscription',
    description: 'Uses the claude CLI with your Claude subscription (Pro/Max). The ANTHROPIC_API_KEY is ignored.',
  },
  {
    id: 'codex',
    name: 'Codex',
    shortName: 'Codex',
    subscription: 'ChatGPT account (Plus / Pro / Business)',
    description: 'Uses the codex exec CLI signed into your ChatGPT account. The OPENAI_API_KEY is ignored.',
  },
]

export function getAiProvider(id: ProviderId) {
  return AI_PROVIDERS.find((provider) => provider.id === id) || AI_PROVIDERS[0]
}
