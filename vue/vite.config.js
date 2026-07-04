const { defineConfig } = require('vite')
const vue = require('@vitejs/plugin-vue')
module.exports = defineConfig({
  plugins: [vue()],
  server: {
    port: 3000,
    proxy: {
      '/api/v1': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        pathRewrite: { '^/api/v1': '/api' }
      }
    }
  }
})