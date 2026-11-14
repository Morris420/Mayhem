<script setup>
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AuthLayout from '@/layouts/AuthLayout.vue'
import AppIcon from '@/components/AppIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/lib/api'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const confirmation = ref('')
const showPassword = ref(false)
const submitting = ref(false)
const errors = ref({}) // field -> [messages], straight from Laravel's validation
const generalError = ref('')

const inputClass =
  'w-full rounded-xl border border-cyan-500/30 bg-slate-950/80 py-3 pl-10 font-mono text-sm text-cyan-100 shadow-inner transition-all placeholder:text-cyan-900 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 focus:outline-none'

const mismatch = computed(() => confirmation.value && password.value !== confirmation.value)
const canSubmit = computed(
  () => username.value.length >= 3 && password.value.length >= 6 && !mismatch.value && !submitting.value,
)

async function submit() {
  errors.value = {}
  generalError.value = ''
  submitting.value = true
  try {
    await auth.register(username.value.trim(), password.value, confirmation.value)
    await router.push(typeof route.query.redirect === 'string' ? route.query.redirect : { name: 'dashboard' })
  } catch (e) {
    if (e instanceof ApiError && e.status === 422) errors.value = e.errors
    else generalError.value = e instanceof ApiError ? e.message : 'Cannot reach the System. Is the Laravel server running?'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthLayout>
    <form class="space-y-5" @submit.prevent="submit">
      <div class="space-y-1.5">
        <label for="username" class="flex items-center justify-between font-mono text-xs tracking-wider text-cyan-300/80 uppercase">
          <span>Choose hunter name</span>
          <span class="text-[10px] text-cyan-500/60">3–20 · letters, numbers, - _</span>
        </label>
        <div class="relative">
          <AppIcon name="user" class="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-cyan-500/60" />
          <input id="username" v-model="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" placeholder="e.g. shadow_monarch" :class="[inputClass, 'pr-4']" />
        </div>
        <p v-for="m in errors.username" :key="m" class="font-mono text-[11px] text-red-300">⚠ {{ m }}</p>
      </div>

      <div class="space-y-1.5">
        <label for="password" class="flex items-center justify-between font-mono text-xs tracking-wider text-cyan-300/80 uppercase">
          <span>Access passcode</span>
          <span class="text-[10px] text-cyan-500/60">MIN 6 CHARS</span>
        </label>
        <div class="relative">
          <AppIcon name="lock" class="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-cyan-500/60" />
          <input id="password" v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="••••••••••••" :class="[inputClass, 'pr-10']" />
          <button type="button" class="absolute inset-y-0 right-0 flex items-center pr-3.5 text-cyan-500/60 hover:text-cyan-300" :aria-label="showPassword ? 'Hide passcode' : 'Show passcode'" @click="showPassword = !showPassword">
            <AppIcon :name="showPassword ? 'eye-off' : 'eye'" class="h-4 w-4" />
          </button>
        </div>
        <p v-for="m in errors.password" :key="m" class="font-mono text-[11px] text-red-300">⚠ {{ m }}</p>
      </div>

      <div class="space-y-1.5">
        <label for="confirmation" class="block font-mono text-xs tracking-wider text-cyan-300/80 uppercase">Confirm passcode</label>
        <div class="relative">
          <AppIcon name="lock" class="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-cyan-500/60" />
          <input id="confirmation" v-model="confirmation" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="••••••••••••" :class="[inputClass, 'pr-4']" />
        </div>
        <p v-if="mismatch" class="font-mono text-[11px] text-amber-300">⚠ Passcodes do not match yet.</p>
      </div>

      <p v-if="generalError" role="alert" class="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 font-mono text-xs text-red-300">⚠ {{ generalError }}</p>

      <button type="submit" :disabled="!canSubmit" class="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl bg-gradient-to-r from-cyan-400 via-cyan-300 to-blue-400 px-6 py-4 font-mono text-sm font-black tracking-widest text-slate-950 uppercase shadow-[0_0_30px_rgba(34,211,238,0.5)] transition-all duration-200 hover:shadow-[0_0_45px_rgba(34,211,238,0.8)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none">
        <span class="relative z-10 flex items-center gap-2">
          {{ submitting ? 'Awakening…' : 'Awaken hunter' }}
          <AppIcon name="zap" class="h-4 w-4 fill-current" />
        </span>
        <span class="absolute inset-0 -translate-x-full -skew-x-12 bg-white/30 transition-transform duration-1000 group-hover:translate-x-full"></span>
      </button>
    </form>

    <p class="mt-6 text-center font-mono text-xs text-slate-400">
      ALREADY AWAKENED?
      <RouterLink :to="{ name: 'login', query: route.query }" class="ml-1 font-bold tracking-wider text-cyan-400 uppercase underline transition-colors hover:text-cyan-300">Return to login</RouterLink>
    </p>
  </AuthLayout>
</template>
