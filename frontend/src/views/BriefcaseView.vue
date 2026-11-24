<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import SystemPanel from '@/components/SystemPanel.vue'
import { api, describeError } from '@/lib/api'
import { useToastStore } from '@/stores/toasts'

const route = useRoute()
const router = useRouter()
const toasts = useToastStore()

const data = ref(null)
const loadError = ref('')
const busy = ref(false)
const view = ref(readView())
const menuFor = ref(null) // item id whose "..." menu is open
const renaming = ref(null) // { id, name }
const creating = ref(null) // folder name being typed, or null
const confirmId = ref(null)
const linkForm = ref(null) // { name, url } while the dialog is open
const moveFor = ref(null) // item being moved
const dragOver = ref(null) // 'files' | folder id | 'root' | null
const dragging = ref(null)
const fileInput = ref(null)
const replaceInput = ref(null)
const replaceTarget = ref(null)

const folderId = computed(() => (route.query.folder ? Number(route.query.folder) : null))

function readView() {
  try {
    return localStorage.getItem('briefcase-view') === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}
function setView(v) {
  view.value = v
  try {
    localStorage.setItem('briefcase-view', v)
  } catch {
    /* private mode: it just won't be remembered */
  }
}

async function load() {
  loadError.value = ''
  try {
    data.value = await api.get(`/briefcase${folderId.value ? `?folder=${folderId.value}` : ''}`)
  } catch (e) {
    if (e.status === 404 && folderId.value) return router.replace({ name: 'briefcase' })
    loadError.value = describeError(e)
  }
}
watch(folderId, () => {
  menuFor.value = renaming.value = creating.value = null
  load()
})

async function run(fn, success) {
  busy.value = true
  try {
    await fn()
    await load() // always re-read the folder you are looking at (a move changes a different folder)
    if (success) toasts.push({ title: success, kind: 'success', icon: 'check' })
  } catch (e) {
    const detail = e.errors ? Object.values(e.errors).flat().join(' ') : ''
    toasts.push({ title: 'That did not work', message: detail || describeError(e), kind: 'info', icon: 'alert', duration: 7000 })
    await load().catch(() => {})
  } finally {
    busy.value = false
  }
}

// --- opening things ------------------------------------------------------
function open(item) {
  if (renaming.value) return
  if (item.kind === 'folder') return router.push({ name: 'briefcase', query: { folder: item.id } })
  if (item.kind === 'link') return window.open(item.url, '_blank', 'noopener')
  window.open(`/api/briefcase/${item.id}/file`, '_blank', 'noopener')
}
// Hands a short-lived address to your installed Office app (needs Microsoft Office on this computer).
const OFFICE = {
  xlsx: ['ms-excel', 'Excel'], xlsm: ['ms-excel', 'Excel'], xls: ['ms-excel', 'Excel'], xlsb: ['ms-excel', 'Excel'], csv: ['ms-excel', 'Excel'],
  docx: ['ms-word', 'Word'], doc: ['ms-word', 'Word'], pptx: ['ms-powerpoint', 'PowerPoint'], ppt: ['ms-powerpoint', 'PowerPoint'],
}
const officeApp = (item) => (item.kind === 'file' && OFFICE[item.extension] ? { scheme: OFFICE[item.extension][0], label: OFFICE[item.extension][1] } : null)
async function openInApp(item) {
  menuFor.value = null
  try {
    const { url } = await api.get(`/briefcase/${item.id}/open-link`)
    window.location.href = `${officeApp(item).scheme}:ofe|u|${url}`
    toasts.push({ title: `Opening in ${officeApp(item).label}…`, message: 'If nothing happens, your browser or Office may not allow it. Use Download instead.', kind: 'info', icon: 'sheet', duration: 6000 })
  } catch (e) {
    toasts.push({ title: 'Could not open', message: describeError(e), kind: 'info', icon: 'alert' })
  }
}
const downloadUrl = (item) => `/api/briefcase/${item.id}/file?download=1`
const goTo = (id) => router.push(id ? { name: 'briefcase', query: { folder: id } } : { name: 'briefcase' })

// --- creating ----------------------------------------------------------
async function startFolder() {
  creating.value = 'New folder'
  await nextTick()
  const el = document.getElementById('new-folder-input')
  el?.focus()
  el?.select()
}
async function saveFolder() {
  const name = (creating.value ?? '').trim()
  creating.value = null
  if (name) await run(() => api.post('/briefcase/folders', { name, parent_id: folderId.value }), 'Folder created')
}

async function saveLink() {
  const f = linkForm.value
  if (!f.name.trim() || !f.url.trim()) return
  await run(() => api.post('/briefcase/links', { name: f.name.trim(), url: f.url.trim(), parent_id: folderId.value }), 'Link added')
  if (!busy.value) linkForm.value = null
}

async function upload(fileList) {
  const files = [...fileList]
  if (!files.length) return
  const form = new FormData()
  files.forEach((f) => form.append('files[]', f))
  if (folderId.value) form.append('parent_id', folderId.value)
  await run(() => api.post('/briefcase/files', form), files.length === 1 ? 'File uploaded' : `${files.length} files uploaded`)
}
function onPick(e) {
  upload(e.target.files)
  e.target.value = ''
}

function pickReplace(item) {
  replaceTarget.value = item
  menuFor.value = null
  replaceInput.value?.click()
}
async function onReplace(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file || !replaceTarget.value) return
  const form = new FormData()
  form.append('file', file)
  await run(() => api.post(`/briefcase/${replaceTarget.value.id}/replace`, form), 'New version saved')
}

// --- rename / move / delete ---------------------------------------------
async function startRename(item) {
  menuFor.value = null
  renaming.value = { id: item.id, name: item.name }
  await nextTick()
  const el = document.getElementById('rename-input')
  el?.focus()
  el?.select()
}
async function saveRename() {
  const r = renaming.value
  renaming.value = null
  if (r && r.name.trim() && r.name.trim() !== data.value.items.find((i) => i.id === r.id)?.name) {
    await run(() => api.put(`/briefcase/${r.id}`, { name: r.name.trim() }), 'Renamed')
  }
}

async function moveTo(itemId, parentId) {
  moveFor.value = null
  if (itemId === parentId) return
  await run(() => api.put(`/briefcase/${itemId}`, { parent_id: parentId }), 'Moved')
}

function remove(item) {
  if (confirmId.value !== item.id) {
    confirmId.value = item.id
    setTimeout(() => confirmId.value === item.id && (confirmId.value = null), 3000)
    return
  }
  confirmId.value = null
  menuFor.value = null
  run(() => api.delete(`/briefcase/${item.id}`), item.kind === 'folder' ? 'Folder deleted' : 'Deleted')
}

// --- drag and drop ---------------------------------------------------------
const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files')

function onDragStart(e, item) {
  dragging.value = item.id
  e.dataTransfer.setData('text/x-briefcase', String(item.id))
  e.dataTransfer.effectAllowed = 'move'
}
function onDragEnd() {
  dragging.value = null
  dragOver.value = null
}
function overArea(e) {
  if (hasFiles(e)) {
    e.preventDefault()
    dragOver.value = 'files'
  }
}
function leaveArea(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) dragOver.value = null
}
function dropArea(e) {
  dragOver.value = null
  if (hasFiles(e)) {
    e.preventDefault()
    upload(e.dataTransfer.files)
  }
}
function overTarget(e, id) {
  if (dragging.value && dragging.value !== id) {
    e.preventDefault()
    e.stopPropagation()
    dragOver.value = id
  }
}
function dropTarget(e, parentId) {
  e.preventDefault()
  e.stopPropagation()
  const id = dragging.value
  dragging.value = dragOver.value = null
  if (id) moveTo(id, parentId)
}

// --- display helpers ---------------------------------------------------------
function look(item) {
  if (item.kind === 'folder') return { icon: 'folder', tone: 'text-amber-300 bg-amber-400/10', label: 'Folder' }
  if (item.kind === 'link') return { icon: 'link', tone: 'text-cyan-300 bg-cyan-400/10', label: 'Link' }
  const e = item.extension
  if (['xlsx', 'xlsm', 'xls', 'xlsb', 'csv', 'ods', 'numbers'].includes(e)) return { icon: 'sheet', tone: 'text-emerald-300 bg-emerald-400/10', label: e.toUpperCase() }
  if (e === 'pdf') return { icon: 'file', tone: 'text-rose-300 bg-rose-400/10', label: 'PDF' }
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md'].includes(e)) return { icon: 'file', tone: 'text-sky-300 bg-sky-400/10', label: e.toUpperCase() }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(e)) return { icon: 'image', tone: 'text-violet-300 bg-violet-400/10', label: e.toUpperCase() }
  if (e === 'zip') return { icon: 'archive', tone: 'text-amber-300 bg-amber-400/10', label: 'ZIP' }
  return { icon: 'file', tone: 'text-slate-300 bg-slate-400/10', label: e?.toUpperCase() ?? 'File' }
}
function bytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${Math.round(n / 1024)} KB`
  return `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`
}
const when = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const kindText = (i) => (i.kind === 'folder' ? `${i.count} item${i.count === 1 ? '' : 's'}` : i.kind === 'link' ? 'Online document' : `${look(i).label} · ${bytes(i.size)}`)
const usagePct = computed(() => (data.value ? Math.min(100, (data.value.usage.bytes / data.value.usage.quota) * 100) : 0))

function onDocClick(e) {
  if (!e.target.closest('[data-menu]')) menuFor.value = null
}
function onKey(e) {
  if (e.key === 'Escape') {
    menuFor.value = null
    linkForm.value = null
    moveFor.value = null
  }
}

onMounted(() => {
  load()
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})

const input = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none'
</script>

<template>
  <div v-if="loadError" class="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center text-sm text-red-300">
    {{ loadError }} <button type="button" class="ml-3 underline" @click="load">Retry</button>
  </div>
  <div v-else-if="!data" class="animate-pulse rounded-xl border border-slate-800 bg-slate-900/50 p-10 text-center text-sm text-slate-500">Loading…</div>

  <template v-else>
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold text-white">Briefcase</h1>
        <p class="text-sm text-slate-400">Your files, kept private. Spreadsheets open in Excel, PDFs and images open right here.</p>
      </div>
      <div class="w-full text-xs text-slate-400 sm:w-56">
        <div class="mb-1 flex justify-between"><span>Storage</span><span>{{ bytes(data.usage.bytes) }} of {{ bytes(data.usage.quota) }}</span></div>
        <div class="h-1.5 overflow-hidden rounded-full bg-slate-800"><div class="h-full rounded-full bg-cyan-400" :style="{ width: usagePct + '%' }"></div></div>
      </div>
    </div>

    <SystemPanel>
      <!-- toolbar -->
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Folder path" class="flex min-w-0 flex-wrap items-center gap-1 text-sm">
          <button type="button" class="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-slate-800" :class="[dragOver === 'root' ? 'bg-cyan-500/20 text-cyan-200' : data.folder ? 'text-slate-400' : 'font-semibold text-white']" @click="goTo(null)" @dragover="overTarget($event, 'root')" @dragleave="dragOver = null" @drop="dropTarget($event, null)">
            <AppIcon name="briefcase" class="h-4 w-4" />Briefcase
          </button>
          <template v-for="c in data.breadcrumbs" :key="c.id">
            <AppIcon name="chevron-right" class="h-3.5 w-3.5 text-slate-600" />
            <button type="button" class="rounded-md px-2 py-1 hover:bg-slate-800" :class="[dragOver === c.id ? 'bg-cyan-500/20 text-cyan-200' : c.id === folderId ? 'font-semibold text-white' : 'text-slate-400']" @click="goTo(c.id)" @dragover="overTarget($event, c.id)" @dragleave="dragOver = null" @drop="dropTarget($event, c.id)">{{ c.name }}</button>
          </template>
        </nav>

        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50" :disabled="busy" @click="fileInput.click()"><AppIcon name="upload" class="h-4 w-4" />Upload</button>
          <button type="button" class="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500" @click="startFolder"><AppIcon name="folder-plus" class="h-4 w-4" /><span class="hidden sm:inline">New folder</span></button>
          <button type="button" class="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500" @click="linkForm = { name: '', url: '' }"><AppIcon name="link" class="h-4 w-4" /><span class="hidden sm:inline">Add link</span></button>
          <div class="flex overflow-hidden rounded-lg border border-slate-700" role="group" aria-label="View">
            <button type="button" class="p-2" :class="view === 'grid' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'" aria-label="Icon view" :aria-pressed="view === 'grid'" @click="setView('grid')"><AppIcon name="grid" class="h-4 w-4" /></button>
            <button type="button" class="p-2" :class="view === 'list' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'" aria-label="List view" :aria-pressed="view === 'list'" @click="setView('list')"><AppIcon name="list" class="h-4 w-4" /></button>
          </div>
        </div>
        <input ref="fileInput" type="file" multiple class="hidden" aria-label="Upload files" :accept="data.allowed.map((e) => '.' + e).join(',')" @change="onPick" />
        <input ref="replaceInput" type="file" class="hidden" aria-label="Upload a new version" @change="onReplace" />
      </div>

      <!-- the folder contents / drop zone -->
      <div class="relative min-h-64 rounded-lg border-2 border-dashed transition-colors" :class="dragOver === 'files' ? 'border-cyan-400 bg-cyan-500/5' : 'border-transparent'" @dragover="overArea" @dragleave="leaveArea" @drop="dropArea">
        <div v-if="dragOver === 'files'" class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm font-medium text-cyan-200">Drop to upload into {{ data.folder?.name ?? 'Briefcase' }}</div>

        <p v-if="!data.items.length && creating === null" class="flex h-64 flex-col items-center justify-center gap-2 text-center text-sm text-slate-500">
          <AppIcon name="briefcase" class="h-8 w-8 text-slate-600" />
          <span>This folder is empty.<br />Drop an Excel sheet here, or press <strong class="text-slate-300">Upload</strong>.</span>
        </p>

        <!-- icon view -->
        <ul v-if="view === 'grid'" class="grid grid-cols-2 gap-3 p-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          <li v-if="creating !== null" class="flex flex-col items-center gap-2 rounded-xl border border-cyan-500/50 p-3">
            <span class="rounded-xl bg-amber-400/10 p-3 text-amber-300"><AppIcon name="folder" class="h-8 w-8" /></span>
            <input id="new-folder-input" v-model="creating" class="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-center text-sm" maxlength="80" aria-label="Folder name" @keydown.enter="saveFolder" @keydown.esc="creating = null" @blur="saveFolder" />
          </li>
          <li v-for="i in data.items" :key="i.id" class="group relative" :data-testid="`item-${i.kind}`">
            <div class="flex h-full flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors" :class="dragOver === i.id ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600 hover:bg-slate-800/60'" :draggable="renaming?.id !== i.id" @dragstart="onDragStart($event, i)" @dragend="onDragEnd" @dragover="i.kind === 'folder' && overTarget($event, i.id)" @dragleave="dragOver = null" @drop="i.kind === 'folder' && dropTarget($event, i.id)">
              <button type="button" class="flex w-full flex-col items-center gap-2" :aria-label="`Open ${i.name}`" @click="open(i)">
                <span class="rounded-xl p-3" :class="look(i).tone"><AppIcon :name="look(i).icon" class="h-8 w-8" /></span>
              </button>
              <input v-if="renaming?.id === i.id" id="rename-input" v-model="renaming.name" class="w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-center text-sm" maxlength="80" aria-label="New name" @keydown.enter="saveRename" @keydown.esc="renaming = null" @blur="saveRename" />
              <button v-else type="button" class="w-full min-w-0 text-center" @click="open(i)">
                <span class="line-clamp-2 text-sm break-words text-slate-100">{{ i.name }}</span>
                <span class="mt-0.5 block text-[11px] text-slate-500">{{ kindText(i) }}<template v-if="i.version > 1"> · v{{ i.version }}</template></span>
              </button>
            </div>

            <div class="absolute top-1.5 right-1.5" data-menu>
              <button type="button" class="rounded-md bg-slate-950/70 p-1 text-slate-400 opacity-100 hover:text-white sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100" :class="menuFor === i.id && 'sm:!opacity-100'" :aria-label="`Actions for ${i.name}`" :aria-expanded="menuFor === i.id" @click.stop="menuFor = menuFor === i.id ? null : i.id"><AppIcon name="more" class="h-4 w-4" /></button>
              <div v-if="menuFor === i.id" class="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 py-1 text-sm shadow-xl" role="menu">
                <button type="button" role="menuitem" class="block w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800" @click="open(i)">Open</button>
                <a v-if="i.kind === 'file'" role="menuitem" :href="downloadUrl(i)" class="block px-3 py-1.5 text-slate-200 hover:bg-slate-800" @click="menuFor = null">Download</a>
                <button type="button" role="menuitem" class="block w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800" @click="startRename(i)">Rename</button>
                <button type="button" role="menuitem" class="block w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800" @click="moveFor = i; menuFor = null">Move to…</button>
                <button v-if="officeApp(i)" type="button" role="menuitem" class="block w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800" @click="openInApp(i)">Open in {{ officeApp(i).label }} <span class="text-[10px] text-slate-500">(beta)</span></button>
                <button v-if="i.kind === 'file'" type="button" role="menuitem" class="block w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800" @click="pickReplace(i)">Upload new version</button>
                <button type="button" role="menuitem" class="block w-full px-3 py-1.5 text-left hover:bg-slate-800" :class="confirmId === i.id ? 'bg-red-500/20 text-red-200' : 'text-red-300'" @click="remove(i)">{{ confirmId === i.id ? (i.kind === 'folder' ? 'Sure? Deletes everything inside' : 'Sure?') : 'Delete' }}</button>
              </div>
            </div>
          </li>
        </ul>

        <!-- list view -->
        <ul v-else class="divide-y divide-slate-800/80 p-1">
          <li v-if="creating !== null" class="flex items-center gap-3 px-2 py-2">
            <span class="rounded-lg bg-amber-400/10 p-1.5 text-amber-300"><AppIcon name="folder" class="h-5 w-5" /></span>
            <input id="new-folder-input" v-model="creating" class="w-64 max-w-full rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm" maxlength="80" aria-label="Folder name" @keydown.enter="saveFolder" @keydown.esc="creating = null" @blur="saveFolder" />
          </li>
          <li v-for="i in data.items" :key="i.id" class="group relative flex items-center gap-3 rounded-lg px-2 py-2 transition-colors" :class="dragOver === i.id ? 'bg-cyan-500/10' : 'hover:bg-slate-800/50'" :draggable="renaming?.id !== i.id" :data-testid="`item-${i.kind}`" @dragstart="onDragStart($event, i)" @dragend="onDragEnd" @dragover="i.kind === 'folder' && overTarget($event, i.id)" @dragleave="dragOver = null" @drop="i.kind === 'folder' && dropTarget($event, i.id)">
            <span class="rounded-lg p-1.5" :class="look(i).tone"><AppIcon :name="look(i).icon" class="h-5 w-5" /></span>
            <input v-if="renaming?.id === i.id" id="rename-input" v-model="renaming.name" class="min-w-0 flex-1 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm" maxlength="80" aria-label="New name" @keydown.enter="saveRename" @keydown.esc="renaming = null" @blur="saveRename" />
            <button v-else type="button" class="min-w-0 flex-1 truncate text-left text-sm text-slate-100" :aria-label="`Open ${i.name}`" @click="open(i)">{{ i.name }}<span v-if="i.version > 1" class="ml-2 text-xs text-slate-500">v{{ i.version }}</span></button>
            <span class="hidden w-40 shrink-0 text-xs text-slate-500 sm:block">{{ kindText(i) }}</span>
            <span class="hidden w-28 shrink-0 text-xs text-slate-500 md:block">{{ when(i.updated_at) }}</span>
            <div class="relative" data-menu>
              <button type="button" class="rounded-md p-1 text-slate-400 hover:text-white" :aria-label="`Actions for ${i.name}`" :aria-expanded="menuFor === i.id" @click.stop="menuFor = menuFor === i.id ? null : i.id"><AppIcon name="more" class="h-4 w-4" /></button>
              <div v-if="menuFor === i.id" class="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 py-1 text-sm shadow-xl" role="menu">
                <button type="button" role="menuitem" class="block w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800" @click="open(i)">Open</button>
                <a v-if="i.kind === 'file'" role="menuitem" :href="downloadUrl(i)" class="block px-3 py-1.5 text-slate-200 hover:bg-slate-800" @click="menuFor = null">Download</a>
                <button type="button" role="menuitem" class="block w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800" @click="startRename(i)">Rename</button>
                <button type="button" role="menuitem" class="block w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800" @click="moveFor = i; menuFor = null">Move to…</button>
                <button v-if="officeApp(i)" type="button" role="menuitem" class="block w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800" @click="openInApp(i)">Open in {{ officeApp(i).label }} <span class="text-[10px] text-slate-500">(beta)</span></button>
                <button v-if="i.kind === 'file'" type="button" role="menuitem" class="block w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800" @click="pickReplace(i)">Upload new version</button>
                <button type="button" role="menuitem" class="block w-full px-3 py-1.5 text-left hover:bg-slate-800" :class="confirmId === i.id ? 'bg-red-500/20 text-red-200' : 'text-red-300'" @click="remove(i)">{{ confirmId === i.id ? (i.kind === 'folder' ? 'Sure? Deletes everything inside' : 'Sure?') : 'Delete' }}</button>
              </div>
            </div>
          </li>
        </ul>
      </div>

      <p class="mt-3 text-xs text-slate-500">Up to {{ data.usage.max_file_mb }} MB per file. Tip: for a sheet you edit every day, add a <strong class="text-slate-400">link</strong> to its Google Sheets page instead of uploading copies: it opens and saves online, with nothing to keep in sync.</p>
    </SystemPanel>

    <!-- add link -->
    <div v-if="linkForm" class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4" @click.self="linkForm = null">
      <form class="w-full max-w-md space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5" role="dialog" aria-modal="true" aria-label="Add link" @submit.prevent="saveLink">
        <h2 class="text-base font-semibold text-white">Add a link</h2>
        <label class="block"><span class="mb-1 block text-xs text-slate-400">Name</span><input v-model="linkForm.name" :class="input" maxlength="80" placeholder="Budget 2026 (Google Sheets)" aria-label="Link name" /></label>
        <label class="block"><span class="mb-1 block text-xs text-slate-400">Address</span><input v-model="linkForm.url" :class="input" type="url" placeholder="https://docs.google.com/spreadsheets/d/…" aria-label="Link address" /></label>
        <div class="flex justify-end gap-2">
          <button type="button" class="px-3 py-2 text-sm text-slate-400 hover:text-white" @click="linkForm = null">Cancel</button>
          <button type="submit" :disabled="!linkForm.name.trim() || !linkForm.url.trim() || busy" class="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50">Add link</button>
        </div>
      </form>
    </div>

    <!-- move to -->
    <div v-if="moveFor" class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4" @click.self="moveFor = null">
      <div class="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5" role="dialog" aria-modal="true" :aria-label="`Move ${moveFor.name}`">
        <h2 class="mb-3 text-base font-semibold text-white">Move “{{ moveFor.name }}” to…</h2>
        <ul class="max-h-72 space-y-1 overflow-y-auto">
          <li><button type="button" class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800" @click="moveTo(moveFor.id, null)"><AppIcon name="briefcase" class="h-4 w-4 text-slate-400" />Briefcase (top level)</button></li>
          <li v-for="f in data.folders.filter((x) => x.id !== moveFor.id)" :key="f.id"><button type="button" class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800" @click="moveTo(moveFor.id, f.id)"><AppIcon name="folder" class="h-4 w-4 text-amber-300" />{{ f.path }}</button></li>
        </ul>
        <div class="mt-4 text-right"><button type="button" class="px-3 py-2 text-sm text-slate-400 hover:text-white" @click="moveFor = null">Cancel</button></div>
      </div>
    </div>
  </template>
</template>
