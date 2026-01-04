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

  // 从环境变量获取阿里云API密钥
  const apiKey = process.env.ALIYUN_API_KEY || process.env.VITE_ALIYUN_API_KEY;

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
          streaming: 'duplex'
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
      try {
        const message = JSON.parse(data.toString());

        if (message.header.event === 'task-started') {
          console.log('Task started:', message.header.task_id);
        }
        else if (message.header.event === 'result-generated') {
          // 接收音频数据
          if (message.payload && message.payload.output && message.payload.output.audio) {
            const audioBase64 = message.payload.output.audio;
            const audioBuffer = Buffer.from(audioBase64, 'base64');
            audioChunks.push(audioBuffer);
            console.log(`Received audio chunk ${audioChunks.length}, size: ${audioBuffer.length} bytes`);
          }
        }
        else if (message.header.event === 'task-finished') {
          console.log(`Task finished. Total chunks: ${audioChunks.length}`);
          ws.close();

          // 合并所有音频片段
          const fullAudio = Buffer.concat(audioChunks);
          console.log(`Full audio size: ${fullAudio.length} bytes`);
          resolve(fullAudio);
        }
        else if (message.header.event === 'task-failed') {
          hasError = true;
          console.error('Task failed:', message.header.message);
          ws.close();
          reject(new Error(message.header.message || 'Task failed'));
        }
      } catch (e) {
        console.error('Message parse error:', e);
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
