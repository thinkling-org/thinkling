import { createRouter, createWebHistory } from 'vue-router'
import { useApp } from './stores/app.js'

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', redirect: () => (useApp().plan ? '/path' : '/start') },
    { path: '/start', component: () => import('./views/StartView.vue') },
    { path: '/plan', component: () => import('./views/PlanView.vue') },
    { path: '/path', component: () => import('./views/PathView.vue'), meta: { needsPlan: true } },
    { path: '/lesson/:id', component: () => import('./views/LessonView.vue'), meta: { needsPlan: true } },
    { path: '/flashcards', component: () => import('./views/FlashcardsView.vue') },
    { path: '/review', component: () => import('./views/ReviewView.vue') },
    { path: '/settings', component: () => import('./views/SettingsView.vue') },
    { path: '/sandbox', component: () => import('./views/PlaygroundView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const app = useApp()
  if (to.meta.needsPlan && !app.plan) return '/start'
  if (to.path === '/plan' && !app.plan && app.gen.status === 'idle') return '/start'
})
