# AI Chat Application

基于 React + TypeScript + Node.js 的 AI 聊天应用，支持配置调用任何兼容 OpenAI API 的 LLM 服务。

## 功能特性

- 实时聊天界面
- 支持配置不同的 LLM 提供商
- 支持配置模型、温度、最大 token 等参数
- **会话历史记录（SQLite 数据库存储）**
- **会话侧边栏管理**
- 错误处理和提示

## 项目结构

```
chat_ai/
├── package.json          # 根目录配置
├── README.md
├── server/               # 后端服务
│   ├── config.json       # LLM 配置文件（需要修改）
│   ├── config.example.json
│   ├── package.json
│   ├── tsconfig.json
│   ├── data/             # SQLite 数据库目录
│   └── src/
│       ├── index.ts      # Express API 服务
│       └── database.ts   # 数据库管理
└── client/               # 前端应用
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        └── App.css
```

## 快速开始

### 1. 配置 LLM 服务

编辑 `server/config.json` 文件，配置你的 LLM 服务：

```json
{
  "llm": {
    "provider": "openai",
    "apiBaseUrl": "https://api.openai.com/v1",
    "apiKey": "YOUR_API_KEY_HERE",
    "model": "gpt-3.5-turbo",
    "temperature": 0.7,
    "maxTokens": 2000
  },
  "server": {
    "port": 3001
  }
}
```

### 2. 支持的 LLM 提供商

#### OpenAI
```json
{
  "llm": {
    "provider": "openai",
    "apiBaseUrl": "https://api.openai.com/v1",
    "apiKey": "sk-xxxx",
    "model": "gpt-4"
  }
}
```

#### Azure OpenAI
```json
{
  "llm": {
    "provider": "azure",
    "apiBaseUrl": "https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT/",
    "apiKey": "YOUR_AZURE_API_KEY",
    "model": "gpt-35-turbo"
  }
}
```

#### 自定义兼容 OpenAI 的 API
```json
{
  "llm": {
    "provider": "custom",
    "apiBaseUrl": "https://your-llm-api.com/v1",
    "apiKey": "your-api-key",
    "model": "your-model"
  }
}
```

### 3. 安装依赖

```bash
# 安装根目录依赖
npm install

# 安装后端依赖
cd server && npm install

# 安装前端依赖
cd ../client && npm install
```

### 4. 启动应用

```bash
# 同时启动前端和后端
npm run dev

# 或者分别启动
# 终端1：启动后端
cd server && npm run dev

# 终端2：启动前端
cd client && npm run dev
```

### 5. 访问应用

打开浏览器访问 http://localhost:5173

## SQLite 数据库

应用使用 SQLite 数据库存储会话历史记录。

### 数据库位置

```
server/data/chat.db
```

### API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | /api/sessions | 获取所有会话列表 |
| POST | /api/sessions | 创建新会话 |
| GET | /api/sessions/:id | 获取指定会话 |
| DELETE | /api/sessions/:id | 删除会话 |

## 配置说明

### LLM 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| provider | 提供商名称 | openai |
| apiBaseUrl | API 基础 URL | https://api.openai.com/v1 |
| apiKey | API 密钥 | - |
| model | 使用的模型 | gpt-3.5-turbo |
| temperature | 温度参数 (0-2) | 0.7 |
| maxTokens | 最大 token 数 | 2000 |

### 服务端口

| 服务 | 端口 |
|------|------|
| 后端 API | 3001 |
| 前端界面 | 5173 |