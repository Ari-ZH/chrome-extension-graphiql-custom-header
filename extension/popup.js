document.addEventListener('DOMContentLoaded', function () {
  const configForm = document.getElementById('configForm');
  const configNameInput = document.getElementById('configName');
  const loginUrlInput = document.getElementById('loginUrl');
  const graphqlEndpointInput = document.getElementById('graphqlEndpoint');
  const mappingContainer = document.getElementById('mappingContainer');
  const addMappingBtn = document.getElementById('addMapping');
  const configList = document.getElementById('configList');
  const openHtmlBtn = document.getElementById('openHtmlBtn');
  const clearCacheBtn = document.getElementById('clearCacheBtn');
  const importConfigBtn = document.getElementById('importConfigBtn');
  const importModal = document.getElementById('importModal');
  const importTextarea = document.getElementById('importTextarea');
  const importConfirmBtn = document.getElementById('importConfirmBtn');
  const importCancelBtn = document.getElementById('importCancelBtn');

  // 初始化
  loadConfigs();

  // 添加映射配置对
  addMappingBtn.addEventListener('click', function () {
    addMappingItem();
  });

  // 删除映射配置对
  mappingContainer.addEventListener('click', function (e) {
    if (e.target.classList.contains('remove-mapping')) {
      const mappingItems = mappingContainer.querySelectorAll('.mapping-item');
      if (mappingItems.length > 1) {
        e.target.parentElement.remove();
      }
    }
  });

  // 保存配置
  configForm.addEventListener('submit', function (e) {
    e.preventDefault();
    saveConfig();
  });

  // 打开HTML文件
  if (openHtmlBtn) {
    openHtmlBtn.addEventListener('click', function () {
      const url = chrome.runtime.getURL('index.html');
      chrome.tabs.create({ url: url });
    });
  }

  // 清空缓存
  clearCacheBtn.addEventListener('click', function () {
    clearCustomHeaders();
  });

  // 导入配置
  importConfigBtn.addEventListener('click', function () {
    showImportModal();
  });

  // 导入模态框确认按钮
  importConfirmBtn.addEventListener('click', function () {
    importConfigFromText();
  });

  // 导入模态框取消按钮
  importCancelBtn.addEventListener('click', function () {
    hideImportModal();
  });

  // 点击模态框背景关闭
  importModal.addEventListener('click', function (e) {
    if (e.target === importModal) {
      hideImportModal();
    }
  });

  function addMappingItem() {
    const mappingItem = document.createElement('div');
    mappingItem.className = 'mapping-item';
    mappingItem.innerHTML = `
            <input type="text" class="cache-key" placeholder="缓存key">
            <input type="text" class="header-key" placeholder="请求头key">
            <button type="button" class="remove-mapping">删除</button>
        `;
    mappingContainer.appendChild(mappingItem);
  }

  function saveConfig() {
    const configName = configNameInput.value.trim();
    const loginUrl = loginUrlInput.value.trim();
    const graphqlEndpoint = graphqlEndpointInput.value.trim();

    if (!loginUrl) {
      alert('请输入登录地址');
      return;
    }

    if (!graphqlEndpoint) {
      alert('请输入GraphQL网关地址');
      return;
    }

    // 验证GraphQL端点URL格式
    try {
      new URL(graphqlEndpoint);
    } catch (e) {
      alert('请输入有效的GraphQL网关地址URL');
      return;
    }

    // 收集映射配置
    const mappings = [];
    const mappingItems = mappingContainer.querySelectorAll('.mapping-item');

    mappingItems.forEach((item) => {
      const cacheKey = item.querySelector('.cache-key').value.trim();
      const headerKey = item.querySelector('.header-key').value.trim();

      if (cacheKey && headerKey) {
        mappings.push({
          cacheKey: cacheKey,
          headerKey: headerKey,
        });
      }
    });

    const editId = configForm.dataset.editId;
    const config = {
      id: editId || Date.now().toString(),
      name: configName || `配置_${Date.now()}`,
      loginUrl: loginUrl,
      matchPattern: loginUrl, // 保持向后兼容
      graphqlEndpoint: graphqlEndpoint,
      mappings: mappings,
      createdAt: editId ? undefined : new Date().toISOString(), // 编辑时保留原创建时间
    };

    // 保存到Chrome存储
    chrome.storage.local.get(['configs'], function (result) {
      const configs = result.configs || [];

      if (editId) {
        // 编辑现有配置
        const configIndex = configs.findIndex((c) => c.id === editId);
        if (configIndex !== -1) {
          // 保留原创建时间，添加更新时间
          config.createdAt = configs[configIndex].createdAt;
          config.updatedAt = new Date().toISOString();
          configs[configIndex] = config;
        }
      } else {
        // 新增配置
        configs.push(config);
      }

      chrome.storage.local.set({ configs: configs }, function () {
        alert(editId ? '配置更新成功！' : '配置保存成功！');
        resetForm();
        loadConfigs();

        // 通知background script更新内容脚本注册
        chrome.runtime.sendMessage({
          action: 'updateContentScripts',
          configs: configs,
        });
      });
    });
  }

  function resetForm() {
    configNameInput.value = '';
    loginUrlInput.value = '';
    graphqlEndpointInput.value = '';

    // 重置映射配置，保留一个空的
    mappingContainer.innerHTML = `
            <div class="mapping-item">
                <input type="text" class="cache-key" placeholder="缓存key">
                <input type="text" class="header-key" placeholder="请求头key">
                <button type="button" class="remove-mapping">删除</button>
            </div>
        `;
    delete configForm.dataset.editId; // 清除编辑状态
    document.querySelector('.save-btn').textContent = '💾 保存配置';
  }

  function loadConfigs() {
    chrome.storage.local.get(['configs'], function (result) {
      const configs = result.configs || [];
      displayConfigs(configs);
    });
  }

  function displayConfigs(configs) {
    if (configs.length === 0) {
      configList.innerHTML = '<div class="empty-state">📭 暂无保存的配置</div>';
      return;
    }

    // <div class="config-item-details">
    //   <p>
    //     <strong>🔗 登录地址:</strong> ${config.loginUrl || config.matchPattern}
    //   </p>
    //   <p>
    //     <strong>🌐 GraphQL端点:</strong> ${config.graphqlEndpoint}
    //   </p>
    //   <div class="mappings">
    //     <strong>🔄 映射配置:</strong>$
    //     {config.mappings
    //       .map(
    //         (mapping) =>
    //           `<div class="mapping">${mapping.cacheKey} → ${mapping.headerKey}</div>`
    //       )
    //       .join('')}
    //   </div>
    //   <small>
    //     ⏰ 创建时间: ${new Date(config.createdAt).toLocaleString()}$
    //     {config.updatedAt
    //       ? ` | 🔄 更新时间: ${new Date(config.updatedAt).toLocaleString()}`
    //       : ''}
    //   </small>
    // </div>;

    configList.innerHTML = configs
      .map(
        (config) => `
            <div class="config-item compact">
                <h4>${config.name}</h4>
                <div class="config-actions">
                    <button class="open-ui full-width" data-id="${config.id}" title="打开UI">🚀 打开UI</button>
                </div>
                <div class="config-actions secondary">
                    <button class="edit-config" data-id="${config.id}" title="编辑">✏️ 编辑</button>
                    <button class="export-config" data-id="${config.id}" title="导出配置">📤 导出</button>
                    <button class="delete-config" data-id="${config.id}" title="删除">🗑️ 删除</button>
                </div>
            </div>
        `
      )
      .join('');

    // 添加删除事件监听
    configList.addEventListener('click', function (e) {
      if (e.target.classList.contains('delete-config')) {
        const configId = e.target.getAttribute('data-id');
        deleteConfig(configId);
      }
      if (e.target.classList.contains('open-ui')) {
        const configId = e.target.getAttribute('data-id');
        chrome.tabs.create({
          url: `index.html?configId=${configId}`,
        });
      }
      // 添加编辑事件监听
      if (e.target.classList.contains('edit-config')) {
        const configId = e.target.getAttribute('data-id');
        loadConfigForEdit(configId);
      }
      // 添加导出事件监听
      if (e.target.classList.contains('export-config')) {
        const configId = e.target.getAttribute('data-id');
        exportConfig(configId);
      }
    });

    // // 添加hover详情定位逻辑
    // const configItems = configList.querySelectorAll('.config-item');
    // configItems.forEach((item, index) => {
    //   item.addEventListener('mouseenter', function () {
    //     // 检测是否需要在左侧显示详情（避免超出右边界）
    //     const rect = item.getBoundingClientRect();
    //     const detailsWidth = 320; // 详情卡片宽度
    //     const marginRight = 16; // 右边距
    //     const windowWidth = window.innerWidth;

    //     // 如果详情卡片会超出右边界，则添加show-left类
    //     if (rect.right + detailsWidth + marginRight > windowWidth) {
    //       item.classList.add('show-left');
    //     } else {
    //       item.classList.remove('show-left');
    //     }
    //   });
    // });
  }

  function deleteConfig(configId) {
    if (confirm('确定要删除这个配置吗？')) {
      chrome.storage.local.get(['configs'], function (result) {
        const configs = result.configs || [];
        const updatedConfigs = configs.filter(
          (config) => config.id !== configId
        );

        chrome.storage.local.set({ configs: updatedConfigs }, function () {
          loadConfigs();

          // 通知background script更新内容脚本注册
          chrome.runtime.sendMessage({
            action: 'updateContentScripts',
            configs: updatedConfigs,
          });
        });
      });
    }
  }

  // 加载配置到表单进行编辑
  function loadConfigForEdit(configId) {
    chrome.storage.local.get(['configs'], function (result) {
      const configs = result.configs || [];
      const config = configs.find((c) => c.id === configId);

      if (config) {
        // 填充表单
        configNameInput.value = config.name || '';
        loginUrlInput.value = config.loginUrl || config.matchPattern || '';
        graphqlEndpointInput.value = config.graphqlEndpoint || '';

        // 清空现有映射
        mappingContainer.innerHTML = '';

        // 添加配置中的映射
        if (config.mappings && config.mappings.length > 0) {
          config.mappings.forEach((mapping) => {
            const mappingItem = document.createElement('div');
            mappingItem.className = 'mapping-item';
            mappingItem.innerHTML = `
              <input type="text" class="cache-key" placeholder="缓存key" value="${
                mapping.cacheKey || ''
              }">
              <input type="text" class="header-key" placeholder="请求头key" value="${
                mapping.headerKey || ''
              }">
              <button type="button" class="remove-mapping">删除</button>
            `;
            mappingContainer.appendChild(mappingItem);
          });
        } else {
          // 如果没有映射，添加一个空的
          addMappingItem();
        }

        // 设置表单为编辑模式
        configForm.dataset.editId = configId;
        document.querySelector('.save-btn').textContent = '🔄 更新配置';

        // 滚动到表单顶部
        configForm.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // 清空所有自定义请求头缓存
  function clearCustomHeaders() {
    if (
      confirm(
        '确定要清空所有缓存的自定义请求头吗？此操作将清除所有配置的登录状态。'
      )
    ) {
      // 通过background script清空缓存
      chrome.runtime.sendMessage(
        { action: 'clearAllCustomHeaders' },
        function (response) {
          if (chrome.runtime.lastError) {
            alert('清空缓存失败：' + chrome.runtime.lastError.message);
          } else if (response.success) {
            alert('缓存清空成功！所有配置的登录状态已重置。');
          } else {
            alert('清空缓存失败：' + (response.error || '未知错误'));
          }
        }
      );
    }
  }

  // 显示导入模态框
  function showImportModal() {
    importTextarea.value = '';
    importModal.classList.add('show');
    importTextarea.focus();
  }

  // 隐藏导入模态框
  function hideImportModal() {
    importModal.classList.remove('show');
    importTextarea.value = '';
  }

  // 从文本导入配置
  function importConfigFromText() {
    const jsonText = importTextarea.value.trim();
    
    if (!jsonText) {
      alert('请输入配置JSON文本');
      return;
    }

    try {
      const configData = JSON.parse(jsonText);
      
      // 验证必需的字段
      if (!configData.loginUrl && !configData.matchPattern) {
        alert('配置缺少必需的登录地址字段 (loginUrl 或 matchPattern)');
        return;
      }

      if (!configData.graphqlEndpoint) {
        alert('配置缺少必需的GraphQL端点字段 (graphqlEndpoint)');
        return;
      }

      // 验证GraphQL端点URL格式
      try {
        new URL(configData.graphqlEndpoint);
      } catch (e) {
        alert('GraphQL端点URL格式无效');
        return;
      }

      // 生成新的配置对象
      const config = {
        id: Date.now().toString(),
        name: configData.name || `导入配置_${Date.now()}`,
        loginUrl: configData.loginUrl || configData.matchPattern,
        matchPattern: configData.loginUrl || configData.matchPattern, // 保持向后兼容
        graphqlEndpoint: configData.graphqlEndpoint,
        mappings: Array.isArray(configData.mappings) ? configData.mappings : [],
        createdAt: new Date().toISOString(),
        imported: true // 标记为导入的配置
      };

      // 保存配置
      chrome.storage.local.get(['configs'], function (result) {
        const configs = result.configs || [];
        configs.push(config);

        chrome.storage.local.set({ configs: configs }, function () {
          alert('配置导入成功！');
          hideImportModal();
          loadConfigs();

          // 通知background script更新内容脚本注册
          chrome.runtime.sendMessage({
            action: 'updateContentScripts',
            configs: configs,
          });
        });
      });

    } catch (error) {
      alert('JSON格式错误，请检查输入的配置文本：\n' + error.message);
    }
  }

  // 导出配置到文本
  function exportConfig(configId) {
    chrome.storage.local.get(['configs'], function (result) {
      const configs = result.configs || [];
      const config = configs.find((c) => c.id === configId);

      if (config) {
        // 创建导出的配置对象，排除不必要的字段
        const exportConfig = {
          name: config.name,
          loginUrl: config.loginUrl,
          graphqlEndpoint: config.graphqlEndpoint,
          mappings: config.mappings || []
        };

        // 将配置转换为格式化的JSON字符串
        const jsonText = JSON.stringify(exportConfig, null, 2);

        // 创建一个临时的textarea来复制文本
        const tempTextarea = document.createElement('textarea');
        tempTextarea.value = jsonText;
        document.body.appendChild(tempTextarea);
        tempTextarea.select();
        
        try {
          // 尝试复制到剪贴板
          document.execCommand('copy');
          alert('配置已复制到剪贴板！\n\n' + jsonText);
        } catch (err) {
          // 如果复制失败，显示配置文本供用户手动复制
          alert('复制失败，请手动复制以下配置：\n\n' + jsonText);
        }
        
        document.body.removeChild(tempTextarea);
      } else {
        alert('未找到指定的配置');
      }
    });
  }
});
