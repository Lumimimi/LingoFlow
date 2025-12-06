
import React, { useState } from "react";
import { Icons } from "../components/Icons";
import { AudioPlayer } from "../components/AudioPlayer";
import { SessionData } from "../types";

// 学习主页组件：展示单节课程的详情、剧本和历史记录
export const SessionHub = ({ session, onStartPractice }: { session: SessionData, onStartPractice: () => void }) => {
  const [showScript, setShowScript] = useState(true);
  const [textSize, setTextSize] = useState<"text-sm" | "text-base" | "text-lg">("text-base");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // 按时间倒序排列历史记录
  const sortedLogs = [...(session.studyLogs || [])].sort((a, b) => b.timestamp - a.timestamp);

  // 下载音频
  const downloadAudio = async () => {
    if (!session.aiAudioBlob) return;
    const url = URL.createObjectURL(session.aiAudioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title || 'audio'}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 下载剧本
  const downloadScript = () => {
    if (!session.script || session.script.length === 0) return;
    const text = session.script.map(l => `${l.speaker}: ${l.text}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title || 'script'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6 h-[calc(100vh-140px)]">
      {/* 左侧面板：课程源素材 (音频 + 剧本) */}
      <div className="flex flex-col bg-emerald-900 rounded-[2rem] shadow-2xl shadow-emerald-950/50 border border-emerald-800 h-full overflow-hidden">
        <div className="p-5 bg-emerald-800/50 border-b border-emerald-800 flex-shrink-0">
          <div className="flex justify-between items-start mb-2">
             <div>
                <h2 className="text-lg font-bold text-emerald-50 leading-tight mb-1">{session.title || session.topic}</h2>
                <p className="text-xs text-emerald-400 mb-3 line-clamp-1">{session.topic}</p>
             </div>
             <span className="bg-emerald-950 text-emerald-400 text-xs px-2 py-1 rounded-lg border border-emerald-800 font-bold">{session.language}</span>
          </div>
          <AudioPlayer blob={session.aiAudioBlob} label="Source Audio" />
          
          {/* 顶部动作栏：下载按钮 */}
          <div className="flex gap-2 mt-4 pt-2 border-t border-emerald-700/50">
             <button onClick={downloadAudio} disabled={!session.aiAudioBlob} className="flex-1 flex items-center justify-center gap-2 bg-emerald-700/50 hover:bg-emerald-600 text-emerald-100 text-xs font-bold py-2 rounded-xl border border-emerald-600 disabled:opacity-50">
                <Icons.Download className="w-4 h-4"/> Download Audio
             </button>
             <button onClick={downloadScript} disabled={!session.script.length} className="flex-1 flex items-center justify-center gap-2 bg-emerald-700/50 hover:bg-emerald-600 text-emerald-100 text-xs font-bold py-2 rounded-xl border border-emerald-600 disabled:opacity-50">
                <Icons.FileText className="w-4 h-4"/> Download Script
             </button>
          </div>
        </div>

        {/* 脚本显示控制栏 */}
        <div className="px-5 py-2 border-b border-emerald-800 flex items-center justify-between bg-emerald-900 flex-shrink-0">
           <div className="flex gap-2">
              <button onClick={() => setShowScript(!showScript)} className="text-emerald-400 text-xs font-bold hover:bg-emerald-800 px-2 py-1 rounded border border-emerald-800">
                {showScript ? "Hide Script" : "Show Script"}
              </button>
              {showScript && (
                <button onClick={() => setTextSize(s => s === 'text-sm' ? 'text-base' : s === 'text-base' ? 'text-lg' : 'text-sm')} className="text-emerald-400 text-xs font-bold hover:bg-emerald-800 px-2 py-1 rounded border border-emerald-800">
                   Size: {textSize === 'text-sm' ? 'S' : textSize === 'text-base' ? 'M' : 'L'}
                </button>
              )}
           </div>
        </div>

        {/* 剧本滚动区域 */}
        <div className="flex-1 overflow-y-auto p-5 transition-all duration-300 scrollbar-thin scrollbar-thumb-emerald-700">
           {showScript ? (
              <div className={`space-y-4 ${textSize}`}>
                  {/* 对话气泡渲染 */}
                  {session.script.map((line, i) => (
                    <div key={i} className={`flex flex-col ${i % 2 === 0 ? 'items-start' : 'items-end'}`}>
                      <div className={`max-w-[90%] p-3 rounded-2xl ${i % 2 === 0 ? 'bg-emerald-800 rounded-tl-none text-emerald-50 border border-emerald-700' : 'bg-teal-900 rounded-tr-none text-teal-50 border border-teal-800'}`}>
                        <span className="text-[10px] font-bold opacity-50 uppercase block mb-1">{line.speaker}</span>
                        <p className="font-medium leading-relaxed opacity-90">{line.text}</p>
                      </div>
                    </div>
                  ))}
                  {/* 词汇表 */}
                  {session.vocabulary && session.vocabulary.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-emerald-800">
                      <h4 className="font-bold text-emerald-400 mb-3 text-sm uppercase tracking-wide">Key Vocabulary</h4>
                      <div className="grid gap-2">
                        {session.vocabulary.map((v, i) => (
                          <div key={i} className="flex items-baseline justify-between text-sm bg-emerald-800/50 p-2 rounded-lg border border-emerald-800">
                            <span className="font-bold text-emerald-200">{v.word}</span>
                            <span className="text-emerald-500 italic">{v.meaning}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
           ) : (
             <div className="h-full flex flex-col items-center justify-center text-emerald-700 italic">
               <Icons.Maximize />
               <span className="mt-2 text-sm">Script hidden</span>
             </div>
           )}
        </div>
      </div>

      {/* 右侧面板：历史记录 */}
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h3 className="text-lg font-bold text-emerald-100">History</h3>
          <button onClick={onStartPractice} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-xl shadow-lg shadow-emerald-900 text-sm flex items-center gap-2 border border-emerald-500">
            <Icons.Cat className="w-5 h-5" /> New Run
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2 pb-4">
          {sortedLogs.length === 0 ? (
            <div className="text-center py-10 text-emerald-600 bg-emerald-900/50 rounded-3xl border border-dashed border-emerald-800">
               No practices yet.
            </div>
          ) : (
            sortedLogs.map((log, idx) => {
              const isExpanded = expandedLogId === log.id || (expandedLogId === null && idx === 0);
              return (
                <div key={log.id} className="bg-emerald-900 rounded-2xl shadow-lg border border-emerald-800 overflow-hidden">
                  <div 
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="p-3 flex items-center justify-between cursor-pointer hover:bg-emerald-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                       <span className="bg-emerald-800 text-emerald-300 text-xs font-bold px-2 py-1 rounded-md border border-emerald-700">#{sortedLogs.length - idx}</span>
                       <span className="text-xs text-emerald-400 font-medium">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <div className={`text-xs text-emerald-500 ${isExpanded ? 'rotate-180' : ''}`}>▼</div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 pt-0 border-t border-emerald-800 grid gap-4">
                       <div className="grid grid-cols-2 gap-4 mt-4">
                          {/* 初次尝试 */}
                          <div className="bg-emerald-800/50 p-3 rounded-xl border border-emerald-800">
                             <span className="text-[10px] font-bold text-emerald-400 uppercase block mb-2">First Attempt</span>
                             <AudioPlayer blob={log.initialAudioBlob} label="" minimal />
                             {log.initialText && (
                               <p className="mt-2 text-xs text-emerald-200 bg-emerald-900 p-2 rounded border border-emerald-700 max-h-20 overflow-y-auto">
                                 {log.initialText}
                               </p>
                             )}
                          </div>
                          {/* 最终成果 */}
                          <div className="bg-teal-900/50 p-3 rounded-xl border border-teal-800">
                             <span className="text-[10px] font-bold text-teal-400 uppercase block mb-2">Final Attempt</span>
                             <AudioPlayer blob={log.finalAudioBlob} label="" minimal />
                             {log.finalText && (
                               <p className="mt-2 text-xs text-teal-200 bg-teal-950 p-2 rounded border border-teal-800 max-h-20 overflow-y-auto">
                                 {log.finalText}
                               </p>
                             )}
                          </div>
                       </div>
                       
                       {/* AI 反馈 */}
                       {log.aiCorrection && (
                        <div className="bg-emerald-900 border border-emerald-800 p-3 rounded-xl">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase block mb-2">AI Review</span>
                            <div className="prose prose-sm prose-invert prose-emerald text-base text-emerald-100" dangerouslySetInnerHTML={{ __html: log.aiCorrection }} />
                        </div>
                       )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
