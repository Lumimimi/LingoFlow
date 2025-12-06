
import React, { useState, useEffect, useRef } from "react";
import { Icons } from "./Icons";

// 音频播放器组件
// blob: 音频文件的二进制数据
// label: 显示的标签文本
// minimal: 是否使用极简模式 (用于列表或小空间显示)
export const AudioPlayer = ({ blob, label, minimal = false }: { blob: Blob | null, label: string, minimal?: boolean }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  // 当 blob 变化时，生成新的 blob URL
  useEffect(() => {
    if (blob) {
      const newUrl = URL.createObjectURL(blob);
      setUrl(newUrl);
      // 清理函数：组件卸载或 blob 更新时释放旧 URL，防止内存泄漏
      return () => URL.revokeObjectURL(newUrl);
    }
  }, [blob]);

  if (!url) return <div className="text-emerald-500 italic text-xs">No audio</div>;

  return (
    <div className={`flex items-center gap-3 ${minimal ? 'p-2 bg-emerald-800 rounded-lg' : 'bg-emerald-900 p-4 rounded-2xl shadow-sm border border-emerald-800'}`}>
      <button
        onClick={() => {
          if (audioRef.current) {
            if (isPlaying) audioRef.current.pause();
            else audioRef.current.play();
            setIsPlaying(!isPlaying);
          }
        }}
        className={`${minimal ? 'w-8 h-8' : 'w-10 h-10'} flex flex-shrink-0 items-center justify-center bg-emerald-600 text-white rounded-full hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-900/50`}
      >
        {isPlaying ? <Icons.Pause /> : <Icons.Play />}
      </button>
      {!minimal && (
        <div className="flex flex-col overflow-hidden">
          <span className="font-semibold text-emerald-100 truncate">{label}</span>
        </div>
      )}
      {/* 隐藏的 Audio 元素，负责实际播放 */}
      <audio
        ref={audioRef}
        src={url}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />
    </div>
  );
};
