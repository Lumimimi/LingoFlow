
import React, { useState, useEffect, useRef } from "react";
import { GoogleGenAI } from "@google/genai";
import { AudioPlayer } from "../components/AudioPlayer";
import { HybridInput } from "../components/HybridInput";
import { SessionData, StudyLog } from "../types";
import { base64ToUint8Array, pcmToWav, getDurationFromPCM, mergePCMs, getApiKey, generateSpeechWithCloudTTS } from "../utils";
import { Icons } from "../components/Icons";

// 练习模式组件：实现 7 步闭环训练法
export const PracticeMode = ({ session, onComplete, onSaveProgress }: { 
  session: SessionData, 
  onComplete: (s: SessionData) => Promise<void>,
  onSaveProgress: (s: SessionData) => Promise<void>
}) => {
  const [step, setStep] = useState(0); // 当前步骤 (0-7)
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(""); // 生成进度提示
  const [error, setError] = useState<string | null>(null);

  // 状态变量：存储各个步骤的用户输入和音频
  const [initialAudio, setInitialAudio] = useState<Blob | null>(null);
  const [initialText, setInitialText] = useState("");
  const [showOralFeedback, setShowOralFeedback] = useState(false);
  
  const [userDraft, setUserDraft] = useState("");
  const [draftAudio, setDraftAudio] = useState<Blob | null>(null); 
  const [showDraftFeedback, setShowDraftFeedback] = useState(false);
  
  const [finalAudio, setFinalAudio] = useState<Blob | null>(null);
  const [finalText, setFinalText] = useState("");
  const [showFinalFeedback, setShowFinalFeedback] = useState(false);
  
  const [aiCorrection, setAiCorrection] = useState("");

  // 影子跟读模式：全文 / 逐句 / 自动循环
  const [shadowingMode, setShadowingMode] = useState<'full' | 'sentence' | 'auto'>('full');
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null); // 当前高亮的句子
  const [autoLoopTimer, setAutoLoopTimer] = useState<number | null>(null); // 倒计时
  const mainAudioRef = useRef<HTMLAudioElement | null>(null); // Step 6 音频引用
  
  // 定时器引用，用于清理
  const loopTimeoutRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  // 初始化：如果没有剧本则生成，否则直接开始 Step 1
  useEffect(() => {
    if (session.script.length === 0) {
      generateContent();
    } else {
      setStep(1);
    }
  }, []);

  // 清理函数：组件卸载时停止播放和定时器
  useEffect(() => {
      return () => {
          stopAutoLoop();
      };
  }, []);

  // 核心生成逻辑：创建剧本并逐句合成 TTS 音频
  const generateContent = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiKey = getApiKey();
      if (!apiKey) throw new Error("API Key missing. Please check Settings.");
      const ai = new GoogleGenAI({ apiKey });
      const wordCount = session.difficulty * 120; 
      const lang = session.language || "German";
      const isMonologue = session.format === 'monologue';
      
      // 1. 生成剧本 JSON
      // 更新 Prompt：增加 grammarNotes 字段要求
      setLoadingProgress("Writing Script...");
      const scriptPrompt = `
        Create a ${isMonologue ? 'monologue' : 'dialogue'} in ${lang} about: "${session.topic}".
        Target Length: ~${wordCount} words.
        Format: JSON.
        {
          "dialogue": [{"speaker": "Speaker Name", "text": "Content..."}],
          "vocabulary": [{"word": "${lang} word", "meaning": "English Definition"}],
          "grammarNotes": [{"phrase": "Key Phrase/Structure", "explanation": "Brief explanation"}]
        }
      `;

      const scriptResp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: scriptPrompt,
        config: { responseMimeType: 'application/json' }
      });
      
      const scriptJson = JSON.parse(scriptResp.text || "{}");
      if (!scriptJson.dialogue) throw new Error("Invalid JSON");
      
      const dialogueLines = scriptJson.dialogue;

      // 2. 识别角色并分配声音 (Gender Mapping)
      const uniqueSpeakers = Array.from(new Set(dialogueLines.map((l: any) => l.speaker)));
      const voices = ['Fenrir', 'Kore', 'Puck', 'Charon'];
      const speakerVoiceMap: Record<string, string> = {};

      if (isMonologue) {
         uniqueSpeakers.forEach(s => speakerVoiceMap[s as string] = 'Fenrir');
      } else {
         uniqueSpeakers.forEach((s, idx) => {
            speakerVoiceMap[s as string] = voices[idx % voices.length];
         });
      }

      // 3. 逐句生成 TTS 并记录时间戳（使用 Cloud Text-to-Speech API）
      const audioBlobs: Blob[] = [];
      let currentTime = 0;
      let hasAudio = false; // 标记是否成功生成了音频

      for (let i = 0; i < dialogueLines.length; i++) {
         const line = dialogueLines[i];
         setLoadingProgress(`Synthesizing Line ${i + 1}/${dialogueLines.length}...`);

         try {
             // 使用 Cloud TTS API 生成语音
             const audioBlob = await generateSpeechWithCloudTTS(line.text, lang);

             if (audioBlob) {
                // 创建临时 Audio 元素来获取时长
                const audioUrl = URL.createObjectURL(audioBlob);
                const audio = new Audio(audioUrl);

                await new Promise<void>((resolve) => {
                   audio.addEventListener('loadedmetadata', () => {
                      const duration = audio.duration;

                      line.startTime = currentTime;
                      line.endTime = currentTime + duration;

                      currentTime += duration;
                      audioBlobs.push(audioBlob);
                      hasAudio = true;

                      URL.revokeObjectURL(audioUrl);
                      resolve();
                   });

                   audio.addEventListener('error', () => {
                      URL.revokeObjectURL(audioUrl);
                      resolve();
                   });
                });
             }
         } catch (e) {
             console.warn(`Failed to generate audio for line ${i}`, e);
             // 如果失败，仅跳过音频，保留文本，允许降级运行
         }
      }

      // 4. 合并所有音频片段（如果有音频）
      let audioBlob = null;
      if (hasAudio && audioBlobs.length > 0) {
          setLoadingProgress("Merging Audio...");
          // 合并多个 WAV 文件
          const pcmChunks: Uint8Array[] = [];
          for (const blob of audioBlobs) {
             const arrayBuffer = await blob.arrayBuffer();
             // 跳过 WAV 头部（44字节），只取PCM数据
             const pcmData = new Uint8Array(arrayBuffer.slice(44));
             pcmChunks.push(pcmData);
          }
          const fullPCM = mergePCMs(pcmChunks);
          audioBlob = pcmToWav(fullPCM, 24000);
      } else {
          setLoadingProgress("Audio generation skipped (API limits).");
      }

      const updatedSession = {
        ...session,
        script: dialogueLines,
        vocabulary: scriptJson.vocabulary,
        grammarNotes: scriptJson.grammarNotes || [], // 保存语法笔记
        aiAudioBlob: audioBlob
      };
      await onSaveProgress(updatedSession);
      Object.assign(session, updatedSession); 
      setStep(1);

    } catch (err: any) {
      console.error(err);
      setError("Error: " + err.message);
    } finally {
      setLoading(false);
      setLoadingProgress("");
    }
  };

  // AI 纠错逻辑
  const analyzeWriting = async (draft: string, type: 'oral' | 'draft' | 'final') => {
    setLoading(true);
    try {
      const apiKey = getApiKey();
      if (!apiKey) throw new Error("API Key missing. Please check Settings.");
      const ai = new GoogleGenAI({ apiKey });
      const lang = session.language || "German";
      const analysisPrompt = `
        Act as a strictly helpful ${lang} language editor.
        Compare the User's Text to what a native professional would say.
        User's Text: "${draft}"
        Output HTML ONLY. 
        Display the user's text but with corrections inline using these classes:
        - Incorrect parts: <span class="text-red-400 line-through mx-1">[bad]</span>
        - Corrected parts: <span class="text-emerald-400 font-bold mx-1">[good]</span>
        - Keep correct parts as plain text.
        Example: "Ich <span class="text-red-400 line-through mx-1">bin</span> <span class="text-emerald-400 font-bold mx-1">habe</span> gegessen."
        Keep it large and readable. No explanations, just the diff.
      `;
      const resp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: analysisPrompt
      });
      
      const correctionHTML = resp.text || "";
      setAiCorrection(prev => prev + `<div class="mb-4"><h4 class="font-bold uppercase text-[10px] text-emerald-500 mb-1">${type} Review</h4>${correctionHTML}</div>`);
      
      if (type === 'oral') setShowOralFeedback(true);
      if (type === 'draft') setShowDraftFeedback(true);
      if (type === 'final') setShowFinalFeedback(true);

    } catch (e: any) {
      setError("Analysis failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // 播放单句逻辑
  const playLine = (startTime: number, endTime: number) => {
    if (mainAudioRef.current) {
        stopAutoLoop(); 
        mainAudioRef.current.currentTime = startTime;
        mainAudioRef.current.play();
        
        const checkTime = () => {
            if (mainAudioRef.current && mainAudioRef.current.currentTime >= endTime) {
                mainAudioRef.current.pause();
                mainAudioRef.current.removeEventListener('timeupdate', checkTime);
            }
        };
        mainAudioRef.current.addEventListener('timeupdate', checkTime);
    }
  };

  // 停止自动循环
  const stopAutoLoop = () => {
      if (loopTimeoutRef.current) window.clearTimeout(loopTimeoutRef.current);
      if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current);
      if (mainAudioRef.current) mainAudioRef.current.pause();
      setAutoLoopTimer(null);
      setActiveLineIndex(null);
  };

  // 自动循环跟读逻辑
  const runAutoLoop = (startIndex: number = 0) => {
      if (!mainAudioRef.current) return;
      if (startIndex >= session.script.length) {
          setShadowingMode('full'); 
          return;
      }

      const line = session.script[startIndex];
      if (line.startTime === undefined || line.endTime === undefined) {
          runAutoLoop(startIndex + 1); 
          return;
      }
      
      setActiveLineIndex(startIndex);
      const audio = mainAudioRef.current;
      audio.currentTime = line.startTime;
      audio.play();

      const duration = (line.endTime - line.startTime) * 1000;

      loopTimeoutRef.current = window.setTimeout(() => {
          audio.pause();
          
          let timeLeft = duration;
          countdownIntervalRef.current = window.setInterval(() => {
              timeLeft -= 100;
              setAutoLoopTimer(timeLeft);
              if (timeLeft <= 0) {
                  if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current);
                  setAutoLoopTimer(null);
                  
                  if (shadowingMode === 'auto') {
                      runAutoLoop(startIndex + 1);
                  }
              }
          }, 100);

      }, duration);
  };

  useEffect(() => {
      if (shadowingMode === 'auto') {
          runAutoLoop(0);
      } else {
          stopAutoLoop();
      }
  }, [shadowingMode]);

  const finishSession = async () => {
    const newLog: StudyLog = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      initialAudioBlob: initialAudio,
      initialText: initialText,
      finalAudioBlob: finalAudio,
      finalText: finalText,
      userDraft: userDraft,
      aiCorrection: aiCorrection
    };
    const updatedSession = {
      ...session,
      lastStudiedTimestamp: Date.now(),
      studyLogs: [...(session.studyLogs || []), newLog]
    };
    await onComplete(updatedSession);
  };

  if (loading) return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <div className="w-12 h-12 border-4 border-emerald-800 border-t-emerald-400 rounded-full animate-spin"></div>
        <p className="text-emerald-400 font-medium animate-pulse">{loadingProgress || "Gemini is thinking..."}</p>
      </div>
  );

  if (error) return (
      <div className="bg-red-900/50 p-6 rounded-3xl border border-red-800 text-center">
        <p className="text-red-300 mb-4">{error}</p>
        <button onClick={() => window.location.reload()} className="underline text-red-200 hover:text-white">Retry</button>
      </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-10">
       <div className="flex items-center justify-between px-2 overflow-x-auto pb-2">
         {[1,2,3,4,5,6,7].map((id) => (
             <div key={id} className={`h-1 flex-1 mx-1 rounded-full transition-all ${step >= id ? 'bg-emerald-500' : 'bg-emerald-900'}`} />
         ))}
       </div>
       <div className="text-center text-xs font-bold text-emerald-500 uppercase tracking-widest mb-6">
          Step {step} of 7
       </div>

      {step === 1 && (
        <div className="bg-emerald-900 p-8 rounded-[2rem] shadow-xl shadow-emerald-950/50 border border-emerald-800 text-center space-y-6">
          <h2 className="text-2xl font-bold text-emerald-100">Blind Listen</h2>
          <AudioPlayer blob={session.aiAudioBlob} label="Master Audio" />
          <button onClick={() => setStep(2)} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 border border-emerald-500 shadow-lg shadow-emerald-900/50">Ready</button>
        </div>
      )}

      {step === 2 && (
        <div className="bg-emerald-900 p-8 rounded-[2rem] shadow-xl shadow-emerald-950/50 border border-emerald-800 space-y-6">
          <h2 className="text-2xl font-bold text-emerald-100 text-center">Oral Summary</h2>
          <HybridInput 
            value={initialText} 
            onChange={setInitialText} 
            audioBlob={initialAudio}
            onAudioChange={setInitialAudio}
            placeholder="Recording will appear here..."
            label="Your Summary"
            targetLang={session.language}
          />
          {showOralFeedback ? (
             <div className="bg-emerald-800/30 p-4 rounded-xl border border-emerald-700">
                <div className="text-lg leading-relaxed text-emerald-100" dangerouslySetInnerHTML={{ __html: aiCorrection }} />
                <button onClick={() => setStep(3)} className="w-full mt-4 py-3 bg-emerald-600 text-white rounded-xl font-bold">Continue</button>
             </div>
          ) : (
            <div className="flex gap-4">
              <button 
                 onClick={() => analyzeWriting(initialText, 'oral')} 
                 disabled={!initialText}
                 className="flex-1 py-3 bg-emerald-800 text-emerald-200 rounded-xl font-bold border border-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              >
                 ✨ AI Check
              </button>
              <button 
                 onClick={() => setStep(3)} 
                 className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 shadow-lg"
              >
                 Next ➡️
              </button>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="bg-emerald-900 p-8 rounded-[2rem] shadow-xl shadow-emerald-950/50 border border-emerald-800 text-center space-y-6">
          <h2 className="text-2xl font-bold text-emerald-100">Deep Listen</h2>
          <p className="text-emerald-400 text-sm">Listen again to catch missing details.</p>
          <AudioPlayer blob={session.aiAudioBlob} label="Master Audio" />
          <button onClick={() => setStep(4)} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 border border-emerald-500 shadow-lg shadow-emerald-900/50">Start Writing</button>
        </div>
      )}

      {step === 4 && (
        <div className="bg-emerald-900 p-8 rounded-[2rem] shadow-xl shadow-emerald-950/50 border border-emerald-800 space-y-6">
          <h2 className="text-2xl font-bold text-emerald-100 text-center">Detailed Write-up</h2>
          <HybridInput 
            value={userDraft} 
            onChange={setUserDraft} 
            audioBlob={draftAudio}
            onAudioChange={setDraftAudio}
            placeholder="Write full summary..."
            label="Draft"
            targetLang={session.language}
          />
          {showDraftFeedback ? (
             <div className="bg-emerald-800/30 p-4 rounded-xl border border-emerald-700">
                <div className="text-lg leading-relaxed text-emerald-100" dangerouslySetInnerHTML={{ __html: aiCorrection }} />
                <button onClick={() => setStep(5)} className="w-full mt-4 py-3 bg-emerald-600 text-white rounded-xl font-bold">Continue</button>
             </div>
          ) : (
            <div className="flex gap-4">
              <button 
                 onClick={() => analyzeWriting(userDraft, 'draft')} 
                 disabled={!userDraft}
                 className="flex-1 py-3 bg-emerald-800 text-emerald-200 rounded-xl font-bold border border-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              >
                 ✨ AI Check
              </button>
              <button 
                 onClick={() => setStep(5)} 
                 className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 shadow-lg"
              >
                 Next ➡️
              </button>
            </div>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="bg-emerald-900 p-8 rounded-[2rem] shadow-xl shadow-emerald-950/50 border border-emerald-800 space-y-6">
          <h2 className="text-2xl font-bold text-emerald-100 text-center">Review</h2>
          <p className="text-emerald-400 text-sm text-center">Take a moment to study the corrections above.</p>
           <div className="bg-emerald-800/50 p-6 rounded-xl text-emerald-100 text-lg leading-relaxed border border-emerald-700" dangerouslySetInnerHTML={{ __html: aiCorrection }} />
          <button onClick={() => setStep(6)} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 border border-emerald-500 shadow-lg shadow-emerald-900/50">Start Shadowing</button>
        </div>
      )}

      {step === 6 && (
        <div className="bg-emerald-900 p-8 rounded-[2rem] shadow-xl shadow-emerald-950/50 border border-emerald-800 space-y-6">
          <h2 className="text-2xl font-bold text-emerald-100 text-center">Shadowing</h2>
          
          <div className="flex justify-center gap-2 text-sm font-bold text-emerald-400 bg-emerald-800/50 p-2 rounded-xl inline-flex mx-auto flex-wrap">
             <button onClick={() => setShadowingMode('full')} className={`px-3 py-1 rounded-lg ${shadowingMode === 'full' ? 'bg-emerald-600 text-white' : 'hover:text-emerald-200'}`}>Full</button>
             <button onClick={() => setShadowingMode('sentence')} className={`px-3 py-1 rounded-lg ${shadowingMode === 'sentence' ? 'bg-emerald-600 text-white' : 'hover:text-emerald-200'}`}>Manual</button>
             <button onClick={() => setShadowingMode('auto')} className={`px-3 py-1 rounded-lg flex items-center gap-1 ${shadowingMode === 'auto' ? 'bg-emerald-600 text-white' : 'hover:text-emerald-200'}`}>
                Auto Loop {shadowingMode === 'auto' && <span className="w-2 h-2 bg-white rounded-full animate-pulse"/>}
             </button>
          </div>

          <audio ref={mainAudioRef} src={session.aiAudioBlob ? URL.createObjectURL(session.aiAudioBlob) : ""} />

          {shadowingMode === 'full' ? (
             <div className="sticky top-0 bg-emerald-900 z-10 pb-2 border-b border-emerald-800"><AudioPlayer blob={session.aiAudioBlob} label="Original" /></div>
          ) : (
             <div className="text-center text-xs text-emerald-500 italic mb-2">
                 {shadowingMode === 'auto' ? "Playing -> Pausing -> Playing..." : "Click ▶ to play individual sentences"}
             </div>
          )}

          <div className="h-60 overflow-y-auto bg-emerald-950/50 p-4 rounded-xl space-y-2 text-base text-emerald-100 border border-emerald-800 scrollbar-thin scrollbar-thumb-emerald-700 font-medium">
             {session.script.map((line, i) => (
                <div key={i} className={`mb-3 flex gap-3 items-start transition-all p-2 rounded-lg ${activeLineIndex === i ? 'bg-emerald-800/60 border border-emerald-600 shadow-md' : 'border border-transparent'}`}>
                   {line.startTime !== undefined && (
                      <button 
                        onClick={() => {
                            setShadowingMode('sentence'); 
                            playLine(line.startTime!, line.endTime!);
                        }}
                        disabled={shadowingMode === 'auto'}
                        className="mt-1 w-6 h-6 rounded-full bg-emerald-800 hover:bg-emerald-500 text-emerald-300 hover:text-white flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-30"
                      >
                         <Icons.Play className="w-3 h-3" />
                      </button>
                   )}
                   <div className="flex-1">
                      <strong className="text-emerald-400 text-xs uppercase tracking-wide block mb-1">{line.speaker}</strong> 
                      <p>{line.text}</p>
                      {activeLineIndex === i && autoLoopTimer !== null && (
                          <div className="mt-2 h-1 bg-emerald-900 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-400 transition-all duration-100" style={{ width: `${(autoLoopTimer / ((line.endTime! - line.startTime!) * 1000)) * 100}%` }}></div>
                          </div>
                      )}
                   </div>
                </div>
             ))}
          </div>
          <button onClick={() => setStep(7)} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 border border-emerald-500 shadow-lg shadow-emerald-900/50">Final Step</button>
        </div>
      )}

      {step === 7 && (
        <div className="bg-emerald-900 p-8 rounded-[2rem] shadow-xl shadow-emerald-950/50 border border-emerald-800 space-y-6">
          <h2 className="text-2xl font-bold text-emerald-100 text-center">Final Retell</h2>
          <HybridInput 
            value={finalText} 
            onChange={setFinalText} 
            audioBlob={finalAudio}
            onAudioChange={setFinalAudio}
            placeholder="Final perfect version..."
            label="Final Output"
            targetLang={session.language}
          />
          {showFinalFeedback ? (
             <div className="bg-emerald-800/30 p-4 rounded-xl border border-emerald-700">
                <div className="text-lg leading-relaxed text-emerald-100" dangerouslySetInnerHTML={{ __html: aiCorrection }} />
                <button onClick={finishSession} className="w-full mt-4 py-3 bg-emerald-600 text-white rounded-xl font-bold">Complete Session</button>
             </div>
          ) : (
            <div className="flex gap-4">
              <button 
                 onClick={() => analyzeWriting(finalText, 'final')} 
                 disabled={!finalText}
                 className="flex-1 py-3 bg-emerald-800 text-emerald-200 rounded-xl font-bold border border-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              >
                 ✨ AI Check
              </button>
              <button onClick={finishSession} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 shadow-lg">
                 Complete ➡️
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};