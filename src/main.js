import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource-variable/nunito'
import '@fontsource-variable/jetbrains-mono'
import './styles/base.css'
import App from './App.vue'
import { router } from './router.js'
import { useApp } from './stores/app.js'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

useApp(pinia)
  .load()
  .finally(() => {
    app.use(router)
    app.mount('#app')
  })
