import { t } from '../lib/i18n.js'
import { computed, onBeforeUnmount, onMounted, reactive, shallowRef } from 'vue'
import { sandbox } from '../lib/sandbox.js'

export function useSandboxWorkspace(props) {
  const phase = shallowRef('opening')
  const progress = shallowRef('')
  const error = shallowRef('')
  const saveError = shallowRef('')
  const environment = shallowRef(props.envLabel)
  const tree = shallowRef([])
  const files = reactive(Object.create(null))
  const tabs = shallowRef([])
  const active = shallowRef('')
  const saveTimers = new Map()
  const writes = new Map()
  let polling
  let generation = 0
  let disposed = false

  const activeFile = computed(() => files[active.value])
  const isTest = (path) => props.testPaths.includes(path) || /^tests?\//.test(path)

  async function open(reset = false) {
    const current = ++generation
    clearInterval(polling)
    phase.value = 'opening'
    error.value = ''
    progress.value = t('Starting the container…')

    try {
      if (reset) {
        for (const path of saveTimers.keys()) cancelSave(path)
        await Promise.allSettled(writes.values())
      }
      if (disposed || current !== generation) return
      const data = await sandbox.open(props.wsId, props.language, props.seedFiles, {
        reset,
        onProgress(message) {
          if (!disposed && current === generation) progress.value = message
        },
      })
      if (disposed || current !== generation) return

      if (reset) {
        for (const path of Object.keys(files)) delete files[path]
        tabs.value = []
        active.value = ''
        saveError.value = ''
      }
      environment.value = data.env
      tree.value = data.files
      const first = tree.value.some((entry) => entry.path === props.mainFile)
        ? props.mainFile
        : tree.value.find((entry) => !entry.dir && !isTest(entry.path))?.path
      if (first) await openFile(first)
      if (disposed || current !== generation) return
      phase.value = 'ready'
      polling = setInterval(refresh, 2500)
    } catch (err) {
      if (disposed || current !== generation) return
      phase.value = 'error'
      error.value = err.message
    }
  }

  async function openFile(path) {
    const current = generation
    if (!files[path]) {
      const file = await sandbox.read(props.wsId, path)
      if (disposed || current !== generation) return
      files[path] ??= { content: file.content, mtime: file.mtime, dirty: false }
    }
    if (!tabs.value.includes(path)) tabs.value = [...tabs.value, path]
    active.value = path
  }

  function closeTab(path) {
    if (files[path]?.dirty) save(path).catch(reportSaveError)
    tabs.value = tabs.value.filter((tab) => tab !== path)
    if (active.value === path) active.value = tabs.value.at(-1) || ''
  }

  function cancelSave(path) {
    clearTimeout(saveTimers.get(path))
    saveTimers.delete(path)
  }

  function edit(path, value) {
    const file = files[path]
    if (phase.value === 'opening' || !file || file.content === value) return
    file.content = value
    file.dirty = true
    cancelSave(path)
    saveTimers.set(path, setTimeout(() => save(path).catch(reportSaveError), 500))
  }

  function reportSaveError(err) {
    saveError.value = err.message
  }

  async function save(path, current = generation) {
    if (phase.value === 'opening' || current !== generation) return
    cancelSave(path)
    const pending = writes.get(path)
    if (pending) {
      await pending
      if (current === generation) return save(path, current)
      return
    }
    const file = files[path]
    if (!file?.dirty) return
    const content = file.content
    const write = sandbox.write(props.wsId, path, content).then((result) => {
      if (files[path] !== file) return
      file.mtime = result.mtime
      if (file.content === content) file.dirty = false
      saveError.value = ''
    }).finally(() => writes.delete(path))
    writes.set(path, write)
    await write
  }

  async function flush() {
    await Promise.all(Object.keys(files).map((path) => save(path)))
  }

  async function refresh() {
    const current = generation
    try {
      const list = await sandbox.files(props.wsId)
      if (disposed || current !== generation) return
      tree.value = list
      for (const entry of list) {
        const file = files[entry.path]
        if (!file || file.dirty || !entry.mtime || Math.abs(entry.mtime - file.mtime) <= 1) continue
        const previousMtime = file.mtime
        const updated = await sandbox.read(props.wsId, entry.path)
        if (disposed || current !== generation) return
        if (!file.dirty && file.mtime === previousMtime) {
          Object.assign(file, { content: updated.content, mtime: updated.mtime })
        }
      }
    } catch {
      // The next poll retries if the container is temporarily unavailable.
    }
  }

  async function createFile(path) {
    await sandbox.write(props.wsId, path, '')
    await refresh()
    await openFile(path)
  }

  async function userFiles() {
    await flush()
    const list = tree.value.filter((entry) => !entry.dir && !isTest(entry.path) && (entry.size ?? 0) < 60_000)
    const result = []
    let budget = 120_000
    for (const entry of list) {
      const content = files[entry.path]?.content ?? (await sandbox.read(props.wsId, entry.path)).content
      if (content.length > budget) break
      budget -= content.length
      result.push({ path: entry.path, content })
    }
    return result
  }

  onMounted(() => open())
  onBeforeUnmount(() => {
    disposed = true
    clearInterval(polling)
    if (phase.value !== 'opening') flush().catch(reportSaveError)
  })

  return {
    phase, progress, error, saveError, environment, tree, tabs, active, files, activeFile,
    isTest, open, openFile, closeTab, edit, save, flush, refresh, createFile, userFiles,
  }
}
