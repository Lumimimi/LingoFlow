// Vercel Serverless Function for Alibaba Cloud TTS
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, voice = 'longxiaochun', language = 'German' } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  // 从环境变量获取阿里云API密钥，如果未设置则使用默认值（仅用于开发）
  const apiKey = process.env.ALIYUN_API_KEY
    || process.env.VITE_ALIYUN_API_KEY
    || 'sk-788b3ee0c7564216833f30eeab4ff131'; // 默认开发密钥

  console.log('API Key check:', {
    ALIYUN_API_KEY: process.env.ALIYUN_API_KEY ? 'set' : 'not set',
    VITE_ALIYUN_API_KEY: process.env.VITE_ALIYUN_API_KEY ? 'set' : 'not set',
    final: apiKey ? apiKey.substring(0, 15) + '...' : 'NONE'
  });

  if (!apiKey) {
    return res.status(500).json({ error: 'Aliyun API key not configured' });
  }

  try {
    // 语音映射
    const voiceMap = {
      0: 'longxiaochun',      // 女声1
      1: 'longwan',           // 男声1
      2: 'longyue',           // 女声2
      3: 'longxiaobei',       // 男声2
    };

    const selectedVoice = typeof voice === 'number' ? voiceMap[voice] : voice;

    // 使用WebSocket调用阿里云CosyVoice
    const audioData = await synthesizeSpeech(text, selectedVoice, apiKey);

    // 返回base64编码的音频数据
    res.status(200).json({
      success: true,
      audioContent: audioData.toString('base64'),
      format: 'pcm',
      sampleRate: 22050
    });

  } catch (error) {
    console.error('TTS Error:', error);
    res.status(500).json({
      error: 'TTS synthesis failed',
      message: error.message
    });
  }
}

// 使用WebSocket调用阿里云CosyVoice TTS
function synthesizeSpeech(text, voice, apiKey) {
  return new Promise((resolve, reject) => {
    const wsUrl = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference/';
    const taskId = uuidv4();

    const ws = new WebSocket(wsUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    const audioChunks = [];
    let hasError = false;

    ws.on('open', () => {
      console.log('WebSocket connected');

      // 发送run-task指令
      const runTaskCmd = {
        header: {
          action: 'run-task',
          task_id: taskId,
          streaming: 'out'
        },
        payload: {
          task_group: 'audio',
          task: 'tts',
          function: 'SpeechSynthesizer',
          model: 'cosyvoice-v1',
          parameters: {
            text_type: 'PlainText',
            voice: voice,
            format: 'pcm',
            sample_rate: 22050
          },
          input: {
            text: text
          }
        }
      };

      ws.send(JSON.stringify(runTaskCmd));
    });

    ws.on('message', (data) => {
      // WebSocket 消息有两种类型：
      // 1. JSON 文本消息（事件通知）
      // 2. 二进制消息（PCM 音频数据）

      // 首先尝试解析为 JSON
      try {
        const message = JSON.parse(data.toString('utf8'));

        if (message.header && message.header.event) {
          // 这是一个JSON事件消息
          if (message.header.event === 'task-started') {
            console.log('Task started:', message.header.task_id);
          }
          else if (message.header.event === 'result-generated') {
            console.log('Result generated - audio chunk should follow');
            // 音频数据会在下一个二进制消息中发送
          }
          else if (message.header.event === 'task-finished') {
            console.log(`Task finished. Total audio chunks: ${audioChunks.length}`);
            ws.close();

            // 合并所有音频片段
            const fullAudio = Buffer.concat(audioChunks);
            console.log(`Full audio size: ${fullAudio.length} bytes`);
            resolve(fullAudio);
          }
          else if (message.header.event === 'task-failed') {
            hasError = true;
            console.error('Task failed:', message.header.error_message || message.header.message);
            ws.close();
            reject(new Error(message.header.error_message || message.header.message || 'Task failed'));
          }
          return;
        }
      } catch (e) {
        // 不是JSON，可能是二进制音频数据
      }

      // 如果不是JSON，当作二进制音频数据处理
      if (Buffer.isBuffer(data) && data.length > 0) {
        audioChunks.push(data);
        console.log(`Received binary audio chunk ${audioChunks.length}, size: ${data.length} bytes`);
      }
    });

    ws.on('error', (error) => {
      hasError = true;
      console.error('WebSocket error:', error);
      reject(error);
    });

    ws.on('close', () => {
      console.log('WebSocket closed');
      if (!hasError && audioChunks.length === 0) {
        reject(new Error('No audio data received'));
      }
    });

    // 超时处理
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
        reject(new Error('Request timeout'));
      }
    }, 30000); // 30秒超时
  });
}
