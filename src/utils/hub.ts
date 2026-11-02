/**
 * CF-Server-Monitor adapter.
 *
 * The UI components keep the original Doraemon Probe data model. This module
 * translates CFSM REST/WebSocket payloads into that model.
 */
import type { Client, NodeStatus } from '@/utils/rpc'
import { getTurnstileHeaders, setVerifiedCredential } from '@/utils/turnstile'
import manifest from '../../theme.json'

const LOAD_SEPARATOR_REGEX = /[,\s]+/
const COMMA_REGEX = /,/g
const TRAFFIC_LIMIT_REGEX = /^([\d.]+)\s*(B|KB|KIB|MB|MIB|GB|GIB|TB|TIB)?$/i
const MONTH_CYCLE_REGEX = /^\d+m$/
const DETAIL_ROUTE_REGEX = /^#\/server\/([^/?#]+)/
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/
const MONTH_SUFFIX_REGEX = /m$/
const CURRENCY_SYMBOL_REGEX = /^(?:[¥￥$€£₽₣₹₫฿]|HK\$|CA\$)$/

export interface HubMetrics {
  uptime?: number
  cpu?: number
  load?: number[]
  mem_total?: number
  mem_used?: number
  swap_total?: number
  swap_used?: number
  disk_total?: number
  disk_used?: number
  net_rx?: number
  net_tx?: number
  tcp?: number
  udp?: number
  procs?: number
  total_rx?: number
  total_tx?: number
  month_rx?: number
  month_tx?: number
  gpu_info?: Array<{ id?: string, name?: string, info?: number | null }>
  ping?: Record<string, number | null | false>
  loss?: Record<string, number | null | false>
}

export interface HubNode {
  id: string | number
  name: string
  country?: string
  group?: string
  sort?: number
  public?: boolean
  online?: boolean
  last_seen?: number
  metrics?: HubMetrics | null
  os?: string
  kernel?: string
  arch?: string
  virt?: string
  cpu_name?: string
  cpu_cores?: number
  mem_total?: number
  swap_total?: number
  disk_total?: number
  agent_version?: string
  price?: number
  currency?: string
  billing_cycle?: string
  expires_at?: string | null
  expires_in?: number | null
  traffic_limit?: number
  traffic_mode?: string
  traffic_reset_day?: number
  total_rx?: number
  total_tx?: number
  month_rx?: number
  month_tx?: number
  month_used?: number
  month_start?: number
  day_rx?: number
  day_tx?: number
  hostname?: string
  ipv4?: string
  ipv6?: string
  addresses?: Array<{ address: string, source: string }>
  remark?: string
  tags?: string
  gpu_info?: HubMetrics['gpu_info']
}

export interface HubSnapshot {
  nodes: HubNode[]
  admin?: boolean
}

export interface HubMetricRow {
  ts: number
  cpu: number
  mem_used: number
  disk_used: number
  net_rx: number
  net_tx: number
  net_rx_max?: number
  net_tx_max?: number
}

export interface HubPingRow {
  task_id: number
  ts: number
  latency: number | null
  band?: [number, number]
  loss?: number
}

export interface HubHistory {
  metrics: HubMetricRow[]
  ping: HubPingRow[]
  probes: Record<string, string>
  loss: Record<string, number>
}

export interface HubMe {
  authed: boolean
  site_name?: string
  public_page?: boolean
  version?: string
  theme_options?: Record<string, unknown>
  is_public?: boolean
  turnstile_enabled?: boolean
  turnstile_site_key?: string
  turnstile_verified?: string | null
}

export class HubError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'HubError'
  }
}

type CfsmServer = Record<string, any> & {
  id: string
  name: string
  last_updated?: number
  timestamp?: number
  is_online?: boolean
}

interface CfsmConfig extends Record<string, any> {
  authorization?: boolean
  is_public?: boolean
  site_title?: string
  version?: string
  theme_options?: Record<string, unknown>
  long_history_points?: number
  custom_ct_name?: string
  custom_cu_name?: string
  custom_cm_name?: string
  custom_bd_name?: string
}

async function readError(res: Response): Promise<HubError> {
  let body = ''
  try {
    body = (await res.text()).trim()
  }
  catch {}
  let message = body
  try {
    message = JSON.parse(body)?.error || JSON.parse(body)?.message || body
  }
  catch {}
  return new HubError(res.status, message || `HTTP ${res.status}`)
}

function authHeaders(): Record<string, string> {
  try {
    const token = localStorage.getItem('jwt_token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    signal,
    headers: { accept: 'application/json', ...authHeaders(), ...getTurnstileHeaders() },
  })
  if (!res.ok) throw await readError(res)
  return await res.json() as T
}

let siteConfigCache: { at: number, value: CfsmConfig } | null = null
export async function fetchMe(signal?: AbortSignal): Promise<HubMe> {
  const config = await getJson<CfsmConfig>('/api/config', signal)
  if (config.turnstile_verified) setVerifiedCredential(config.turnstile_verified)
  siteConfigCache = { at: Date.now(), value: config }
  return {
    authed: config.authorization === true,
    site_name: config.site_title || 'CF-Server-Monitor',
    public_page: config.is_public !== false,
    version: config.version,
    theme_options: config.theme_options ?? {},
    is_public: config.is_public,
  }
}

type ConfigField = { key?: string, type: string, default?: unknown, options?: Array<{ value: string }>, min?: number, max?: number }
const configFields = ((manifest as any).config as ConfigField[]).filter(
  (field): field is ConfigField & { key: string } => field?.type !== 'title' && typeof field?.key === 'string',
)

function fits(field: ConfigField, value: unknown): boolean {
  switch (field.type) {
    case 'boolean': return typeof value === 'boolean'
    case 'number': return typeof value === 'number' && Number.isFinite(value)
      && value >= (field.min ?? Number.NEGATIVE_INFINITY) && value <= (field.max ?? Number.POSITIVE_INFINITY)
    case 'select': return !!field.options?.some(option => option.value === value)
    default: return typeof value === 'string'
  }
}

/** CFSM exposes theme_options through /api/config. Defaults stay bundled in the theme. */
export async function loadThemeConfig(): Promise<Record<string, unknown>> {
  let saved: Record<string, unknown> = {}
  try {
    const config = await getJson<CfsmConfig>('/api/config')
    if (config.theme_options && typeof config.theme_options === 'object' && !Array.isArray(config.theme_options))
      saved = config.theme_options
    siteConfigCache = { at: Date.now(), value: config }
  } catch {
    if (siteConfigCache && Date.now() - siteConfigCache.at < 60_000)
      saved = siteConfigCache.value.theme_options ?? {}
  }
  return Object.fromEntries(configFields.map(field => [
    field.key,
    fits(field, saved[field.key]) ? saved[field.key] : field.default,
  ]))
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}
function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
function parseLoad(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(v => num(v))
  return str(value).trim().split(LOAD_SEPARATOR_REGEX).filter(Boolean).map(v => num(v))
}
function parseGpu(value: unknown): HubMetrics['gpu_info'] {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    }
    catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  return value.map((item: any) => ({
    id: String(item?.id ?? ''),
    name: str(item?.name),
    info: typeof item?.info === 'number' ? item.info : null,
  }))
}
function parseTrafficLimit(value: unknown): number {
  if (typeof value === 'number') return value
  const raw = str(value).trim().replace(COMMA_REGEX, '')
  const match = raw.match(TRAFFIC_LIMIT_REGEX)
  if (!match) return 0
  const n = Number(match[1])
  const unit = (match[2] || 'B').toUpperCase()
  const power = unit.startsWith('T') ? 4 : unit.startsWith('G') ? 3 : unit.startsWith('M') ? 2 : unit.startsWith('K') ? 1 : 0
  return n * 1024 ** power
}
function billingCycle(value: unknown): string {
  const v = str(value).toLowerCase()
  const map: Record<string, string> = {
    month: 'monthly', monthly: 'monthly', quarter: 'quarterly', quarterly: 'quarterly',
    halfyear: 'semiannual', semiannual: 'semiannual', year: 'yearly', yearly: 'yearly',
    annual: 'yearly', once: 'once', lifetime: 'once',
  }
  return map[v] || (MONTH_CYCLE_REGEX.test(v) ? v : 'monthly')
}
function online(server: CfsmServer): boolean {
  if (typeof server.is_online === 'boolean') return server.is_online
  // `timestamp` is the server-record creation time, not the last report.
  const stamp = num(server.last_updated)
  return stamp > 0 && Date.now() - stamp <= 300_000
}
function cfsmToHub(server: CfsmServer): HubNode {
  const ts = num(server.last_updated)
  const load = parseLoad(server.load_avg)
  const ping: Record<string, number | null | false> = {}
  const loss: Record<string, number | null | false> = {}
  const pingKeys = ['ct', 'cu', 'cm', 'bd', 'node_1', 'node_2', 'node_3', 'node_4']
  for (const [i, key] of pingKeys.entries()) {
    const p = server[`ping_${key}`]
    const l = server[`loss_${key}`]
    if (p !== undefined) ping[String(i + 1)] = p === false ? false : p === null ? null : num(p)
    if (l !== undefined) loss[String(i + 1)] = l === false ? false : l === null ? null : num(l)
  }
  const gpu = parseGpu(server.gpu_info)
  const boot = num(server.boot_time)
  const uptime = boot > 0 ? Math.max(0, Math.floor((Date.now() - (boot < 1e12 ? boot * 1000 : boot)) / 1000)) : 0
  const trafficMode = ({ upload: 'up', up: 'up', download: 'down', down: 'down', max: 'max', sum: 'sum', total: 'sum' } as Record<string, string>)[str(server.traffic_calc_type)] || 'sum'
  return {
    id: String(server.id),
    name: str(server.name) || String(server.id),
    country: str(server.region).toUpperCase(),
    group: str(server.server_group),
    tags: str(server.tags),
    sort: num(server.sort_order),
    public: server.is_hidden !== '1' && server.is_hidden !== true,
    online: online(server),
    last_seen: ts / 1000,
    os: str(server.os),
    kernel: str(server.kernel_version),
    arch: str(server.arch),
    cpu_name: str(server.cpu_info),
    cpu_cores: num(server.cpu_cores),
    mem_total: num(server.ram_total),
    swap_total: num(server.swap_total),
    disk_total: num(server.disk_total),
    agent_version: str(server.agent_version),
    price: num(server.price),
    currency: str(server.currency) || 'CNY',
    billing_cycle: billingCycle(server.billing_cycle),
    expires_at: str(server.expire_date) || null,
    traffic_limit: parseTrafficLimit(server.traffic_limit),
    traffic_mode: trafficMode,
    traffic_reset_day: num(server.reset_day, 1),
    total_rx: num(server.net_rx),
    total_tx: num(server.net_tx),
    month_rx: num(server.net_rx_monthly),
    month_tx: num(server.net_tx_monthly),
    gpu_info: gpu,
    metrics: {
      cpu: num(server.cpu),
      load,
      mem_total: num(server.ram_total),
      mem_used: num(server.ram_used),
      swap_total: num(server.swap_total),
      swap_used: num(server.swap_used),
      disk_total: num(server.disk_total),
      disk_used: num(server.disk_used),
      net_rx: num(server.net_in_speed),
      net_tx: num(server.net_out_speed),
      tcp: num(server.tcp_conn),
      udp: num(server.udp_conn),
      procs: num(server.processes),
      total_rx: num(server.net_rx),
      total_tx: num(server.net_tx),
      month_rx: num(server.net_rx_monthly),
      month_tx: num(server.net_tx_monthly),
      uptime,
      gpu_info: gpu,
      ping,
      loss,
    },
  }
}

let lastRawServers = new Map<string, CfsmServer>()
let activeServerIds: string[] = []
let activeDetailId = ''

function currentDetailId(): string {
  const match = location.hash.match(DETAIL_ROUTE_REGEX)
  const id = match?.[1]
  return id ? decodeURIComponent(id) : ''
}

export async function fetchNodes(signal?: AbortSignal): Promise<HubSnapshot> {
  const detailId = currentDetailId()
  activeDetailId = detailId
  if (detailId) {
    const server = await getJson<CfsmServer>(`/api/server?id=${encodeURIComponent(detailId)}`, signal)
    const normalized = { ...server, id: String(server.id || detailId) }
    lastRawServers = new Map([[String(normalized.id), normalized]])
    activeServerIds = [String(normalized.id)]
    return { nodes: [cfsmToHub(normalized)] }
  }
  const body = await getJson<{ servers?: CfsmServer[], stats?: unknown }>('/api/servers', signal)
  const servers = Array.isArray(body.servers) ? body.servers : []
  lastRawServers = new Map(servers.map(server => [String(server.id), server]))
  activeServerIds = servers.map(server => String(server.id))
  return { nodes: servers.map(cfsmToHub) }
}

const HISTORY_CONCURRENCY = 3
const HISTORY_RETRIES = 3
let historyActive = 0
const historyWaiters: Array<() => void> = []
async function acquireHistorySlot(signal?: AbortSignal): Promise<void> {
  if (historyActive < HISTORY_CONCURRENCY) {
    historyActive++
    return
  }
  await new Promise<void>((resolve, reject) => {
    let abort: () => void
    const grant = () => {
      signal?.removeEventListener('abort', abort)
      historyActive++
      resolve()
    }
    abort = () => {
      const i = historyWaiters.indexOf(grant)
      if (i >= 0)
        historyWaiters.splice(i, 1)
      reject(signal?.reason)
    }
    historyWaiters.push(grant)
    signal?.addEventListener('abort', abort, { once: true })
  })
}
function releaseHistorySlot(): void {
  historyActive = Math.max(0, historyActive - 1)
  historyWaiters.shift()?.()
}
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}
const historyCache = new Map<string, { at: number, promise: Promise<HubHistory> }>()
export const PUBLIC_HISTORY_HOURS = 24
export const ADMIN_HISTORY_HOURS = 168

export interface HistoryQuery { hours: number, points?: number, series?: 'metrics' | 'ping' }

function toSeconds(value: unknown): number {
  const n = num(value)
  return n > 1e12 ? Math.floor(n / 1000) : n
}
function historyFromRows(rows: any[]): HubHistory {
  const metrics: HubMetricRow[] = []
  const ping: HubPingRow[] = []
  const probes: Record<string, string> = {
    '1': '电信', '2': '联通', '3': '移动', '4': 'BGP',
    '5': 'Node 1', '6': 'Node 2', '7': 'Node 3', '8': 'Node 4',
  }
  const lossValues: Record<string, number[]> = {}
  const keys = ['ct', 'cu', 'cm', 'bd', 'node_1', 'node_2', 'node_3', 'node_4']
  for (const row of rows) {
    const ts = toSeconds(row.timestamp ?? row.ts)
    if (!ts) continue
    metrics.push({
      ts,
      cpu: num(row.cpu),
      mem_used: num(row.ram_used),
      disk_used: num(row.disk_used),
      net_rx: num(row.net_in_speed),
      net_tx: num(row.net_out_speed),
    })
    keys.forEach((key, index) => {
      const raw = row[`ping_${key}`]
      if (raw !== undefined && raw !== false) {
        const id = index + 1
        const latency = raw === null ? null : num(raw)
        const lossValue = row[`loss_${key}`]
        const lossPercent = lossValue === null || lossValue === false ? (latency === null ? 100 : 0) : num(lossValue)
        ping.push({ task_id: id, ts, latency, loss: lossPercent })
        if (typeof lossValue === 'number')
          (lossValues[String(id)] ??= []).push(lossPercent)
      }
    })
  }
  const loss: Record<string, number> = {}
  for (const [id, values] of Object.entries(lossValues)) {
    if (values.length) loss[id] = values.reduce((sum, value) => sum + value, 0) / values.length
  }
  return { metrics, ping, probes, loss }
}

export function fetchNodeHistory(id: string | number, query: HistoryQuery, signal?: AbortSignal): Promise<HubHistory> {
  const hours = Math.min(ADMIN_HISTORY_HOURS, Math.max(1, Math.floor(query.hours)))
  const params = new URLSearchParams({ id: String(id), hours: String(hours) })
  const url = `/api/history/all?${params}`
  const cached = historyCache.get(url)
  if (cached && Date.now() - cached.at < 15_000) return cached.promise
  const promise = (async () => {
    for (let attempt = 0; ; attempt++) {
      await acquireHistorySlot(signal)
      let res: Response
      try {
        res = await fetch(url, { credentials: 'same-origin', signal, headers: { accept: 'application/json', ...authHeaders(), ...getTurnstileHeaders() } })
      }
      finally {
        releaseHistorySlot()
      }
      if (res.status === 503 && attempt < HISTORY_RETRIES) {
        await delay(350 * 2 ** attempt, signal)
        continue
      }
      if (!res.ok) throw await readError(res)
      const rows = await res.json()
      return historyFromRows(Array.isArray(rows) ? rows : [])
    }
  })()
  historyCache.set(url, { at: Date.now(), promise })
  promise.catch(() => {
    if (historyCache.get(url)?.promise === promise)
      historyCache.delete(url)
  })
  return promise
}

const knownProbes = new Map<number, string>()
export function rememberProbes(history: HubHistory): void {
  for (const [id, name] of Object.entries(history.probes)) {
    const numericId = Number(id)
    if (Number.isFinite(numericId)) knownProbes.set(numericId, name)
  }
}
export function getKnownProbes(): Array<{ id: number, name: string }> {
  return Array.from(knownProbes.entries(), ([id, name]) => ({ id, name }))
}

const countryRegex = /^[A-Z]{2}$/
export function countryToFlag(code: string | undefined): string {
  const cc = (code ?? '').trim().toUpperCase()
  if (!countryRegex.test(cc)) return ''
  return String.fromCodePoint(...Array.from(cc, ch => 0x1F1E6 + ch.charCodeAt(0) - 65))
}
const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: '¥', USD: '$', HKD: 'HK$', EUR: '€', GBP: '£', RUB: '₽', CHF: '₣',
  INR: '₹', VND: '₫', THB: '฿', CAD: 'CA$',
}
export function currencySymbol(code: string | undefined): string {
  const cc = (code ?? '').trim().toUpperCase()
  if (!cc) return '¥'
  if (CURRENCY_SYMBOL_REGEX.test(code ?? '')) return code!
  return CURRENCY_SYMBOL[cc] ?? `${cc} `
}
const MONTH_CYCLE: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12, biennial: 24, triennial: 36 }
export function billingCycleDays(cycle: string | undefined): number {
  if (cycle === 'once') return -1
  const months = MONTH_CYCLE[cycle || 'monthly'] ?? (Number((cycle || '').replace(MONTH_SUFFIX_REGEX, '')) || 1)
  return Math.round(months * 30.4375)
}
function expiryMoment(node: HubNode): string {
  if (!node.expires_at) return ''
  const date = str(node.expires_at)
  if (!DATE_ONLY_REGEX.test(date)) return ''
  return new Date(`${date}T23:59:59`).toISOString()
}

export function hubNodeToClient(node: HubNode): Client {
  return {
    uuid: String(node.id),
    name: str(node.name) || `#${node.id}`,
    cpu_name: str(node.cpu_name),
    virtualization: str(node.virt),
    arch: str(node.arch),
    cpu_cores: num(node.cpu_cores),
    os: str(node.os),
    kernel_version: str(node.kernel),
    gpu_name: node.gpu_info?.map(gpu => gpu.name).filter(Boolean).join(', ') || undefined,
    ipv4: node.ipv4 || undefined,
    ipv6: node.ipv6 || undefined,
    region: countryToFlag(node.country),
    remark: node.remark || undefined,
    public_remark: '',
    mem_total: num(node.mem_total),
    swap_total: num(node.swap_total),
    disk_total: num(node.disk_total),
    version: node.agent_version || undefined,
    weight: num(node.sort),
    price: num(node.price),
    billing_cycle: billingCycleDays(node.billing_cycle),
    auto_renewal: false,
    currency: currencySymbol(node.currency),
    expired_at: expiryMoment(node),
    group: str(node.group),
    tags: str(node.tags),
    hidden: node.public === false,
    traffic_limit: num(node.traffic_limit),
    traffic_limit_type: str(node.traffic_mode) || 'sum',
    created_at: '',
    updated_at: '',
  }
}

function usableMetrics(metrics: HubNode['metrics']): HubMetrics | null {
  if (!metrics || typeof metrics !== 'object' || typeof metrics.cpu !== 'number') return null
  return metrics
}
export function hubNodeToStatus(node: HubNode): NodeStatus {
  const metrics = usableMetrics(node.metrics)
  const load = metrics?.load ?? []
  const lastSeen = num(node.last_seen)
  const ping: NonNullable<NodeStatus['ping']> = {}
  for (const [id, value] of Object.entries(metrics?.ping ?? {})) {
    if (value === false) continue
    ping[id] = {
      name: ({ '1': '电信', '2': '联通', '3': '移动', '4': 'BGP', '5': 'Node 1', '6': 'Node 2', '7': 'Node 3', '8': 'Node 4' } as Record<string, string>)[id] || `线路 ${id}`,
      latest: value === null ? -1 : num(value),
      avg: value === null ? -1 : num(value),
      tail: value === null ? -1 : num(value),
      loss: num(metrics?.loss?.[id]),
      min: value === null ? -1 : num(value),
      max: value === null ? -1 : num(value),
    }
  }
  const boot = metrics?.uptime
  return {
    client: String(node.id),
    time: lastSeen > 0 ? new Date(lastSeen * 1000).toISOString() : '',
    cpu: num(metrics?.cpu),
    gpu: metrics?.gpu_info?.length ? num(metrics.gpu_info[0]?.info) : 0,
    gpu_count: metrics?.gpu_info?.length ?? 0,
    gpu_average_usage: metrics?.gpu_info?.length
      ? metrics.gpu_info.reduce((sum, gpu) => sum + num(gpu.info), 0) / metrics.gpu_info.length : 0,
    gpu_detailed_info: metrics?.gpu_info?.map(gpu => ({ name: gpu.name, usage: gpu.info ?? undefined })),
    ram: num(metrics?.mem_used),
    ram_total: num(metrics?.mem_total, num(node.mem_total)),
    swap: num(metrics?.swap_used),
    swap_total: num(metrics?.swap_total, num(node.swap_total)),
    load: num(load[0]),
    load5: num(load[1]),
    load15: num(load[2]),
    temp: Number.NaN,
    disk: num(metrics?.disk_used),
    disk_total: num(metrics?.disk_total, num(node.disk_total)),
    net_in: num(metrics?.net_rx),
    net_out: num(metrics?.net_tx),
    net_total_up: num(node.month_tx, num(metrics?.month_tx)),
    net_total_down: num(node.month_rx, num(metrics?.month_rx)),
    traffic_up: num(node.total_tx, num(metrics?.total_tx)),
    traffic_down: num(node.total_rx, num(metrics?.total_rx)),
    process: num(metrics?.procs),
    connections: num(metrics?.tcp),
    connections_udp: num(metrics?.udp),
    online: node.online === true,
    uptime: num(boot),
    ping,
    message: node.online === true && !metrics ? 'unavailable' : undefined,
  }
}

export function snapshotToMaps(snapshot: HubSnapshot): { clients: Record<string, Client>, statuses: Record<string, NodeStatus> } {
  const clients: Record<string, Client> = {}
  const statuses: Record<string, NodeStatus> = {}
  for (const node of snapshot.nodes) {
    if (!node || (typeof node.id !== 'number' && typeof node.id !== 'string')) continue
    try {
      const id = String(node.id)
      clients[id] = hubNodeToClient(node)
      statuses[id] = hubNodeToStatus(node)
    } catch (error) {
      console.warn('[cfsm] skipped malformed server', node, error)
    }
  }
  return { clients, statuses }
}

export interface LiveSocketHandlers {
  onSnapshot: (snapshot: HubSnapshot) => void
  onOpen?: () => void
  onClose?: (event: CloseEvent) => void
}

export function openLiveSocket(handlers: LiveSocketHandlers): WebSocket {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const detailId = activeDetailId || currentDetailId()
  const url = new URL(`${protocol}//${location.host}/api/ws`)
  url.searchParams.set('subscribe', detailId || 'all')
  const socket = new WebSocket(url.toString())
  socket.addEventListener('open', () => {
    handlers.onOpen?.()
    if (!detailId) socket.send(JSON.stringify({ type: 'subscribe', scope: 'all', ids: activeServerIds }))
  })
  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return
    try {
      const message = JSON.parse(event.data)
      if (message?.type !== 'batchUpdate' || !Array.isArray(message.updates)) return
      for (const update of message.updates) {
        const id = String(update.serverId)
        const current = lastRawServers.get(id)
        if (!current) continue
        for (const sample of update.samples ?? []) {
          const patch = sample.data || sample.payload || sample.metrics || {}
          Object.assign(current, patch)
          current.id = id
          current.last_updated = num(sample.ts, num(current.last_updated, Date.now()))
          current.timestamp = current.last_updated
          current.is_online = true
        }
        lastRawServers.set(id, current)
      }
      handlers.onSnapshot({ nodes: [...lastRawServers.values()].map(cfsmToHub) })
    } catch (error) {
      console.warn('[cfsm] invalid websocket frame', error)
    }
  })
  socket.addEventListener('close', event => handlers.onClose?.(event))
  return socket
}
