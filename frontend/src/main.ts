import { GraphiQL } from 'graphiql';
import ReactDOM from 'react-dom/client';
import React from 'react';
import { explorerPlugin } from '@graphiql/plugin-explorer';
import { createGraphiQLFetcher } from '@graphiql/toolkit';
import 'graphiql/graphiql.css';
import '@graphiql/plugin-explorer/style.css';
import './App.css';

interface Config {
  id: string;
  loginUrl?: string;
  matchPattern: string;
  graphqlEndpoint: string;
}

interface CustomHeaders {
  [key: string]: string;
}

interface InitParams {
  customHeaders: CustomHeaders;
  config: Config;
}

interface GraphQLError {
  message: string;
}

function openLogin(config: Config) {
  chrome.tabs
    .create({
      url: `${
        config.loginUrl || config.matchPattern
      }?graphiqlCustomHeader=1&configId=${config.id}`,
    })
    .then((tab: chrome.tabs.Tab) => {
      console.log('New tab created for login:', tab);
      close();
    });
}

// 获取指定configId的自定义请求头
async function getCustomHeaderAndConfig(): Promise<InitParams | null> {
  // 从URL参数中获取configId
  const configId = new URLSearchParams(window.location.search).get('configId');

  if (!configId) {
    console.error('No configId found in URL parameters');
    return null;
  }

  // 通过background script获取对应configId的自定义请求头
  const { customHeaders } = await chrome.runtime.sendMessage({
    action: 'getCustomHeadersByConfigId',
    configId: configId,
  });

  if (chrome.runtime.lastError) {
    console.error('Error retrieving customHeaders:', chrome.runtime.lastError);
    return null;
  }

  console.log('Retrieved customHeaders for configId:', configId, customHeaders);
  const { config } = await chrome.runtime.sendMessage({
    action: 'getConfigByConfigId',
    configId: configId,
  });

  if (chrome.runtime.lastError) {
    console.error('Error retrieving config:', chrome.runtime.lastError);
    return null;
  }

  console.log('Retrieved config for configId:', configId, config);
  return { customHeaders, config };
}

function updateDomText(text: string) {
  const element = document.getElementById('graphiql');
  if (element) {
    element.innerHTML = text;
  }
}

// 检查GraphQL网关是否正常响应
async function checkGraphQLEndpoint(
  endpoint: string,
  headers: CustomHeaders
): Promise<boolean> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        query: '{ __typename }', // 简单的introspection查询
      }),
    });

    // 检查HTTP状态码
    if (!response.ok) {
      console.log('GraphQL endpoint returned non-OK status:', response.status);
      return false;
    }

    const data = await response.json();

    // 检查GraphQL响应格式是否正确
    if (data.errors && data.errors.length > 0) {
      // 检查是否是认证相关的错误
      const authErrors = data.errors.some(
        (error: GraphQLError) =>
          error.message &&
          (error.message.includes('Missing API key') ||
            error.message.includes('Invalid API key') ||
            error.message.includes('authentication') ||
            error.message.includes('unauthorized') ||
            error.message.includes('Unauthorized'))
      );

      if (authErrors) {
        console.log('Authentication error detected in GraphQL response');
        return false;
      }
    }

    // 如果有data字段或者没有认证错误，说明连接正常
    return true;
  } catch (error) {
    console.log('Error checking GraphQL endpoint:', error);
    return false;
  }
}

async function init(params: InitParams) {
  if (!params) {
    console.error('Invalid parameters provided to init function');
    return;
  }

  const { customHeaders: reqHeader, config } = params;
  updateDomText('Checking authentication...');

  // 先检查GraphQL网关是否正常响应
  const isAuthenticated = await checkGraphQLEndpoint(
    config.graphqlEndpoint,
    reqHeader
  );

  if (!isAuthenticated) {
    updateDomText('Authentication required, redirecting to login...');
    openLogin(config);
    return;
  }

  updateDomText('Authentication successful, loading GraphiQL...');

  // 认证成功，渲染GraphiQL
  const graphiqlElement = document.getElementById('graphiql');
  if (!graphiqlElement) {
    console.error('GraphiQL container element not found');
    return;
  }

  const root = ReactDOM.createRoot(graphiqlElement);
  const fetcher = createGraphiQLFetcher({
    url: config.graphqlEndpoint,
    headers: reqHeader,
  });
  const expPlugin = explorerPlugin();

  root.render(
    React.createElement(GraphiQL, {
      fetcher,
      defaultEditorToolsVisibility: true,
      plugins: [expPlugin],
    })
  );
}

getCustomHeaderAndConfig()
  .then((result) => {
    if (result) {
      console.log('Custom headers and config retrieved:', result);
      init(result);
    } else {
      updateDomText('Error retrieving headers, please check console.');
    }
  })
  .catch((error) => {
    console.error('Error retrieving customHeaders:', error);
    updateDomText('Error retrieving headers, please check console.');
  });
