import { createApp, watchEffect } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource-variable/nunito'
import '@fontsource-variable/jetbrains-mono'
import './styles/base.css'
import App from './App.vue'
import { router } from './router.ts'
import { useApp } from './stores/app.ts'
import { configureLocale, uiLocale } from './lib/i18n.ts'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

const store = useApp(pinia)
configureLocale(() => store.settings.locale)
window.flushCodenomsSave = () => store.flushSave()

store.load()
  .finally(() => {
    watchEffect(() => { document.documentElement.lang = uiLocale() })
    app.use(router)
    app.mount('#app')
  })
