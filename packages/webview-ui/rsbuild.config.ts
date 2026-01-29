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
    // 生成 manifest.json 用于动态文件加载
    manifest: true,
    // 保留文件名哈希以支持浏览器缓存优化
    // manifest.json 会自动记录实际文件名
  }
});
