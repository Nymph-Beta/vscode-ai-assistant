import { defineConfig } from '@rsbuild/core';
import { pluginVue } from '@rsbuild/plugin-vue';

export default defineConfig({
  plugins: [pluginVue()],
  server: {
    cors: {
      origin: '*',
    },
  },
  source: {
    define: {
      // "import.meta.env.USEVSCODE": JSON.stringify(process.env.USEVSCODE || "false"),
      "import.meta.env.USEVSCODE": JSON.stringify(process.env.USEVSCODE || "true")
    }
  },
  output: {
    // 输出到 extension 的 webview-ui 目录
    distPath: {
      root: '../extension/webview-ui',
    },
    manifest: true,
    // 新增：去掉文件名哈希
    filename: {
      js: '[name].js',
      css: '[name].css',
    },
  }
});
