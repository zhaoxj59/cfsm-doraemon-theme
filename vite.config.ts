import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const version = '1.0.0-cfsm'

export default defineConfig({
  base: '/',
  publicDir: false,
  define: {
    __BUILD_VERSION__: JSON.stringify(version),
    __BUILD_GIT_HASH__: JSON.stringify('cfsm-port'),
  },
  plugins: [
    vue(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        { src: 'public/images/doraemon/**/*', dest: 'assets/images/doraemon' },
        { src: 'public/data/**/*', dest: 'assets/data' },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: process.env.CFSM_ORIGIN || 'http://127.0.0.1:8787',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    target: ['es2018', 'safari15.4'],
    cssTarget: 'safari15.4',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'echarts': ['echarts', 'vue-echarts'],
          'reka-ui': ['reka-ui'],
          'vueuse': ['@vueuse/core'],
          'v3-services': [
            './src/services/history.service.ts',
            './src/services/metrics.service.ts',
            './src/services/request.service.ts',
            './src/services/cache.service.ts',
            './src/utils/osImageHelper.ts',
            './src/utils/metricSeries.ts',
            './src/composables/useNodePingDisplay.ts',
          ],
        },
      },
    },
  },
})
