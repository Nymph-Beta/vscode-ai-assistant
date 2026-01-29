import type MarkdownIt from 'markdown-it';
import type { Options } from 'markdown-it';
import type { Renderer, Token } from 'markdown-it/index.js';

// Render rule type matching markdown-it signature
type RenderRule = (tokens: Token[], idx: number, options: Options, env: any, self: Renderer) => string;

export interface CodeCopyOptions {
  iconStyle?: string;
  iconClass?: string;
  buttonStyle?: string;
  buttonClass?: string;
  element?: string;
  onSuccess?: (e: Event) => void;
  onError?: (e: Event) => void;
}

// Browser clipboard functionality (for webview environment)
let clipboard: any = null;
try {
  // This will only work in browser/webview environment
  if (typeof window !== 'undefined' && window.navigator?.clipboard) {
    // Use modern clipboard API when available
    clipboard = {
      on: (_event: string, _callback: (e: Event) => void) => {
        // Modern browsers handle copy events automatically
        // We'll set up event listeners when needed
      },
    };
  }
} catch (_err) {
  // Fallback for environments without clipboard support
}

function renderCode(origRule: RenderRule, options: CodeCopyOptions = {}): RenderRule {
  return (tokens: Token[], idx: number, _options: Options, env: any, renderer: Renderer) => {
    const token = tokens[idx];
    const content = token.content.replaceAll('"', '&quot;').replaceAll("'", '&apos;');
    const origRendered = origRule(tokens, idx, _options, env, renderer);

    if (content.length === 0) {
      return origRendered;
    }

    const buttonStyle =
      options.buttonStyle ||
      'position: absolute; top: 7.5px; right: 6px; cursor: pointer; outline: none; background: none; border: none;';
    const buttonClass = options.buttonClass || '';

    return `
<div style="position: relative">
	${origRendered}
	<button class="${buttonClass}" data-clipboard-text="${content}" style="${buttonStyle}" title="Copy" onclick="navigator.clipboard?.writeText(this.getAttribute('data-clipboard-text'))">
		<span style="opacity: 0.8;" class="codicon codicon-copy" />
	</button>
</div>
`;
  };
}

export default function markdownItCodeCopy(md: MarkdownIt, options: CodeCopyOptions = {}): void {
  // Set up clipboard event handlers if provided
  if (clipboard && typeof window !== 'undefined') {
    if (options.onSuccess) {
      document.addEventListener('copy', options.onSuccess);
    }
    if (options.onError) {
      document.addEventListener('error', options.onError);
    }
  }

  // Apply the plugin to both code_block and fence rules
  md.renderer.rules.code_block = renderCode(md.renderer.rules.code_block!, options);
  md.renderer.rules.fence = renderCode(md.renderer.rules.fence!, options);
}
