<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { provideTurnstileToken } from '@/utils/turnstile'
import { useAppStore } from '@/stores/app'

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string
      remove: (widgetId: string) => void
      reset: (widgetId?: string) => void
    }
  }
}

const appStore = useAppStore()
const container = ref<HTMLElement | null>(null)
const error = ref('')
const completed = ref(false)
let widgetId = ''

function renderWidget(): void {
  if (!container.value || !window.turnstile || widgetId)
    return
  const siteKey = appStore.publicSettings?.turnstile_site_key
  if (!siteKey) {
    error.value = '站点已启用 Turnstile，但未返回 Site Key。请检查 CFSM 后台配置。'
    return
  }
  widgetId = window.turnstile.render(container.value, {
    sitekey: siteKey,
    theme: 'auto',
    callback: (token: string) => {
      completed.value = true
      error.value = ''
      provideTurnstileToken(token)
    },
    'expired-callback': () => {
      completed.value = false
      error.value = '验证已过期，请重新验证。'
    },
    'error-callback': () => {
      completed.value = false
      error.value = 'Turnstile 加载或验证失败，请检查网络后重试。'
    },
  })
}

onMounted(() => {
  if (window.turnstile) {
    renderWidget()
    return
  }
  const existing = document.querySelector<HTMLScriptElement>('script[data-cfsm-turnstile]')
  if (existing) {
    existing.addEventListener('load', renderWidget, { once: true })
    return
  }
  const script = document.createElement('script')
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
  script.async = true
  script.defer = true
  script.dataset.cfsmTurnstile = 'true'
  script.addEventListener('load', renderWidget, { once: true })
  script.addEventListener('error', () => {
    error.value = '无法加载 Cloudflare Turnstile。请检查网络或 CSP 设置。'
  }, { once: true })
  document.head.appendChild(script)
})

onUnmounted(() => {
  if (widgetId && window.turnstile) {
    try { window.turnstile.remove(widgetId) } catch {}
  }
})
</script>

<template>
  <div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-md">
    <section class="w-full max-w-md rounded-3xl border border-white/20 bg-white p-6 text-center text-slate-900 shadow-2xl">
      <img src="/images/doraemon/doraemon.svg" alt="" class="mx-auto mb-3 h-20 w-20">
      <h2 class="text-xl font-bold">任意门安全验证</h2>
      <p class="mt-2 text-sm text-slate-600">
        此站点启用了 Cloudflare Turnstile。完成验证后，哆啦A梦监控面板即可连接服务器。
      </p>
      <div class="my-5 flex justify-center">
        <div ref="container" />
      </div>
      <p v-if="completed" class="text-sm font-medium text-emerald-700">验证成功，正在连接监控服务…</p>
      <p v-else-if="error" class="text-sm text-red-600">{{ error }}</p>
      <p v-else class="text-xs text-slate-500">请完成上方安全验证</p>
    </section>
  </div>
</template>
