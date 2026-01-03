
import React, { useState, useEffect, useRef } from "react";
import { GoogleGenAI } from "@google/genai";
import { blobToBase64, getApiKey } from "../utils";
import { AudioPlayer } from "./AudioPlayer";
import { Icons } from "./Icons";

// 混合输入组件：支持打字和录音（自动转写）
export const HybridInput = ({ 
  value, 
  onChange, 
  onAudioChange, 
  audioBlob,
  placeholder = "Type or record...",
  label = "Input",
  targetLang = "German" // 目标语言，用于 AI 转写时的提示
}: { 
  value: string, 
  onChange: (text: string) => void, 
  onAudioChange: (blob: Blob) => void,
  audioBlob: Blob | null,
  placeholder?: string,
  label?: string,
  targetLang?: string
}) => {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [timer, setTimer] = useState(0);
  const timerRef = useRef<number | null>(null);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // 开始录音
  const startRecording = async () => {
    try {
      // 请求麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      
      // 收集录音数据片段
      recorder.ondataavailable = (e) => chunks.push(e.data);
      
      // 停止录音时的处理逻辑
      recorder.onstop = async () => {
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type });
        onAudioChange(blob); // 回传录音 Blob
        stream.getTracks().forEach(track => track.stop()); // 关闭麦克风流
        
        // 自动触发 AI 转写
        await transcribeAudio(blob);
      };
      
      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
      
      // 启动计时器
      setTimer(0);
      timerRef.current = window.setInterval(() => setTimer(t => t + 1), 1000);
    } catch (e) {
      alert("Microphone denied. 请允许使用麦克风。");
    }
  };

  // 停止录音
  const stopRecording = () => {
    if (mediaRecorder && recording) {
      mediaRecorder.stop();
      setRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // 使用 Gemini API 将录音转写为文字
  const transcribeAudio = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const apiKey = getApiKey();
      if (!apiKey) return; // 没 Key 就不转写，仅保存录音
      const ai = new GoogleGenAI({ apiKey });
      const base64Audio = await blobToBase64(blob);
      
      // 调用 Gemini 1.5 Flash 进行多模态识别 (降级以确保兼容性)
      const response = await ai.models.generateContent({
        model: "models/gemini-1.5-flash",
        contents: {
          parts: [
            { inlineData: { mimeType: blob.type.split(';')[0] || "audio/webm", data: base64Audio } },
            { text: `Transcribe this audio verbatim. The language is likely ${targetLang}. Do not translate. Only output the transcribed text in ${targetLang}.` }
          ]
        }
      });
      
      const text = response.text || "";
      if (text) {
        // 如果已有文本，则换行追加；否则直接替换
        const newText = value ? value + "\n" + text : text;
        onChange(newText);
      }
    } catch (err) {
      console.error("Transcription failed", err);
    } finally {
      setTranscribing(false);
    }
  };

  // 格式化时间显示 (MM:SS)
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="bg-emerald-900 rounded-2xl border border-emerald-800 p-4 space-y-4 shadow-lg shadow-emerald-950/20">
       <div className="flex items-center justify-between">
         <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider">{label}</label>
         {/* 如果有录音，显示播放器 */}
         {audioBlob && <AudioPlayer blob={audioBlob} label="" minimal />}
       </div>

       {/* 文本输入区域 */}
       <textarea
          className="w-full h-40 p-4 bg-emerald-950/50 rounded-xl border border-emerald-800 focus:border-emerald-500 focus:outline-none font-medium text-emerald-100 resize-none text-lg placeholder-emerald-700"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        ></textarea>
        
        {/* 录音按钮区域 */}
        <div className="flex items-center gap-3">
           <button
             onClick={recording ? stopRecording : startRecording}
             className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all border border-transparent ${recording ? 'bg-red-500/20 text-red-400 border-red-500 animate-pulse' : 'bg-emerald-800 text-emerald-200 hover:bg-emerald-700 border-emerald-700'}`}
           >
             {recording ? (
               <>{formatTime(timer)} • Stop & Transcribe</>
             ) : (
               <><Icons.Mic /> Record Voice</>
             )}
           </button>
           {/* 转写状态提示 */}
           {transcribing && (
             <div className="flex items-center gap-2 text-xs text-emerald-300 font-bold bg-emerald-900 px-3 py-2 rounded-lg border border-emerald-700">
               <div className="w-2 h-2 bg-emerald-400 rounded-full animate-ping"></div>
               Transcribing...
             </div>
           )}
        </div>
    </div>
  );
};
