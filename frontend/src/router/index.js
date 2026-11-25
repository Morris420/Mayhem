import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { guestOnly: true } },
    { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue'), meta: { guestOnly: true } },
    {
      // Everything behind the login lives inside the shared shell (header + nav).
      path: '/',
      component: () => import('@/layouts/AppShell.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: { name: 'dashboard' } },
        { path: 'dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
        { path: 'calendar', name: 'calendar', component: () => import('@/views/CalendarView.vue') },
        { path: 'nutrition', name: 'nutrition', component: () => import('@/views/NutritionView.vue') },
        { path: 'gym', name: 'gym', component: () => import('@/views/GymView.vue') },
        { path: 'briefcase', name: 'briefcase', component: () => import('@/views/BriefcaseView.vue') },
        { path: 'coach', name: 'coach', component: () => import('@/views/CoachView.vue') },
        { path: 'quests', name: 'quests', component: () => import('@/views/QuestBuilderView.vue') },
        // three.js + Rapier only load when you open this page, never with the rest of the app.
        { path: 'arena', name: 'arena', component: () => import('@/views/ArenaView.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

// Navigation guard: runs before every page change.
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.loaded) await auth.fetchUser()

  if (to.meta.requiresAuth && !auth.user) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.guestOnly && auth.user) {
    return { name: 'dashboard' }
  }
})

export default router
