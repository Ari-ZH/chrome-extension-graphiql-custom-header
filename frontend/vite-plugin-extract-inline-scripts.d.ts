import { Plugin } from 'vite';

export interface ExtractInlineScriptsOptions {
  /** Output directory (relative to current working directory) */
  outDir?: string;
  /** Directory to place extracted scripts (relative to outDir) */
  scriptDir?: string;
  /** HTML file to process (relative to outDir) */
  htmlFile?: string;
}

/**
 * Vite plugin to extract inline scripts to separate files for Chrome extension compatibility
 */
export function extractInlineScripts(options?: ExtractInlineScriptsOptions): Plugin;
