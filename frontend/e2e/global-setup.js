// Registers one hunter for the whole run and saves the logged-in cookies, so each
// test starts signed in without hitting the register throttle (10 per minute).
import { mkdirSync } from 'node:fs'
import { request } from '@playwright/test'

export default async function globalSetup(config) {
  const { baseURL, storageState } = config.projects[0].use
  mkdirSync(new URL('./.auth/', import.meta.url), { recursive: true })

  // Sanctum only treats a request as a browser session (cookies + CSRF) when it
  // comes from a stateful domain, which it reads from Origin / Referer.
  const ctx = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL, Referer: `${baseURL}/` },
  })
  await ctx.get('/sanctum/csrf-cookie')
  const xsrf = (await ctx.storageState()).cookies.find((c) => c.name === 'XSRF-TOKEN')
  if (!xsrf)
    throw new Error('No XSRF-TOKEN cookie: is the backend up and SANCTUM_STATEFUL_DOMAINS right?')

  const res = await ctx.post('/api/register', {
    headers: { Accept: 'application/json', 'X-XSRF-TOKEN': decodeURIComponent(xsrf.value) },
    data: {
      username: 'e2e_hunter',
      password: 'arena-test-pass-1',
      password_confirmation: 'arena-test-pass-1',
    },
  })
  if (!res.ok()) throw new Error(`Register failed: ${res.status()} ${await res.text()}`)

  await ctx.storageState({ path: storageState })
  await ctx.dispose()
}
