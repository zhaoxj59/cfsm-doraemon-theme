/**
 * Site identity and theme settings adapter for CF-Server-Monitor.
 */
import { ADMIN_HISTORY_HOURS, fetchMe, HubError, loadThemeConfig, PUBLIC_HISTORY_HOURS } from '@/utils/hub'
import { hasTurnstileCredential } from '@/utils/turnstile'

export interface MeInfo {
  logged_in: boolean
  username: string
}
export interface PublicSettings {
  sitename: string
  public_page: boolean
  ping_record_preserve_time?: number
  record_preserve_time?: number
  theme_settings?: Record<string, unknown> | null
  version?: string
  turnstile_enabled?: boolean
  turnstile_site_key?: string
  turnstile_verified?: boolean
}
export class ApiError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}
function toApiError(error: unknown): unknown {
  if (error instanceof HubError)
    return new ApiError(error.status, error.message)
  return error
}
export class HubApi {
  private configPromise: Promise<Awaited<ReturnType<typeof fetchMe>>> | null = null
  private config() {
    if (!this.configPromise) {
      this.configPromise = fetchMe().finally(() => {
        setTimeout(() => {
          this.configPromise = null
        }, 1000)
      })
    }
    return this.configPromise
  }

  async getMe(): Promise<MeInfo> {
    try {
      const config = await this.config()
      return { logged_in: config.authed === true, username: config.authed ? '站长' : '' }
    }
    catch (error) {
      throw toApiError(error)
    }
  }

  async refreshConfigAfterTurnstile(): Promise<void> {
    this.configPromise = null
    await this.config()
  }

  async getPublicSettings(): Promise<PublicSettings> {
    try {
      const [config, themeSettings] = await Promise.all([this.config(), loadThemeConfig()])
      const hours = config.authed ? ADMIN_HISTORY_HOURS : PUBLIC_HISTORY_HOURS
      return {
        sitename: config.site_name || 'CF-Server-Monitor',
        public_page: config.public_page !== false,
        ping_record_preserve_time: hours,
        record_preserve_time: hours,
        theme_settings: themeSettings,
        version: config.version,
        turnstile_enabled: config.turnstile_enabled === true,
        turnstile_site_key: config.turnstile_site_key || '',
        turnstile_verified: Boolean(config.turnstile_verified) || hasTurnstileCredential(),
      }
    }
    catch (error) {
      throw toApiError(error)
    }
  }
}
let sharedRpc: HubApi | null = null
export function getSharedApi(): HubApi {
  if (!sharedRpc)
    sharedRpc = new HubApi()
  return sharedRpc
}
