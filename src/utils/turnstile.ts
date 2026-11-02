let oneTimeToken = ''
let verifiedCredential = ''
let verifiedCredentialAt = 0
let tokenPromise: Promise<string> | null = null
let resolveToken: ((token: string) => void) | null = null

function readStoredCredential(): string {
  if (verifiedCredential && Date.now() - verifiedCredentialAt < 55 * 60 * 1000)
    return verifiedCredential
  verifiedCredential = ''
  verifiedCredentialAt = 0
  try {
    const savedAt = Number(localStorage.getItem('cfsm_turnstile_verified_at') || 0)
    if (savedAt && Date.now() - savedAt < 55 * 60 * 1000) {
      verifiedCredential = localStorage.getItem('cfsm_turnstile_verified') || ''
      verifiedCredentialAt = savedAt
    } else {
      localStorage.removeItem('cfsm_turnstile_verified')
      localStorage.removeItem('cfsm_turnstile_verified_at')
    }
  } catch {}
  return verifiedCredential
}

export function getTurnstileHeaders(): Record<string, string> {
  const verified = readStoredCredential()
  if (verified) return { 'X-Turnstile-Verified': verified }
  return oneTimeToken ? { 'X-Turnstile-Token': oneTimeToken } : {}
}

export function waitForTurnstileToken(): Promise<string> {
  if (oneTimeToken) return Promise.resolve(oneTimeToken)
  if (!tokenPromise) {
    tokenPromise = new Promise<string>((resolve) => {
      resolveToken = resolve
    })
  }
  return tokenPromise
}

export function provideTurnstileToken(token: string): void {
  if (!token) return
  oneTimeToken = token
  resolveToken?.(token)
  resolveToken = null
  tokenPromise = null
}

export function setVerifiedCredential(value: unknown): void {
  if (typeof value !== 'string' || !value) return
  verifiedCredential = value
  verifiedCredentialAt = Date.now()
  oneTimeToken = ''
  try {
    localStorage.setItem('cfsm_turnstile_verified', value)
    localStorage.setItem('cfsm_turnstile_verified_at', String(Date.now()))
  } catch {}
}

export function clearTurnstileCredential(): void {
  verifiedCredential = ''
  verifiedCredentialAt = 0
  oneTimeToken = ''
  try {
    localStorage.removeItem('cfsm_turnstile_verified')
    localStorage.removeItem('cfsm_turnstile_verified_at')
  } catch {}
}

export function hasTurnstileCredential(): boolean {
  return Boolean(readStoredCredential())
}
