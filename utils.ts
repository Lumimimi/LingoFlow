
import { SessionData, DialogueLine } from "./types";

// 将 Base64 字符串转换为 Uint8Array (二进制数组)
// 用于处理 API 返回的音频数据
export const base64ToUint8Array = (base64: string) => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// 将 Blob 对象转换为 Base64 字符串
// 用于将音频文件序列化保存到 JSON 备份中或发送给 API
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1]; // 去掉 "data:audio/wav;base64," 前缀
        resolve(base64);
      } else {
        reject(new Error("Failed to convert blob to base64"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// 获取 API Key 的通用函数
// 优先级:
// 1. 用户在网页设置中手动输入的 (LocalStorage)
// 2. Vercel/Node 环境注入的 (process.env.API_KEY)
// 3. Vite 构建环境注入的 (import.meta.env.VITE_API_KEY)
export const getApiKey = (): string | undefined => {
  // 1. 尝试从 LocalStorage 读取
  const localKey = localStorage.getItem("lingoflow_apikey");
  if (localKey && localKey.trim() !== "") {
    return localKey;
  }

  // 2. 尝试从 import.meta.env 读取 (Vite 标准)
  // 这是最可靠的方式，因为它能读取到 vite.config.ts 中注入的变量
  if (import.meta.env && import.meta.env.VITE_API_KEY) {
    return import.meta.env.VITE_API_KEY;
  }

  return undefined;
};

// 使用阿里云百炼 CosyVoice TTS（通过Vercel API）
export const generateSpeechWithAliyunTTS = async (
  text: string,
  languageCode: string = "German",
  speakerIndex: number = 0,
  retries: number = 2
): Promise<Blob | null> => {
  // 阿里云CosyVoice声音映射
  const voiceMap: Record<number, string> = {
    0: 'longxiaochun',    // 女声1 - 温柔甜美
    1: 'longwan',          // 男声1 - 沉稳大气
    2: 'longyue',          // 女声2 - 知性优雅
    3: 'longxiaobei',      // 男声2 - 年轻活力
  };

  const voice = voiceMap[speakerIndex % 4];

  // 在开发环境使用本地 API 服务器，生产环境使用 Vercel serverless function
  const isDev = import.meta.env.DEV;
  const apiUrl = isDev ? 'http://localhost:3001/api/tts' : '/api/tts';

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // 创建一个带超时的 fetch 请求（15秒超时，API通常3-5秒内完成）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice,
          language: languageCode
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`Aliyun TTS failed (attempt ${attempt + 1}/${retries + 1}):`, errorData);

        // 如果是最后一次尝试，返回 null
        if (attempt === retries) {
          return null;
        }

        // 等待1秒后重试
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      const data = await response.json();

      if (data.success && data.audioContent) {
        // 将base64 PCM数据转换为Blob
        const audioData = base64ToUint8Array(data.audioContent);
        // 转换为WAV格式
        const wavBlob = pcmToWav(audioData, data.sampleRate || 22050);
        return wavBlob;
      }

      return null;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error(`Aliyun TTS timeout (attempt ${attempt + 1}/${retries + 1})`);
      } else {
        console.error(`Aliyun TTS error (attempt ${attempt + 1}/${retries + 1}):`, error);
      }

      // 如果是最后一次尝试，返回 null
      if (attempt === retries) {
        return null;
      }

      // 等待1秒后重试
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return null;
};

// 使用 Google Cloud Text-to-Speech API 生成语音
// speakerIndex: 0-3，用于为不同角色分配不同的声音
export const generateSpeechWithCloudTTS = async (
  text: string,
  languageCode: string = "German",
  speakerIndex: number = 0
): Promise<Blob | null> => {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  // 高品质声音配置（Neural2/Wavenet，每种语言提供4个不同的声音用于多角色对话）
  const voiceMap: Record<string, Array<{ name: string; gender: string }>> = {
    "German": [
      { name: "de-DE-Neural2-F", gender: "FEMALE" },  // 女声1 - 温和自然
      { name: "de-DE-Neural2-B", gender: "MALE" },    // 男声1 - 沉稳专业
      { name: "de-DE-Neural2-A", gender: "FEMALE" },  // 女声2 - 清晰明亮
      { name: "de-DE-Neural2-D", gender: "MALE" },    // 男声2 - 年轻活力
    ],
    "English": [
      { name: "en-US-Neural2-F", gender: "FEMALE" },
      { name: "en-US-Neural2-D", gender: "MALE" },
      { name: "en-US-Neural2-C", gender: "FEMALE" },
      { name: "en-US-Neural2-A", gender: "MALE" },
    ],
    "Chinese": [
      { name: "cmn-CN-Wavenet-A", gender: "FEMALE" },
      { name: "cmn-CN-Wavenet-B", gender: "MALE" },
      { name: "cmn-CN-Wavenet-C", gender: "MALE" },
      { name: "cmn-CN-Wavenet-D", gender: "FEMALE" },
    ],
    "Spanish": [
      { name: "es-ES-Neural2-F", gender: "FEMALE" },
      { name: "es-ES-Neural2-B", gender: "MALE" },
      { name: "es-ES-Neural2-A", gender: "FEMALE" },
      { name: "es-ES-Neural2-D", gender: "MALE" },
    ],
    "French": [
      { name: "fr-FR-Neural2-A", gender: "FEMALE" },
      { name: "fr-FR-Neural2-B", gender: "MALE" },
      { name: "fr-FR-Neural2-C", gender: "FEMALE" },
      { name: "fr-FR-Neural2-D", gender: "MALE" },
    ],
    "Italian": [
      { name: "it-IT-Neural2-A", gender: "FEMALE" },
      { name: "it-IT-Neural2-C", gender: "MALE" },
      { name: "it-IT-Wavenet-A", gender: "FEMALE" },
      { name: "it-IT-Wavenet-C", gender: "MALE" },
    ],
    "Japanese": [
      { name: "ja-JP-Neural2-B", gender: "FEMALE" },
      { name: "ja-JP-Neural2-C", gender: "MALE" },
      { name: "ja-JP-Neural2-D", gender: "MALE" },
      { name: "ja-JP-Wavenet-A", gender: "FEMALE" },
    ],
    "Korean": [
      { name: "ko-KR-Neural2-A", gender: "FEMALE" },
      { name: "ko-KR-Neural2-C", gender: "MALE" },
      { name: "ko-KR-Wavenet-A", gender: "FEMALE" },
      { name: "ko-KR-Wavenet-C", gender: "MALE" },
    ],
  };

  // 语言代码映射
  const langCodeMap: Record<string, string> = {
    "German": "de-DE",
    "English": "en-US",
    "Chinese": "zh-CN",
    "Spanish": "es-ES",
    "French": "fr-FR",
    "Italian": "it-IT",
    "Japanese": "ja-JP",
    "Korean": "ko-KR",
  };

  const voices = voiceMap[languageCode] || voiceMap["German"];
  const voice = voices[speakerIndex % voices.length]; // 循环使用声音
  const langCode = langCodeMap[languageCode] || "de-DE";

  try {
    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: langCode,
          name: voice.name,
          ssmlGender: voice.gender
        },
        audioConfig: {
          audioEncoding: "LINEAR16",
          sampleRateHertz: 24000
        }
      })
    });

    const data = await response.json();

    if (response.ok && data.audioContent) {
      // 将 base64 转换为 Blob
      const audioData = base64ToUint8Array(data.audioContent);
      const wavBlob = pcmToWav(audioData, 24000);
      return wavBlob;
    } else {
      console.error("Cloud TTS failed:", data.error?.message || "Unknown error");
      return null;
    }
  } catch (error) {
    console.error("Cloud TTS error:", error);
    return null;
  }
};

// 辅助函数：向 DataView 写入字符串
export const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

// 核心函数：将原始 PCM 音频数据封装为 WAV 格式
// Gemini API 返回的是没有头部的 raw PCM，浏览器无法直接播放，需要手动加 WAV Header
export const pcmToWav = (pcmData: Uint8Array, sampleRate: number = 24000) => {
  const numChannels = 1; // 单声道
  const bitsPerSample = 16; // 16位采样
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataSize); // 44字节头 + 数据
  const view = new DataView(buffer);

  // 写入 WAV 文件头
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); 
  view.setUint16(20, 1, true); 
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // 写入 PCM 数据
  const pcmBytes = new Uint8Array(buffer, 44);
  pcmBytes.set(pcmData);

  return new Blob([buffer], { type: 'audio/wav' });
};

// 根据 PCM 数据长度计算持续时间 (秒)
// 假设单声道，16位 (2 bytes)，24kHz
export const getDurationFromPCM = (length: number, sampleRate: number = 24000) => {
  const bytesPerSample = 2; // 16-bit
  const numChannels = 1;
  const totalSamples = length / (bytesPerSample * numChannels);
  return totalSamples / sampleRate;
};

// 合并多个 PCM 数据块为一个大的 Uint8Array
// 用于将逐句生成的音频片段拼接成完整音频
export const mergePCMs = (chunks: Uint8Array[]) => {
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
};

// 为导入的音频估算时间戳
// 逻辑：根据每一句的字数长度，按比例分配音频总时长
// 这允许导入的外部音频也能支持 "自动跟读" 功能
export const estimateTimestamps = (script: DialogueLine[], totalDuration: number) => {
    const totalLength = script.reduce((acc, line) => acc + line.text.length, 0);
    let currentTime = 0;
    
    script.forEach(line => {
        const lineRatio = line.text.length / totalLength;
        const lineDuration = lineRatio * totalDuration;
        
        line.startTime = currentTime;
        line.endTime = currentTime + lineDuration;
        
        currentTime += lineDuration;
    });
    
    return script;
};

// 声明全局 JSZip 对象 (通过 CDN 引入)
declare global {
  interface Window {
    JSZip: any;
  }
}

// 批量创建 ZIP 包
// 将多个 Session 的音频和文本打包下载
export const createBatchZip = async (sessions: SessionData[]): Promise<Blob> => {
  if (!window.JSZip) {
    throw new Error("JSZip library not loaded");
  }

  const zip = new window.JSZip();
  const root = zip.folder("LingoFlow_Assets");

  for (const s of sessions) {
    // 过滤文件名中的非法字符
    const safeTitle = (s.title || s.topic || "Untitled").replace(/[^a-z0-9\-_]/gi, '_');
    const folder = root.folder(safeTitle);

    // 添加音频文件
    if (s.aiAudioBlob) {
      folder.file(`${safeTitle}.wav`, s.aiAudioBlob);
    }

    // 添加文本文件
    if (s.script && s.script.length > 0) {
      const text = s.script.map(l => `${l.speaker}: ${l.text}`).join('\n');
      folder.file(`${safeTitle}.txt`, text);
    }
  }

  return await zip.generateAsync({ type: "blob" });
};