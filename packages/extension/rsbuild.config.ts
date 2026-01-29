import { defineConfig } from '@rsbuild/core';
import { pluginVue } from '@rsbuild/plugin-vue';

export default defineConfig({
  output: {
    externals: ["vscode"],
    filenameHash: false,
    target: "node",
  },
  plugins: [pluginVue()],
  source: {
    entry: {
      "extension": "./src/extension.ts",
    }
  },
});