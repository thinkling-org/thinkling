import { createApp, watchEffect } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource-variable/nunito'
import '@fontsource-variable/jetbrains-mono'
import './styles/base.css'
import App from './App.vue'
import { router } from './router.ts'
import { useApp } from './stores/app.ts'
import { configureLocale, uiLocale } from './lib/i18n.ts'
import { loadInstalledBlocks } from './blocks/installed.ts'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

const store = useApp(pinia)
configureLocale(() => store.settings.locale)
window.flushThinklingSave = () => store.saveNow()

// Plugins load in parallel with the saved state. A slow plugin must not hold the app
// back: lessons pick it up when it arrives, because the installed blocks are reactive.
const plugins = Promise.race([loadInstalledBlocks(), new Promise((resolve) => setTimeout(resolve, 3_000))])

store.load()
  .finally(() => plugins)
  .finally(() => {
    watchEffect(() => { document.documentElement.lang = uiLocale() })
    app.use(router)
    app.mount('#app')
  })
