// Background script - 负责动态注册内容脚本
let registeredScripts = new Map();

// 监听存储变化，动态更新脚本注册
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.configs) {
    updateContentScripts(changes.configs.newValue || []);
  }
});

// 插件启动时初始化
chrome.runtime.onStartup.addListener(() => {
  initializeContentScripts();
});

chrome.runtime.onInstalled.addListener(() => {
  initializeContentScripts();
});

// 初始化内容脚本
async function initializeContentScripts() {
  try {
    const result = await chrome.storage.local.get(['configs']);
    const configs = result.configs || [];
    await updateContentScripts(configs);
  } catch (error) {
    console.error('Failed to initialize content scripts:', error);
  }
}

// 更新内容脚本注册
async function updateContentScripts(configs) {
  try {
    // 取消注册所有现有脚本
    await unregisterAllScripts();

    // 为每个配置注册新的内容脚本
    for (const config of configs) {
      await registerScriptForConfig(config);
    }

    console.log(
      'Content scripts updated for',
      configs.length,
      'configurations'
    );
  } catch (error) {
    console.error('Failed to update content scripts:', error);
  }
}

// 为单个配置注册内容脚本
async function registerScriptForConfig(config) {
  try {
    const scriptId = `config-${config.id}`;

    // 处理匹配模式 - 确保符合Chrome Extension规范
    // 支持新字段 loginUrl 和旧字段 matchPattern 的兼容
    let loginUrl = config.loginUrl || config.matchPattern;

    // 智能处理匹配模式
    if (!loginUrl.includes('*')) {
      // 如果是完整的URL，转换为合适的match pattern
      if (
        loginUrl.startsWith('http://') ||
        loginUrl.startsWith('https://')
      ) {
        // 对于具体路径，添加通配符以匹配该路径及其子路径
        if (loginUrl.endsWith('/')) {
          loginUrl = loginUrl + '*';
        } else {
          loginUrl = loginUrl + '*';
        }
      }
    }

    // 验证并修正match pattern格式
    if (!isValidMatchPattern(loginUrl)) {
      console.warn('Invalid match pattern, using fallback:', loginUrl);
      // 提取域名部分，创建更宽泛的匹配
      // try {
      //   const url = new URL(config.loginUrl || config.matchPattern);
      //   loginUrl = `${url.protocol}//${url.hostname}/*`;
      // } catch (e) {
      //   console.error('Failed to parse URL, using <all_urls>');
      //   loginUrl = '<all_urls>';
      // }
    }

    console.log('Registering script for:', {
      original: config.loginUrl || config.matchPattern,
      processed: loginUrl,
      configName: config.name,
    });

    // 注册内容脚本
    await chrome.scripting.registerContentScripts([
      {
        id: scriptId,
        matches: [loginUrl],
        js: ['content.js'],
        runAt: 'document_start',
        world: 'ISOLATED',
      },
    ]);

    // 保存配置信息，供content script使用
    registeredScripts.set(scriptId, {
      config: config,
    });

    console.log('Successfully registered script for pattern:', loginUrl);
  } catch (error) {
    console.error('Failed to register script for config:', config.name, error);

    // 如果注册失败，尝试使用<all_urls>作为fallback
    try {
      const fallbackScriptId = `config-fallback-${config.id}`;
      await chrome.scripting.registerContentScripts([
        {
          id: fallbackScriptId,
          matches: ['<all_urls>'],
          js: ['content.js'],
          runAt: 'document_start',
          world: 'ISOLATED',
        },
      ]);

      registeredScripts.set(fallbackScriptId, {
        config: config,
      });

      console.log('Registered fallback script for:', config.name);
    } catch (fallbackError) {
      console.error('Failed to register fallback script:', fallbackError);
    }
  }
}

// 验证match pattern是否有效
function isValidMatchPattern(pattern) {
  // 基本的match pattern验证
  if (pattern === '<all_urls>') return true;
  if (pattern.startsWith('file://')) return true;

  // HTTP/HTTPS pattern验证
  if (pattern.startsWith('http://') || pattern.startsWith('https://')) {
    // 必须包含通配符或者是有效的URL格式
    return pattern.includes('*') || pattern.match(/^https?:\/\/[^\/]+\/.*$/);
  }

  return false;
}

// 取消注册所有脚本
async function unregisterAllScripts() {
  try {
    const registeredIds = Array.from(registeredScripts.keys());
    if (registeredIds.length > 0) {
      await chrome.scripting.unregisterContentScripts({
        ids: registeredIds,
      });
    }
    registeredScripts.clear();
  } catch (error) {
    console.error('Failed to unregister scripts:', error);
  }
}

// 处理来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getConfigForTab') {
    // 根据标签页URL找到匹配的配置
    const tabUrl = sender.tab?.url;
    if (tabUrl) {
      chrome.storage.local.get(['configs'], (result) => {
        const configs = result.configs || [];
        const matchingConfigs = configs.filter((config) => {
          return matchesPattern(tabUrl, config.loginUrl || config.matchPattern);
        });
        if (matchingConfigs.length === 0) {
          sendResponse({ config: null });
          return;
        }
        sendResponse({ config: matchingConfigs[0] });
      });
      return true; // 异步响应
    }
  } else if (request.action === 'updateCustomHeader') {
    console.log('Received updateCustomHeader request:', request.headers);
    
    // 获取现有的自定义请求头存储
    chrome.storage.local.get(['customHeadersMap'], (result) => {
      const customHeadersMap = result.customHeadersMap || {};
      
      // 为特定的configId存储自定义请求头
      if (request.configId) {
        customHeadersMap[request.configId] = request.headers;
      }
      
      // 保存更新后的映射
      chrome.storage.local.set({ customHeadersMap: customHeadersMap }, () => {
        console.log('Custom headers updated for configId:', request.configId, request.headers);
        sendResponse({ status: 'success' });
        // 打开一个新的标签页 当前项目中的 project.html
        chrome.tabs.create({
          url: `index.html?configId=${request.configId}`,
        });
      });
    });
    return true; // 异步响应
  } else if (request.action === 'getCustomHeadersByConfigId') {
    console.log('Received getCustomHeadersByConfigId request for configId:', request.configId);
    
    // 从chrome.storage.local获取对应configId的customHeaders
    chrome.storage.local.get(['customHeadersMap'], (result) => {
      const customHeadersMap = result.customHeadersMap || {};
      const configId = request.configId;
      
      if (configId && customHeadersMap[configId]) {
        sendResponse({ customHeaders: customHeadersMap[configId] });
      } else {
        sendResponse({ customHeaders: null, message: 'No custom headers found for this configId' });
      }
    });
    return true; // 异步响应
  } else if (request.action === 'getConfigByConfigId') {
    console.log('Received getConfigByConfigId request');
    // 从chrome.storage.local获取配置
    chrome.storage.local.get(['configs'], (result) => {
      const configs = result.configs || [];
      const configId = request.configId;
      const config = configs.find((c) => c.id === configId);
      if (config) {
        sendResponse({ config: config });
      } else {
        sendResponse({ error: 'Config not found' });
      }
    });
    return true; // 异步响应
  } else if (request.action === 'clearAllCustomHeaders') {
    console.log('Received clearAllCustomHeaders request');
    
    // 清空所有自定义请求头
    chrome.storage.local.set({ customHeadersMap: {} }, () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to clear custom headers:', chrome.runtime.lastError);
        sendResponse({ 
          success: false, 
          error: chrome.runtime.lastError.message 
        });
      } else {
        console.log('All custom headers cleared successfully');
        sendResponse({ success: true });
      }
    });
    return true; // 异步响应
  } else {
    console.warn('Unknown action:', request.action);
  }
});

// URL模式匹配函数 - 支持Chrome Extension match pattern和简单URL
function matchesPattern(url, pattern) {
  try {
    console.log('Matching URL against pattern:', { url, pattern });

    // 如果pattern不包含通配符，且是完整URL，检查前缀匹配
    if (!pattern.includes('*') && pattern.startsWith('http')) {
      const matches = url === pattern || url.startsWith(pattern);
      return matches;
    }

    // 处理Chrome extension match pattern
    let regexPattern = pattern;

    // 转义特殊字符，但保留*作为通配符
    regexPattern = regexPattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // 转义特殊字符
      .replace(/\\\*/g, '.*'); // 将\*转回.*作为通配符

    const regex = new RegExp('^' + regexPattern + '$');
    const result = regex.test(url);

    return result;
  } catch (error) {
    console.error('Invalid pattern:', pattern, error);
    return false;
  }
}
