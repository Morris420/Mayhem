import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, setUnauthorizedHandler } from '../api'

function jsonResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body }
}

describe('api client', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })
  afterEach(() => vi.unstubAllGlobals())

  it('fetches the CSRF cookie before a write and echoes it as a header', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.includes('/sanctum/csrf-cookie')) {
        document.cookie = 'XSRF-TOKEN=abc%3D123; path=/'
        return jsonResponse(204, null)
      }
      return jsonResponse(200, { ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    await api.post('/tasks', { title: 'x' })

    expect(fetchMock.mock.calls[0][0]).toContain('/sanctum/csrf-cookie')
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/tasks')
    expect(init.headers['X-XSRF-TOKEN']).toBe('abc=123') // URL-decoded
    expect(init.credentials).toBe('include')
  })

  it('throws ApiError carrying Laravel validation errors', async () => {
    document.cookie = 'XSRF-TOKEN=t; path=/'
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(422, { message: 'Invalid', errors: { title: ['Required'] } })))

    await expect(api.post('/tasks', {})).rejects.toMatchObject({ status: 422, errors: { title: ['Required'] } })
    await expect(api.post('/tasks', {})).rejects.toBeInstanceOf(ApiError)
  })

  it('calls the unauthorized handler on an expired session, but not for the /user probe', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { message: 'Unauthenticated.' })))

    await expect(api.get('/user')).rejects.toMatchObject({ status: 401 })
    expect(handler).not.toHaveBeenCalled() // logged-out visitor opening /register must stay put

    await expect(api.get('/tasks')).rejects.toMatchObject({ status: 401 })
    expect(handler).toHaveBeenCalledTimes(1)
    setUnauthorizedHandler(() => {})
  })

  it('does not fetch a CSRF cookie for GET requests', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { data: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await api.get('/tasks')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
