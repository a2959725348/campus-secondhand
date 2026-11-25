import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // 用相对路径打包：产物丢到 GitHub Pages 的任意子目录下都能直接打开
  base: './',
  plugins: [vue()],
  server: {
    port: 5173,
    // 开发期把 /api 和 /uploads 代理到后端，前端代码里不用写死域名
    proxy: {
      '/api': { target: process.env.API_TARGET || 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: process.env.API_TARGET || 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    // Element Plus 全量注册后主包会超过 1MB，手动拆一下：
    // vendor 是第三方的稳定依赖，命中缓存后业务改动不会让它失效。
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router', 'pinia'],
          element: ['element-plus', '@element-plus/icons-vue'],
        },
      },
    },
    // Element Plus 采用全量注册（开发期最省心），单独拆包后仍有 ~1.1MB。
    // 阈值放到 1200 只是消掉构建噪音；真要压体积应改成 unplugin 按需引入，
    // 这一条写进了 README 的「可继续优化」。
    chunkSizeWarningLimit: 1200,
  },
});
