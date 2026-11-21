// Tiny API client built on fetch (no extra dependency).
//
// Laravel Sanctum's SPA login works with cookies:
//   1. GET /sanctum/csrf-cookie  -> Laravel sets an XSRF-TOKEN cookie
//   2. every write request echoes that cookie back in an X-XSRF-TOKEN header
//   3. the browser keeps the session cookie for us (credentials: 'include')
// Everything below exists to do those three things for you.

const BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.message || `Request failed (${status})`)
    this.status = status
    this.errors = data?.errors || {}
  }
}

let onUnauthorized = () => {}
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

function xsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

async function refreshCsrf() {
  await fetch(`${BASE}/sanctum/csrf-cookie`, { credentials: 'include' })
}

async function request(method, path, body, { retry = true } = {}) {
  const isWrite = method !== 'GET'
  if (isWrite && !xsrfToken()) await refreshCsrf()

  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = xsrfToken()
  if (token) headers['X-XSRF-TOKEN'] = token

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  // 419 = CSRF token expired/mismatch: fetch a fresh cookie and try once more.
  if (res.status === 419 && retry) {
    await refreshCsrf()
    return request(method, path, body, { retry: false })
  }

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    // A 401 on a normal request means our session expired. But a wrong password
    // (/login) and the "who am I?" probe (/user, used by the router guard on every
    // page load) are *expected* to 401 for logged-out visitors - don't redirect for those.
    if (res.status === 401 && path !== '/login' && path !== '/user') onUnauthorized()
    throw new ApiError(res.status, data)
  }
  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  put: (path, body = {}) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),
}

/** Turns any failure into a sentence that says what actually went wrong. */
export function describeError(e) {
  if (e instanceof ApiError) {
    if (e.status >= 500) {
      return `The server hit an error (${e.status}): ${e.message}. If you just pulled new code, run "php artisan migrate" in the backend folder.`
    }
    return e.message
  }
  return 'Cannot reach the Laravel server. Check that "php artisan serve" (or XAMPP) is running.'
}
