import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import $monacoEditorPlugin from 'vite-plugin-monaco-editor';
import { extractInlineScripts } from './vite-plugin-extract-inline-scripts.js';
const monacoEditorPlugin = $monacoEditorPlugin.default ?? $monacoEditorPlugin;

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    monacoEditorPlugin({
      languageWorkers: ['editorWorkerService', 'json'],
      customWorkers: [
        {
          label: 'graphql',
          entry: 'monaco-graphql/esm/graphql.worker.js',
        },
      ],
    }),
    extractInlineScripts(),
  ],
  mode: 'development',
  build: {
    emptyOutDir: false, // 不清空输出目录
    outDir: '../extension', // 输出目录
    // 设置打包目标为 Chrome 120+
    target: 'chrome120',
    // 不压缩代码
    minify: false,
    // 开启 tree shaking
    rollupOptions: {
      treeshake: true,
      output: {
        // 保持原始文件名，不添加hash
        entryFileNames: 'app/[name].js',
        chunkFileNames: (chunkInfo) => {
          // 检查chunk是否来自node_modules
          const isVendor =
            chunkInfo.facadeModuleId &&
            chunkInfo.facadeModuleId.includes('node_modules');
          return isVendor ? 'vendor/[name].js' : 'app/[name].js';
        },
        assetFileNames: 'assets/[name].[ext]',
        manualChunks: (id) => {
          // 将node_modules中的依赖分组到vendor chunk
          if (id.includes('node_modules')) {
            return 'vendor';
          }
          // 自己的代码保持默认分组
          return undefined;
        },
      },
    },
  },
});
