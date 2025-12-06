
import { SessionData } from "./types";

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
// 用于将音频文件序列化保存到 JSON 备份中
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

// 将 Base64 字符串还原为 Blob 对象
// 用于从 JSON 备份中恢复音频文件
export const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
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
