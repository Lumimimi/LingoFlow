
import React, { useState, useEffect, useRef } from "react";
import { Icons } from "./components/Icons";
import { Dashboard, BatchImportData } from "./views/Dashboard";
import { PlayerMode } from "./views/PlayerMode";
import { SessionHub } from "./views/SessionHub";
import { PracticeMode } from "./views/PracticeMode";
import { SessionData, DialogueLine, StudyLog } from "./types";
import { saveSession, getAllSessions, deleteSession, clearDatabase } from "./db";
import { createBatchZip, estimateTimestamps } from "./utils";

// 主应用程序组件
export default function App() {
  // 视图状态路由: dashboard (列表), hub (详情), practice (练习), player (播放器)
  const [view, setView] = useState<"dashboard" | "hub" | "practice" | "player">("dashboard");
  
  // 数据状态
  const [history, setHistory] = useState<SessionData[]>([]);
  const [currentSession, setCurrentSession] = useState<SessionData | null>(null);
  
  // UI 状态
  const [showSettings, setShowSettings] = useState(false);
  const [storageUsage, setStorageUsage] = useState<string | null>(null);
  const [userApiKey, setUserApiKey] = useState(""); // 用户手动输入的 API Key

  // 引用设置菜单容器，用于检测点击外部关闭
  const settingsRef = useRef<HTMLDivElement>(null);

  // 初始化加载数据
  useEffect(() => {
    loadHistory();
    // 加载本地保存的 API Key
    const savedKey = localStorage.getItem("lingoflow_apikey");
    if (savedKey) setUserApiKey(savedKey);
  }, []);

  // 监听 API Key 变化并保存
  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const key = e.target.value;
    setUserApiKey(key);
    localStorage.setItem("lingoflow_apikey", key);
  };

  // 监听点击外部关闭设置菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showSettings && settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSettings]);

  // 从 IndexedDB 加载历史会话
  const loadHistory = async () => {
    const sessions = await getAllSessions();
    setHistory(sessions);
  };

  // 估算本地存储占用空间
  const checkStorage = async () => {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      if (estimate.usage) {
        const mb = (estimate.usage / (1024 * 1024)).toFixed(2);
        setStorageUsage(mb);
      }
    }
  };

  // 创建新会话 (AI 生成)
  const createSession = async (title: string, prompt: string, difficulty: number, tags: string[], language: string, format: 'dialogue' | 'monologue') => {
    const newSession: SessionData = {
      id: crypto.randomUUID(),
      createdTimestamp: Date.now(),
      lastStudiedTimestamp: Date.now(),
      title,
      topic: prompt,
      tags,
      difficulty,
      language,
      format,
      script: [],
      vocabulary: [],
      grammarNotes: [],
      aiAudioBlob: null,
      studyLogs: [],
    };
    setCurrentSession(newSession);
    setView("practice"); // 跳转到练习模式
  };

  // 单个会话导入辅助函数
  const importSingleSession = async (title: string, language: string, tags: string[], scriptText: string, audioBlob: Blob) => {
    // 1. 获取音频总时长，用于估算时间戳
    let duration = 0;
    try {
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        
        // 使用 Promise.race 增加超时机制，防止加载卡死
        const loadedMetadata = new Promise<boolean>((resolve) => {
            audio.onloadedmetadata = () => {
                duration = audio.duration;
                resolve(true);
            };
            audio.onerror = () => resolve(false);
        });

        // 1秒超时保护
        const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1000));

        await Promise.race([loadedMetadata, timeout]);
        
        URL.revokeObjectURL(url);
    } catch (e) {
        console.warn("Could not determine audio duration:", e);
    }

    // 2. 解析脚本文本 (格式: Speaker: Text)
    let script: DialogueLine[] = scriptText.split('\n').filter(line => line.trim()).map(line => {
      const parts = line.split(':');
      if (parts.length > 1) {
        return { speaker: parts[0].trim(), text: parts.slice(1).join(':').trim() };
      }
      return { speaker: "Text", text: line.trim() };
    });

    // 3. 如果成功获取了时长，则自动估算每句话的开始和结束时间
    if (duration > 0 && script.length > 0) {
        script = estimateTimestamps(script, duration);
    }

    const newSession: SessionData = {
      id: crypto.randomUUID(),
      createdTimestamp: Date.now(),
      lastStudiedTimestamp: Date.now(),
      title,
      topic: "Imported Session",
      tags,
      difficulty: Math.ceil(duration / 60) || 1, 
      language,
      format: 'monologue', 
      script,
      vocabulary: [],
      grammarNotes: [], // 初始化为空，待练习时 AI 补充
      aiAudioBlob: audioBlob,
      studyLogs: []
    };
    
    await saveSession(newSession);
  };

  // 批量导入处理逻辑
  const processBatchImport = async (audioFiles: File[], scriptFiles: File[]) => {
      // 遍历音频文件进行匹配
      for (const audio of audioFiles) {
          const baseName = audio.name.replace(/\.[^/.]+$/, "");
          // 查找同名脚本
          const script = scriptFiles.find(s => s.name.replace(/\.[^/.]+$/, "").toLowerCase() === baseName.toLowerCase());
          
          let scriptText = "Text: Audio content only (No script provided)";
          if (script) {
              scriptText = await script.text();
          }

          await importSingleSession(
              baseName, 
              "German", // 默认语言
              ['imported'], 
              scriptText, 
              audio
          );
      }
      loadHistory();
      alert(`Successfully imported ${audioFiles.length} sessions!`);
  };

  // Dashboard 传来的批量导入
  const handleBatchImport = async (data: BatchImportData[]) => {
     for (const item of data) {
        await importSingleSession(item.title, item.language, item.tags, item.scriptText, item.audioBlob);
     }
     loadHistory();
     if (data.length === 1) {
        const sessions = await getAllSessions();
        const latest = sessions.sort((a,b) => b.createdTimestamp - a.createdTimestamp)[0];
        if (latest) openSessionHub(latest);
     }
  };

  // 全局设置菜单中的导入处理
  const handleSettingsImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      const files = Array.from(e.target.files) as File[];
      
      // 分离音频和文本
      const audioFiles = files.filter(f => f.type.startsWith('audio/') || f.name.match(/\.(mp3|wav|m4a|ogg)$/i));
      const scriptFiles = files.filter(f => f.type.startsWith('text/') || f.name.endsWith('.txt'));

      if (audioFiles.length === 0) {
          alert("No audio files found in selection.");
          return;
      }

      await processBatchImport(audioFiles, scriptFiles);
      e.target.value = ''; // 重置 input 以允许重复选择
  };

  // 批量下载所有资源 (ZIP)
  const handleDownloadZip = async () => {
    try {
        const sessions = await getAllSessions();
        if (sessions.length === 0) {
            alert("No data to download.");
            return;
        }
        const blob = await createBatchZip(sessions);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `LingoFlow_Assets_${new Date().toISOString().split('T')[0]}.zip`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e: any) {
        console.error(e);
        alert("Failed to create ZIP: " + e.message);
    }
  };

  const openSessionHub = (session: SessionData) => {
    setCurrentSession(session);
    setView("hub");
  };

  const startPractice = () => {
    setView("practice");
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    // 关键修复：确认弹窗已移至 Dashboard 组件内，此处只执行逻辑
    try {
        await deleteSession(id);
        loadHistory();
        if (currentSession?.id === id) setView("dashboard");
    } catch (err: any) {
        alert("Failed to delete: " + err.message);
    }
  };

  const handleUpdateSession = async (updatedSession: SessionData) => {
    await saveSession(updatedSession);
    setCurrentSession(updatedSession);
    loadHistory();
  };

  const handleClearAll = async () => {
    if (confirm("WARNING: This will delete ALL data. Confirm?")) {
      await clearDatabase();
      loadHistory();
      setView("dashboard");
    }
  };

  // 返回上一级逻辑
  const handleBack = () => {
    if (view === 'practice') {
        setView('hub');
    } else if (view === 'hub' || view === 'player') {
        setView('dashboard');
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto font-sans text-emerald-50">
      {/* 顶部导航栏 */}
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView("dashboard")}>
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-emerald-900/50 overflow-hidden">
             <Icons.Cat className="w-6 h-6" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-emerald-100 tracking-tight leading-none">LingoFlow</h1>
            <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Learn What Matters</span>
          </div>
        </div>
        <div className="flex gap-2">
          {/* 返回按钮 (Dashboard 不显示) */}
          {view !== 'dashboard' && (
             <button 
                onClick={handleBack}
                className="p-2 rounded-xl border bg-emerald-900 border-emerald-800 text-emerald-300 hover:text-emerald-100 hover:bg-emerald-800 transition-colors"
                title="Back"
             >
                <Icons.ArrowLeft className="w-5 h-5"/>
             </button>
          )}

          {/* 播放器模式按钮 */}
          <button 
             onClick={() => setView("player")} 
             className={`p-2 rounded-xl border transition-colors ${view === 'player' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-emerald-900 border-emerald-800 text-emerald-300 hover:text-emerald-100 hover:bg-emerald-800'}`}
             title="Passive Listening Mode"
          >
             <Icons.Headphones />
          </button>
          
          {/* 设置菜单 */}
          <div className="relative" ref={settingsRef}>
            <button 
               onClick={() => { setShowSettings(!showSettings); checkStorage(); }}
               className="text-emerald-300 hover:text-emerald-100 bg-emerald-900 border border-emerald-800 hover:bg-emerald-800 p-2 rounded-xl transition-colors"
            >
              <Icons.Database />
            </button>
            
            {showSettings && (
              <div 
                className="absolute top-full right-0 mt-2 w-80 bg-emerald-900 rounded-2xl shadow-xl shadow-black/50 border border-emerald-700 p-4 z-50"
                onClick={(e) => e.stopPropagation()} 
              >
                <h3 className="font-bold text-emerald-100 mb-2 text-sm">API Configuration</h3>
                <div className="mb-4 flex flex-col gap-2">
                    <input 
                      type="password" 
                      value={userApiKey}
                      onChange={handleApiKeyChange}
                      placeholder="Paste Gemini API Key here"
                      className="w-full bg-emerald-950 text-emerald-100 text-xs p-2 rounded border border-emerald-700 focus:border-emerald-500 focus:outline-none placeholder-emerald-700"
                    />
                </div>
                <p className="text-[9px] text-emerald-500 -mt-2 mb-4">Stored locally in your browser.</p>

                <h3 className="font-bold text-emerald-100 mb-2 text-sm">Assets & Data</h3>
                <div className="space-y-2 mb-4">
                   <label className="w-full text-xs font-bold bg-emerald-700 text-white border border-emerald-600 p-2 rounded-lg hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2 cursor-pointer">
                     <Icons.Upload className="w-4 h-4" /> Import Assets (Batch)
                     <input type="file" multiple className="hidden" onChange={handleSettingsImport} accept=".mp3,.wav,.m4a,.ogg,.txt" />
                   </label>
                   <button onClick={handleDownloadZip} className="w-full text-xs font-bold bg-emerald-900 text-emerald-300 border border-emerald-700 p-2 rounded-lg hover:bg-emerald-800 transition-colors flex items-center justify-center gap-2">
                     <Icons.Download className="w-4 h-4" /> Download All (.zip)
                   </button>
                </div>

                <h3 className="font-bold text-emerald-100 mb-2 text-sm text-red-300">Danger Zone</h3>
                <div className="space-y-2">
                   <button onClick={handleClearAll} className="w-full text-xs font-bold bg-red-900/30 text-red-300 border border-red-900/50 p-2 rounded-lg hover:bg-red-900/50 transition-colors">
                     Clear Database
                   </button>
                </div>
                <div className="mt-4 pt-2 border-t border-emerald-800 flex justify-between items-center text-[10px] text-emerald-500">
                   <span>{history.length} Sessions</span>
                   <span>{storageUsage ? `~${storageUsage} MB` : 'Calc...'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 视图路由渲染 */}
      {view === "dashboard" && (
        <Dashboard 
          history={history} 
          onCreate={createSession} 
          onImport={handleBatchImport}
          onOpen={openSessionHub}
          onDelete={handleDelete}
          onUpdate={handleUpdateSession}
          onDownloadAll={handleDownloadZip}
        />
      )}

      {view === "player" && (
        <PlayerMode sessions={history} />
      )}

      {view === "hub" && currentSession && (
        <SessionHub 
          session={currentSession}
          onStartPractice={startPractice}
        />
      )}

      {view === "practice" && currentSession && (
        <PracticeMode 
          session={currentSession} 
          onComplete={async (updatedSession) => {
             await saveSession(updatedSession);
             setCurrentSession(updatedSession);
             setView("hub"); 
             loadHistory();
          }}
          onSaveProgress={async (s) => {
            await saveSession(s);
          }}
        />
      )}
    </div>
  );
}
