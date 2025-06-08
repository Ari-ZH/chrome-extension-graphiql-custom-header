/** 阻止登录页自动跳转 */
window.__NO_REDIRECT__ = true;
window.__LINK_MANAGER__ = true;
var originalSetItem = window.localStorage.setItem;
console.log('[GraphiQL CH] injectScript url', import.meta.url);
// 解析url上的参数
const urlParams = new URLSearchParams(import.meta.url.split('?')[1]);
const mappingListStr = urlParams.get('mappingList');
const graphqlEndpoint = urlParams.get('graphqlEndpoint');

console.log('[GraphiQL CH] GraphQL Endpoint:', graphqlEndpoint);

if (mappingListStr) {
  try {
    const mappingList = JSON.parse(mappingListStr);
    console.log('[GraphiQL CH] mappingList:', mappingList);
    
    // 将GraphQL端点信息存储到全局变量中，供其他脚本使用
    window.__GRAPHQL_ENDPOINT__ = graphqlEndpoint;
    
    // 跟踪已更新的 cacheKey
    const updatedCacheKeys = new Set();
    const allCacheKeys = mappingList.map((item) => item.cacheKey);
    
    window.localStorage.setItem = function (...args) {
      originalSetItem.apply(this, args);
      const key = args[0];
      const value = args[1];
      
      if (allCacheKeys.includes(key) && value) {
        console.log(
          `[GraphiQL CH] Intercepted localStorage setItem for key: ${key}, value: ${value}`
        );
        
        // 记录已更新的 cacheKey
        updatedCacheKeys.add(key);
        
        // 检查是否所有 cacheKey 都已更新
        if (updatedCacheKeys.size === allCacheKeys.length) {
          console.log('[GraphiQL CH] All cacheKeys updated, dispatching updateReqHeader event');
          document.dispatchEvent(new Event('updateReqHeader'));
          // window.localStorage.setItem = originalSetItem;
          // window.close();
        }
      }
    };
  } catch (error) {
    console.error('[GraphiQL CH] Failed to parse mappingList:', error);
  }
}
