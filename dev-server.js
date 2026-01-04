// 本地开发服务器 - 提供 TTS API 端点
import express from 'express';
import cors from 'cors';
import ttsHandler from './api/tts.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// TTS API 端点
app.post('/api/tts', async (req, res) => {
  // 模拟 Vercel 的 serverless function 环境
  const mockReq = {
    method: 'POST',
    body: req.body
  };

  const mockRes = {
    headers: {},
    statusCode: 200,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      res.status(this.statusCode).json(data);
    },
    end() {
      res.status(this.statusCode).end();
    }
  };

  await ttsHandler(mockReq, mockRes);
});

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`本地开发 API 服务器运行在 http://localhost:${PORT}`);
  console.log(`TTS API 端点: http://localhost:${PORT}/api/tts`);
  console.log(`${'='.repeat(60)}\n`);
  console.log(`请确保阿里云 API Key 已设置:`);
  console.log(`  ALIYUN_API_KEY=${process.env.ALIYUN_API_KEY || 'sk-788b3ee0c7564216833f30eeab4ff131'}`);
  console.log(`\n在另一个终端运行: npm run dev`);
  console.log(`${'='.repeat(60)}\n`);
});
