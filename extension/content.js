// 检查URL参数中是否包含configId
function hasConfigIdInUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has('configId');
}

// 获取当前页面匹配的配置并注入
async function injectConfigs() {
  try {
    // 向background script请求匹配的配置
    const response = await chrome.runtime.sendMessage({
      action: 'getConfigForTab',
    });
    console.log('[GraphiQL CH] Received config for tab:', response);
    const { config } = response;
    console.log('[GraphiQL CH] Injecting config:', config);

    // 注入网页内脚本 劫持localStorage 获取更新header时机
    var s = document.createElement('script');
    s.src = chrome.runtime.getURL(
      'injectScript.js?mappingList=' +
        JSON.stringify(config.mappings) +
        '&graphqlEndpoint=' +
        encodeURIComponent(config.graphqlEndpoint)
    );
    s.type = 'module';
    s.onload = function () {
      console.log('[GraphiQL CH] inject script loaded');
    };
    // console.log('[GraphiQL CH] inject script');
    (document.head || document.documentElement).appendChild(s);

    // 监听更新header 事件, 发送给service work 修改请求头
    document.addEventListener('updateReqHeader', () => {
      console.log('[GraphiQL CH] updateReqHeader event triggered');

      function getCacheValue(key) {
        try {
          return JSON.parse(localStorage.getItem(key));
        } catch (error) {
          console.error(
            `[GraphiQL CH] Failed to parse localStorage key: ${key}`,
            error
          );
          return null;
        }
      }
      // 读取localStorage 中的 mappings 数据, 组装header
      const headers = config.mappings.reduce((acc, mapping) => {
        const value = getCacheValue(mapping.cacheKey);
        if (value) {
          acc[mapping.headerKey] = value;
        }
        return acc;
      }, {});

      console.log('[GraphiQL CH] Headers :', headers);

      chrome.runtime.sendMessage(
        {
          action: 'updateCustomHeader',
          headers: headers,
          configId: config.id,
        },
        (response) => {
          console.log(
            '[GraphiQL CH] Received response for updateCustomHeader:',
            response
          );
          // close();
        }
      );
    });
  } catch (error) {
    console.error('[GraphiQL CH] Failed to inject configs:', error);
  }
}

// 检查URL中是否包含configId参数，如果包含才执行注入
if (hasConfigIdInUrl()) {
  console.log('[GraphiQL CH] Found configId in URL, executing injection');
  injectConfigs();
} else {
  console.log('[GraphiQL CH] No configId found in URL, skipping injection');
}
