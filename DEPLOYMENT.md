# LingoFlow 部署指南

## Vercel 部署步骤

### 1. 环境变量配置

在 Vercel 项目设置中添加以下环境变量：

#### Google Gemini API（用于文本生成和AI纠错）
- **变量名**: `VITE_API_KEY`
- **变量值**: 您的 Google Gemini API 密钥 (AIza...)
- **环境**: Production, Preview, Development

#### 阿里云百炼 API（用于语音合成 TTS）
- **变量名**: `ALIYUN_API_KEY`
- **变量值**: 您的阿里云百炼 API 密钥 (sk-...)
- **环境**: Production, Preview, Development

### 2. API 密钥获取

#### Google Gemini API
1. 访问 [Google AI Studio](https://aistudio.google.com/app/apikey)
2. 登录您的 Google 账号
3. 点击 "Get API Key" 或 "Create API Key"
4. 复制生成的 API 密钥（格式：`AIzaSy...`）

#### 阿里云百炼 API
1. 访问 [阿里云百炼控制台](https://bailian.console.aliyun.com/?apiKey=1)
2. 登录您的阿里云账号
3. 创建 API Key
4. 复制生成的 API 密钥（格式：`sk-...`）

### 3. 部署到 Vercel

#### 方法一：通过 GitHub 自动部署（推荐）
1. 将代码推送到 GitHub
2. 在 Vercel 中导入 GitHub 仓库
3. 添加环境变量（见上方）
4. 点击 Deploy

#### 方法二：使用 Vercel CLI
```bash
# 安装 Vercel CLI
npm install -g vercel

# 登录
vercel login

# 部署
vercel --prod
```

### 4. 验证部署

部署完成后，访问您的应用：
1. 测试文本生成功能
2. 测试语音合成功能
3. 检查控制台是否有错误

## 本地开发

### 1. 安装依赖
```bash
npm install
```

### 2. 创建 .env.local 文件
```bash
# Google Gemini API Key
VITE_API_KEY=your_gemini_api_key_here

# 阿里云百炼 API Key
ALIYUN_API_KEY=your_aliyun_api_key_here
```

### 3. 启动开发服务器
```bash
npm run dev
```

## 技术栈

- **前端**: React + TypeScript + Vite
- **后端**: Vercel Serverless Functions
- **AI 服务**:
  - Google Gemini 2.5 Flash（文本生成、音频转写、AI纠错）
  - 阿里云百炼 CosyVoice（高质量语音合成）

## 功能特点

### 语音合成 (TTS)
- 使用阿里云百炼 CosyVoice v1
- 4 种不同声音：
  - `longxiaochun` - 女声1（温柔甜美）
  - `longwan` - 男声1（沉稳大气）
  - `longyue` - 女声2（知性优雅）
  - `longxiaobei` - 男声2（年轻活力）
- 自动为不同角色分配不同声音
- 支持多语言

### 文本生成
- 使用 Google Gemini 2.5 Flash
- 生成对话剧本、词汇表、语法笔记

### 音频转写 (STT)
- 使用 Google Gemini 2.5 Flash 多模态能力
- 支持多语言音频识别

## 故障排除

### TTS 功能不可用
1. 检查 `ALIYUN_API_KEY` 环境变量是否正确设置
2. 检查 Vercel 函数日志
3. 确认 API 密钥有效且有余额

### 文本生成失败
1. 检查 `VITE_API_KEY` 环境变量是否正确设置
2. 确认 Google Gemini API 已启用
3. 检查 API 配额

### 部署后环境变量不生效
1. 确认在 Vercel 中设置了环境变量
2. 重新部署项目
3. 清除浏览器缓存

## 参考文档

- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [Google Gemini API](https://ai.google.dev/gemini-api/docs)
- [阿里云百炼 CosyVoice](https://help.aliyun.com/zh/model-studio/cosyvoice-websocket-api)
