
import React, { useState, useEffect, useRef } from "react";
import { Icons } from "../components/Icons";
import { SessionData } from "../types";

// 播放器模式组件：磨耳朵模式
// 允许用户创建播放列表，循环播放已生成的课程音频
export const PlayerMode = ({ sessions }: { sessions: SessionData[] }) => {
  const [playlist, setPlaylist] = useState<string[]>([]); // 播放列表 (Session IDs)
  const [currentIdx, setCurrentIdx] = useState(-1); // 当前播放索引
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true); // 是否循环播放
  const [playerMode, setPlayerMode] = useState<'continuous' | 'shadowing'>('continuous'); // 播放模式
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  // 影子跟读倒计时
  const [shadowPause, setShadowPause] = useState<number | null>(null);
  const processingShadowRef = useRef<string | null>(null); // 锁：防止重复触发暂停

  // 过滤出有音频的 Session
  const playableSessions = sessions.filter(s => s.aiAudioBlob);
  
  // 获取当前 Session 对象
  const currentSession = currentIdx >= 0 && playlist[currentIdx] ? sessions.find(s => s.id === playlist[currentIdx]) : null;

  // 切换选中状态
  const toggleSelection = (id: string) => {
    setPlaylist(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  // 全选/反选
  const selectAll = () => {
    if (playlist.length === playableSessions.length) setPlaylist([]);
    else setPlaylist(playableSessions.map(s => s.id));
  };

  // 监听当前索引变化，加载音频并播放
  useEffect(() => {
    let isMounted = true;
    let url: string | null = null;
    processingShadowRef.current = null; // 重置锁

    if (currentIdx >= 0 && currentIdx < playlist.length) {
      const sessionId = playlist[currentIdx];
      const session = sessions.find(s => s.id === sessionId);
      if (session?.aiAudioBlob) {
        url = URL.createObjectURL(session.aiAudioBlob);
        setCurrentUrl(url);

        const timer = setTimeout(() => {
           if (!isMounted || !audioRef.current) return;
           const playPromise = audioRef.current.play();
           if (playPromise !== undefined) {
             playPromise
               .then(() => { if (isMounted) setIsPlaying(true); })
               .catch(error => { console.log("Playback interrupted:", error); if (isMounted) setIsPlaying(false); });
           }
        }, 50); 

        return () => {
          isMounted = false;
          clearTimeout(timer);
          if (url) URL.revokeObjectURL(url);
        };
      }
    }
  }, [currentIdx, playlist]);

  // 更新播放进度
  const handleTimeUpdate = () => {
      if (audioRef.current) {
          const t = audioRef.current.currentTime;
          setCurrentTime(t);
          
          // 如果是跟读模式 (Shadowing)，检测是否播放完一句，如果是，暂停等待
          if (playerMode === 'shadowing' && currentSession?.script && isPlaying) {
              const activeLine = currentSession.script.find(l => l.startTime !== undefined && l.endTime !== undefined && t >= l.startTime && t <= l.endTime);
              
              if (activeLine && activeLine.endTime && t >= activeLine.endTime - 0.1) {
                  const lineId = `${currentSession.id}-${activeLine.startTime}`;
                  if (processingShadowRef.current === lineId) return; // 已经处理过这一句
                  
                  processingShadowRef.current = lineId;
                  
                  // 1. 暂停
                  audioRef.current.pause();
                  setIsPlaying(false);
                  
                  // 2. 倒计时
                  const duration = (activeLine.endTime - (activeLine.startTime || 0)) * 1000;
                  let timeLeft = duration;
                  setShadowPause(timeLeft);
                  
                  const interval = setInterval(() => {
                      timeLeft -= 100;
                      setShadowPause(timeLeft);
                      if (timeLeft <= 0) {
                          clearInterval(interval);
                          setShadowPause(null);
                          // 3. 继续播放
                          if (audioRef.current) {
                              audioRef.current.play();
                              setIsPlaying(true);
                          }
                      }
                  }, 100);
              }
          }
      }
  };

  // 下一首
  const handleNext = () => {
    if (currentIdx < playlist.length - 1) {
      setCurrentIdx(c => c + 1);
    } else if (isLooping && playlist.length > 0) {
      setCurrentIdx(0); // 循环到开头
    } else {
      setIsPlaying(false);
    }
  };

  // 上一首
  const handlePrev = () => {
    if (currentIdx > 0) setCurrentIdx(c => c - 1);
  };

  // 播放/暂停
  const togglePlay = () => {
    // 修复：如果没有播放任何歌曲，点击播放键自动播放第一首
    if (currentIdx === -1 && playlist.length > 0) {
        setCurrentIdx(0);
        return;
    }

    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
      {/* 左侧：播放列表 */}
      <div className="lg:col-span-1 bg-emerald-900 rounded-[2rem] border border-emerald-800 flex flex-col overflow-hidden shadow-xl shadow-emerald-950/50">
        <div className="p-4 border-b border-emerald-800 flex items-center justify-between bg-emerald-800/30">
          <h2 className="font-bold text-emerald-100 flex items-center gap-2 text-sm"><Icons.Headphones /> Tracks</h2>
          <button onClick={selectAll} className="text-[10px] font-bold text-emerald-400 border border-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-800">
             {playlist.length === playableSessions.length ? "Clear" : "All"}
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-2 space-y-1">
          {playableSessions.map(s => {
             const isSelected = playlist.includes(s.id);
             const isActive = currentIdx >= 0 && playlist[currentIdx] === s.id;
             return (
               <div 
                 key={s.id} 
                 onClick={() => toggleSelection(s.id)}
                 className={`p-2 rounded-xl flex items-center justify-between cursor-pointer border transition-all ${isActive ? 'bg-emerald-700/50 border-emerald-500 shadow-md' : isSelected ? 'bg-emerald-800/30 border-emerald-700' : 'hover:bg-emerald-800/50 border-transparent'}`}
               >
                 <div className="flex items-center gap-2 overflow-hidden">
                   <div className={`w-4 h-4 rounded-md border flex flex-shrink-0 items-center justify-center transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-emerald-600'}`}>
                      {isSelected && <Icons.Check className="w-2 h-2 text-emerald-900" />}
                   </div>
                   <div className="truncate">
                      <h4 className={`font-bold text-xs truncate ${isActive ? 'text-white' : 'text-emerald-200'}`}>{s.title || s.topic}</h4>
                   </div>
                 </div>
                 {isActive && <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0"></div>}
               </div>
             );
          })}
        </div>
      </div>

      {/* 右侧：播放器与剧本显示 */}
      <div className="lg:col-span-2 bg-emerald-950 rounded-[2rem] border border-emerald-800 p-0 flex flex-col shadow-2xl overflow-hidden relative">
         {/* 播放器控制栏 */}
         <div className="p-6 border-b border-emerald-800 flex items-center gap-6 bg-emerald-900/50">
             <div className="w-16 h-16 bg-emerald-900 rounded-full flex items-center justify-center border border-emerald-800 flex-shrink-0 relative">
                 <Icons.Wave className={`w-8 h-8 text-emerald-500 ${isPlaying ? 'animate-pulse' : ''}`} />
                 {/* 倒计时覆盖层 */}
                 {shadowPause !== null && (
                     <div className="absolute inset-0 bg-emerald-900/90 rounded-full flex items-center justify-center">
                         <span className="text-white font-bold text-sm">{(shadowPause/1000).toFixed(1)}s</span>
                     </div>
                 )}
             </div>
             <div className="flex-1 overflow-hidden">
                 <h3 className="font-bold text-lg text-emerald-100 truncate">
                   {currentSession?.title || "No Track Selected"}
                 </h3>
                 <p className="text-xs text-emerald-500 uppercase font-bold">
                     {shadowPause !== null ? "Shadowing Pause..." : "Now Playing"}
                 </p>
             </div>
             <div className="flex items-center gap-3">
                 <button onClick={handlePrev} className="p-2 text-emerald-400 hover:text-white"><Icons.Prev/></button>
                 <button onClick={togglePlay} className="w-12 h-12 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95">
                    {isPlaying ? <Icons.Pause /> : <Icons.Play />}
                 </button>
                 <button onClick={handleNext} className="p-2 text-emerald-400 hover:text-white"><Icons.Next/></button>
             </div>
         </div>

         {/* 剧本同步显示区 */}
         <div className="flex-1 overflow-y-auto p-6 space-y-3 scrollbar-thin scrollbar-thumb-emerald-700 bg-emerald-950">
             {currentSession?.script ? (
                 currentSession.script.map((line, i) => {
                     // 判断当前行是否正在播放
                     const isActive = line.startTime !== undefined && line.endTime !== undefined && currentTime >= line.startTime && currentTime <= line.endTime;
                     return (
                         <div 
                           key={i} 
                           className={`p-3 rounded-xl border transition-all duration-300 ${isActive ? 'bg-emerald-800/80 border-emerald-500 scale-[1.02] shadow-lg' : 'border-transparent opacity-60'}`}
                           ref={isActive ? (el) => el?.scrollIntoView({ behavior: 'smooth', block: 'center' }) : null}
                         >
                             <span className="text-[10px] font-bold text-emerald-400 uppercase mb-1 block">{line.speaker}</span>
                             <p className="text-sm font-medium text-emerald-100">{line.text}</p>
                         </div>
                     )
                 })
             ) : (
                 <div className="h-full flex items-center justify-center text-emerald-700 italic">No Script Available</div>
             )}
         </div>

         {/* 底部模式切换 */}
         <div className="p-3 bg-emerald-900/80 border-t border-emerald-800 flex justify-between items-center text-xs font-bold text-emerald-400">
             <button onClick={() => setIsLooping(!isLooping)} className="flex items-center gap-2 hover:text-emerald-200">
                <Icons.Repeat className="w-3 h-3"/> {isLooping ? "Loop All" : "One Pass"}
             </button>
             <div className="flex bg-emerald-800 rounded-lg p-1">
                 <button onClick={() => setPlayerMode('continuous')} className={`px-3 py-1 rounded ${playerMode === 'continuous' ? 'bg-emerald-600 text-white' : 'hover:text-emerald-200'}`}>Stream</button>
                 <button onClick={() => setPlayerMode('shadowing')} className={`px-3 py-1 rounded ${playerMode === 'shadowing' ? 'bg-emerald-600 text-white' : 'hover:text-emerald-200'}`}>Shadowing</button>
             </div>
         </div>

         <audio 
           ref={audioRef} 
           src={currentUrl || ""} 
           onEnded={handleNext} 
           onTimeUpdate={handleTimeUpdate}
         />
      </div>
    </div>
  );
};
