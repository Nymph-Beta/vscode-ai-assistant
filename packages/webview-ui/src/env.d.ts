/// <reference types="@rsbuild/core/types" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  // biome-ignore lint/complexity/noBannedTypes: Vue component type
  // biome-ignore lint/suspicious/noExplicitAny: Vue component generic
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
