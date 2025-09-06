import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Vite plugin to extract inline scripts to separate files for Chrome extension compatibility
 * @param {Object} options - Plugin options
 * @param {string} options.outDir - Output directory (relative to current working directory)
 * @param {string} options.scriptDir - Directory to place extracted scripts (relative to outDir)
 * @param {string} options.htmlFile - HTML file to process (relative to outDir)
 */
export function extractInlineScripts(options = {}) {
  const {
    outDir = '../extension',
    scriptDir = 'app',
    htmlFile = 'index.html'
  } = options;

  return {
    name: 'extract-inline-scripts',
    apply: 'build',
    closeBundle() {
      // 在构建完成后处理文件
      const htmlPath = path.join(outDir, htmlFile);
      
      if (!fs.existsSync(htmlPath)) {
        console.warn(`[extract-inline-scripts] HTML file not found: ${htmlPath}`);
        return;
      }
      
      let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
      const scriptMatches = [];
      
      // 正则匹配内联 script 标签
      const inlineScriptRegex = /<script(?:[^>]*)>([\s\S]*?)<\/script>/gi;
      let match;
      let matchIndex = 0;
      
      // 重置正则表达式的 lastIndex
      inlineScriptRegex.lastIndex = 0;
      
      while ((match = inlineScriptRegex.exec(htmlContent)) !== null) {
        const fullMatch = match[0];
        const scriptContent = match[1].trim();
        
        // 跳过空的 script 标签和已经有 src 属性的
        if (!scriptContent || fullMatch.includes('src=')) {
          continue;
        }
        
        // 提取script标签的属性
        const attributes = [];
        const typeMatch = fullMatch.match(/type\s*=\s*["']([^"']+)["']/i);
        const crossoriginMatch = fullMatch.match(/crossorigin/i);
        const deferMatch = fullMatch.match(/defer/i);
        const asyncMatch = fullMatch.match(/async/i);
        
        if (typeMatch) {
          attributes.push(`type="${typeMatch[1]}"`);
        }
        if (crossoriginMatch) {
          attributes.push('crossorigin');
        }
        if (deferMatch) {
          attributes.push('defer');
        }
        if (asyncMatch) {
          attributes.push('async');
        }
        
        scriptMatches.push({
          fullMatch,
          scriptContent,
          attributes: attributes.join(' '),
          index: matchIndex
        });
        
        matchIndex++;
      }
      
      if (scriptMatches.length === 0) {
        return;
      }
      
      console.log(`[extract-inline-scripts] Found ${scriptMatches.length} inline script(s) to extract`);
      
      // 处理每个匹配的内联脚本
      scriptMatches.forEach((scriptMatch) => {
        const { fullMatch, scriptContent, attributes, index } = scriptMatch;
        
        // 生成文件名（基于内容的hash确保唯一性）
        const hash = createHash('md5').update(scriptContent).digest('hex').slice(0, 8);
        const scriptFileName = `inline-script-${index}-${hash}.js`;
        const scriptPath = path.join(outDir, scriptDir, scriptFileName);
        
        // 确保目录存在
        const scriptDirPath = path.dirname(scriptPath);
        if (!fs.existsSync(scriptDirPath)) {
          fs.mkdirSync(scriptDirPath, { recursive: true });
        }
        
        // 写入独立的 JS 文件
        fs.writeFileSync(scriptPath, scriptContent, 'utf-8');
        
        // 替换 HTML 中的内联脚本为外部引用
        const srcPath = `/${scriptDir}/${scriptFileName}`;
        const newScriptTag = attributes 
          ? `<script ${attributes} src="${srcPath}"></script>`
          : `<script src="${srcPath}"></script>`;
        
        htmlContent = htmlContent.replace(fullMatch, newScriptTag);
        
        console.log(`[extract-inline-scripts] Created: ${scriptDir}/${scriptFileName}`);
      });
      
      // 写回更新的 HTML 内容
      fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
      console.log(`[extract-inline-scripts] Updated HTML file with external script references`);
    }
  };
}
