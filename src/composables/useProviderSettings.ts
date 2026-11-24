import { onScopeDispose, shallowRef } from 'vue'
import { ai } from '../lib/api.ts'
import { useApp } from '../stores/app.ts'
import type { ProviderId } from '../domain.ts'

export function useProviderSettings() {
  const app = useApp()
  const testing = shallowRef(false)
  const testResult = shallowRef<{ ok: boolean; text: string } | null>(null)
  let connectionTest: AbortController | null = null

  function cancelTest() {
    connectionTest?.abort()
    connectionTest = null
    testing.value = false
    testResult.value = null
  }

  async function chooseProvider(id: ProviderId) {
    if (app.settings.provider === id) return
    cancelTest()
    app.switchProvider(id)
    await app.saveNow()
    app.refreshStatus()
  }

  async function testConnection() {
    if (testing.value) return
    const controller = new AbortController()
    const startedAt = Date.now()
    connectionTest = controller
    testing.value = true
    testResult.value = null
    try {
      await app.saveNow()
      if (controller.signal.aborted) return
      const data = await ai<{ message: string }>('ping', {}, { signal: controller.signal })
      if (controller.signal.aborted) return
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
      testResult.value = { ok: true, text: `${data.message} (${seconds} s)` }
    } catch (error) {
      if (!controller.signal.aborted) testResult.value = { ok: false, text: error.message }
    } finally {
      if (connectionTest === controller) {
        connectionTest = null
        testing.value = false
      }
    }
  }

  onScopeDispose(cancelTest)

  return { chooseProvider, testConnection, testing, testResult }
}
