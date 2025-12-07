
import React, { useState, useMemo } from "react";
import { Icons } from "../components/Icons";
import { SessionData } from "../types";

// 批量导入数据结构
export interface BatchImportData {
  title: string;
  language: string;
  tags: string[];
  scriptText: string;
  audioBlob: Blob;
}

// 仪表盘组件属性接口
interface DashboardProps {
  history: SessionData[]; // 历史记录列表
  onCreate: (title: string, prompt: string, difficulty: number, tags: string[], language: string, format: 'dialogue' | 'monologue') => void; // 创建回调 (含格式)
  onImport: (data: BatchImportData[]) => Promise<void>; // 导入回调
  onOpen: (session: SessionData) => void; // 打开 Session 回调
  onDelete: (id: string, e: React.MouseEvent) => void; // 删除回调
  onUpdate: (updatedSession: SessionData) => Promise<void>; // 更新回调
  onDownloadAll: () => void; // 下载全部回调
}

export const Dashboard = ({ history, onCreate, onImport, onOpen, onDelete, onUpdate, onDownloadAll }: DashboardProps) => {
  const [mode, setMode] = useState<'ai' | 'import'>('ai'); // 当前模式：AI 生成 vs 批量导入
  
  // AI 生成模式状态
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [difficulty, setDifficulty] = useState(2);
  const [tagsInput, setTagsInput] = useState("");
  const [language, setLanguage] = useState("German");
  const [format, setFormat] = useState<'dialogue' | 'monologue'>('dialogue'); // 生成格式: 对话/独白

  // 批量导入模式状态
  const [audioFiles, setAudioFiles] = useState<FileList | null>(null);
  const [scriptFiles, setScriptFiles] = useState<FileList | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // 编辑模式状态 (用于在列表上直接修改标题)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  // 智能计算导入预览：根据文件名匹配音频和文本
  const importPreview = useMemo(() => {
    if (!audioFiles || audioFiles.length === 0) return null;
    const audioList = Array.from(audioFiles) as File[];
    const scriptList = scriptFiles ? Array.from(scriptFiles) as File[] : [];
    
    let matchedCount = 0;
    const previewItems = audioList.map(audio => {
        const baseName = audio.name.replace(/\.[^/.]+$/, ""); // 去掉扩展名
        // 不区分大小写匹配同名文本文件
        const script = scriptList.find(s => s.name.replace(/\.[^/.]+$/, "").toLowerCase() === baseName.toLowerCase());
        if (script) matchedCount++;
        return { name: baseName, hasScript: !!script };
    });

    return { total: audioList.length, matched: matchedCount, items: previewItems };
  }, [audioFiles, scriptFiles]);

  // 提交表单处理
  const handleSubmit = async () => {
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);

    if (mode === 'ai') {
       // 处理 AI 生成请求
       if (!title.trim() || !prompt.trim()) return;
       onCreate(title, prompt, difficulty, tags, language, format);
       // 重置表单
       setTitle("");
       setPrompt("");
       setTagsInput("");
    } else {
       // 处理批量导入请求
       if (!audioFiles || audioFiles.length === 0) return;
       setIsImporting(true);
       
       const imports: BatchImportData[] = [];
       const audioList = Array.from(audioFiles) as File[];
       const scriptList = scriptFiles ? Array.from(scriptFiles) as File[] : [];

       // 遍历音频文件进行匹配
       for (const audio of audioList) {
          const baseName = audio.name.replace(/\.[^/.]+$/, "");
          const script = scriptList.find(s => s.name.replace(/\.[^/.]+$/, "").toLowerCase() === baseName.toLowerCase());
          
          let scriptText = "Text: Audio content only (No script provided)";
          if (script) {
             scriptText = await script.text();
          }

          imports.push({
             title: baseName, 
             language: language,
             tags: [...tags, 'imported'],
             scriptText: scriptText,
             audioBlob: audio
          });
       }

       await onImport(imports);
       setIsImporting(false);
       setAudioFiles(null);
       setScriptFiles(null);
       setTagsInput("");
       alert(`Successfully imported ${imports.length} sessions!`);
    }
  };

  // 开始编辑标题
  const startEditing = (s: SessionData, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(s.id);
    setEditTitle(s.title || s.topic);
  };

  // 保存标题修改
  const saveEdit = async (s: SessionData, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = { ...s, title: editTitle };
    await onUpdate(updated);
    setEditingId(null);
  };

  // 检查表单是否有效
  const isFormValid = () => {
      if (mode === 'ai') return !!title.trim() && !!prompt.trim();
      return !!audioFiles && audioFiles.length > 0; 
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-3">
           <h3 className="text-sm font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-2">
             <Icons.Cat className="w-5 h-5" />
             Studio <span className="text-[9px] bg-emerald-800 text-emerald-300 px-1 rounded">v4.1</span>
           </h3>
           {/* 模式切换按钮 */}
           <div className="flex bg-emerald-900 p-1 rounded-xl border border-emerald-800">
              <button 
                onClick={() => setMode('ai')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${mode === 'ai' ? 'bg-emerald-600 text-white shadow' : 'text-emerald-400 hover:text-emerald-200'}`}
              >
                AI Generator
              </button>
              <button 
                onClick={() => setMode('import')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${mode === 'import' ? 'bg-emerald-600 text-white shadow' : 'text-emerald-400 hover:text-emerald-200'}`}
              >
                Batch Import
              </button>
           </div>
        </div>
        
        {/* 顶部网格区域：输入参数 (布局调整：Row 1 基础信息+Tags, Row 2 描述宽屏) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3">
            {mode === 'ai' ? (
                <>
                  {/* Row 1: Title (3) + Format (3) + Language (2) + Tags (4) */}
                  
                  {/* 1. Title */}
                  <div className="md:col-span-3 bg-emerald-900 p-4 rounded-3xl shadow-lg shadow-emerald-950/20 border border-emerald-800 flex flex-col h-24 group hover:border-emerald-600 transition-colors">
                    <label className="text-[10px] font-bold text-emerald-400 uppercase mb-1">1. Title</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Session Name"
                        className="w-full h-full bg-transparent font-bold text-emerald-100 placeholder-emerald-700 focus:outline-none text-lg"
                    />
                  </div>
                  
                  {/* 2. Format (Dialogue/Monologue) */}
                  <div className="md:col-span-3 bg-emerald-900 p-4 rounded-3xl shadow-lg shadow-emerald-950/20 border border-emerald-800 flex flex-col h-24 group hover:border-emerald-600 transition-colors">
                     <label className="text-[10px] font-bold text-emerald-400 uppercase mb-2">2. Format</label>
                     <div className="flex gap-2">
                        <button 
                          onClick={() => setFormat('dialogue')}
                          className={`flex-1 py-1 rounded-lg text-[10px] font-bold flex flex-col items-center gap-1 ${format === 'dialogue' ? 'bg-emerald-600 text-white' : 'bg-emerald-800 text-emerald-400'}`}
                        >
                           <Icons.Users className="w-4 h-4" /> Dialogue
                        </button>
                        <button 
                          onClick={() => setFormat('monologue')}
                          className={`flex-1 py-1 rounded-lg text-[10px] font-bold flex flex-col items-center gap-1 ${format === 'monologue' ? 'bg-emerald-600 text-white' : 'bg-emerald-800 text-emerald-400'}`}
                        >
                           <Icons.User className="w-4 h-4" /> Solo
                        </button>
                     </div>
                  </div>
                  
                  {/* 3. Language */}
                  <div className="md:col-span-2 bg-emerald-900 p-4 rounded-3xl shadow-lg shadow-emerald-950/20 border border-emerald-800 flex flex-col h-24 group hover:border-emerald-600 transition-colors">
                     <label className="text-[10px] font-bold text-emerald-400 uppercase mb-1">3. Language</label>
                     <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="w-full h-full bg-transparent font-bold text-emerald-100 focus:outline-none text-lg -ml-1 cursor-pointer"
                     >
                       <option value="German" className="bg-emerald-900">German</option>
                       <option value="English" className="bg-emerald-900">English</option>
                       <option value="French" className="bg-emerald-900">French</option>
                       <option value="Spanish" className="bg-emerald-900">Spanish</option>
                       <option value="Chinese" className="bg-emerald-900">Chinese</option>
                       <option value="Japanese" className="bg-emerald-900">Japanese</option>
                     </select>
                  </div>

                  {/* 4. Tags (Moved to Row 1) */}
                  <div className="md:col-span-4 bg-emerald-900 p-4 rounded-3xl shadow-lg shadow-emerald-950/20 border border-emerald-800 flex flex-col h-24 group hover:border-emerald-600 transition-colors">
                     <label className="text-[10px] font-bold text-emerald-400 uppercase mb-1">4. Tags (Optional)</label>
                     <input
                        type="text"
                        value={tagsInput}
                        onChange={(e) => setTagsInput(e.target.value)}
                        placeholder="tech, travel..."
                        className="w-full bg-transparent text-emerald-100 font-bold text-sm placeholder-emerald-700 focus:outline-none mb-1"
                     />
                     <div className="flex gap-1 overflow-hidden h-5 items-center">
                       {tagsInput.split(',').filter(t=>t.trim()).map((t, i) => (
                          <span key={i} className="text-[9px] bg-emerald-800 text-emerald-300 px-1.5 py-0.5 rounded-full border border-emerald-700 whitespace-nowrap">{t.trim()}</span>
                       ))}
                     </div>
                  </div>

                  {/* Row 2: Prompt (7) + Duration (2) + Generate Button (3) */}
                  
                  {/* 5. Prompt (Expanded) */}
                  <div className="md:col-span-7 bg-emerald-900 p-4 rounded-3xl shadow-lg shadow-emerald-950/20 border border-emerald-800 flex flex-col h-24 group hover:border-emerald-600 transition-colors">
                     <label className="text-[10px] font-bold text-emerald-400 uppercase mb-1">5. Prompt (Scenario)</label>
                     <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe the scenario in detail..."
                        className="w-full h-full bg-transparent resize-none text-emerald-100 font-medium text-xs placeholder-emerald-700 focus:outline-none"
                     />
                  </div>

                  {/* 6. Duration */}
                  <div className="md:col-span-2 bg-emerald-900 p-4 rounded-3xl shadow-lg shadow-emerald-950/20 border border-emerald-800 flex flex-col h-24 justify-center group hover:border-emerald-600 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-bold text-emerald-400 uppercase">Dur.</label>
                        <span className="text-xl font-bold text-emerald-300">{difficulty}m</span>
                    </div>
                    <input 
                        type="range" 
                        min="1" 
                        max="4" 
                        step="1" 
                        value={difficulty}
                        onChange={(e) => setDifficulty(parseInt(e.target.value))}
                        className="w-full h-1.5 bg-emerald-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>

                  {/* 7. Generate Button */}
                  <button 
                    onClick={handleSubmit} 
                    disabled={!isFormValid() || isImporting}
                    className="md:col-span-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 rounded-3xl shadow-lg shadow-emerald-900/50 flex flex-row items-center justify-center gap-3 h-24 transition-all transform hover:scale-[1.02] active:scale-95 border border-emerald-500"
                  >
                     <div className="p-2 bg-emerald-500/30 rounded-full overflow-hidden">
                        {isImporting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Icons.Cat className="w-6 h-6 text-white" />}
                     </div>
                     <span className="font-bold text-lg leading-none">Generate</span>
                  </button>
                </>
            ) : (
                // 导入模式界面
                <>
                  <div className="md:col-span-2 bg-emerald-900 p-4 rounded-3xl shadow-lg shadow-emerald-950/20 border border-emerald-800 flex flex-col h-24 group hover:border-emerald-600 transition-colors">
                     <label className="text-[10px] font-bold text-emerald-400 uppercase mb-1">Default Lang</label>
                     <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="w-full h-full bg-transparent font-bold text-emerald-100 focus:outline-none text-lg -ml-1 cursor-pointer"
                     >
                       <option value="German" className="bg-emerald-900">German</option>
                       <option value="English" className="bg-emerald-900">English</option>
                       <option value="French" className="bg-emerald-900">French</option>
                       <option value="Spanish" className="bg-emerald-900">Spanish</option>
                       <option value="Chinese" className="bg-emerald-900">Chinese</option>
                       <option value="Japanese" className="bg-emerald-900">Japanese</option>
                     </select>
                  </div>
                  <div className="md:col-span-6 grid grid-cols-2 gap-3 h-24">
                   {/* 音频选择器 */}
                   <label className="bg-emerald-900 p-4 rounded-3xl border border-emerald-800 hover:border-emerald-600 cursor-pointer flex flex-col justify-center items-center gap-1 group relative overflow-hidden">
                      <Icons.Music className={`w-5 h-5 ${audioFiles ? 'text-emerald-100' : 'text-emerald-500'} group-hover:text-emerald-300`}/>
                      <span className="text-[10px] font-bold text-emerald-400 truncate w-full text-center px-2">
                        {audioFiles && audioFiles.length > 0 ? `${audioFiles.length} Audio files` : "Select Audio (MP3, WAV...)"}
                      </span>
                      <input 
                        type="file" 
                        accept=".mp3,.wav,.m4a,.ogg,audio/*"
                        multiple 
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        onClick={(e) => (e.target as HTMLInputElement).value = ''}
                        onChange={e => setAudioFiles(e.target.files)} 
                      />
                   </label>
                   {/* 脚本选择器 */}
                   <label className="bg-emerald-900 p-4 rounded-3xl border border-emerald-800 hover:border-emerald-600 cursor-pointer flex flex-col justify-center items-center gap-1 group relative overflow-hidden">
                      <Icons.FileText className={`w-5 h-5 ${scriptFiles ? 'text-emerald-100' : 'text-emerald-500'} group-hover:text-emerald-300`}/>
                      <span className="text-[10px] font-bold text-emerald-400 truncate w-full text-center px-2">
                        {scriptFiles && scriptFiles.length > 0 ? `${scriptFiles.length} Script files` : "Select Scripts (Opt.)"}
                      </span>
                      <input 
                        type="file" 
                        accept=".txt"
                        multiple
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        onClick={(e) => (e.target as HTMLInputElement).value = ''}
                        onChange={e => setScriptFiles(e.target.files)} 
                      />
                   </label>
                </div>
                {/* 导入预览列表 */}
                <div className="md:col-span-4 bg-emerald-900 p-3 rounded-3xl shadow-lg border border-emerald-800 flex flex-col h-24 overflow-y-auto scrollbar-thin scrollbar-thumb-emerald-700">
                     <label className="text-[10px] font-bold text-emerald-400 uppercase mb-1 sticky top-0 bg-emerald-900 z-10">Preview</label>
                     {importPreview ? (
                        <div className="space-y-1">
                           <div className="text-[10px] text-emerald-300 font-bold mb-1">
                              Match: {importPreview.matched} / {importPreview.total}
                           </div>
                           {importPreview.items.map((item, i) => (
                             <div key={i} className="flex justify-between text-[9px] text-emerald-500 border-b border-emerald-800/50 pb-0.5">
                                <span className="truncate max-w-[70%]">{item.name}</span>
                                <span className={item.hasScript ? "text-emerald-400" : "text-emerald-700"}>{item.hasScript ? "+Txt" : "Audio"}</span>
                             </div>
                           ))}
                        </div>
                     ) : (
                        <span className="text-emerald-700 text-[10px] italic">No files selected</span>
                     )}
                </div>
                 {/* 导入按钮 */}
                <button 
                  onClick={handleSubmit} 
                  disabled={!isFormValid() || isImporting}
                  className="col-span-full md:col-span-12 h-12 mt-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2"
                >
                   {isImporting ? 'Importing...' : <><Icons.Upload className="w-4 h-4" /> Start Batch Import</>}
                </button>
                </>
            )}
        </div>

      </section>

      {/* 历史记录 Library */}
      <section>
        <div className="flex items-center justify-between mb-3">
             <h3 className="text-sm font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-2">
                <Icons.Book /> Library
            </h3>
            {/* 批量下载按钮 */}
            <button 
                onClick={onDownloadAll}
                className="bg-emerald-900 hover:bg-emerald-800 text-emerald-300 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-emerald-800 flex items-center gap-2 transition-colors shadow-sm"
                title="Download entire library as ZIP"
            >
                <Icons.Download className="w-3 h-3" /> Download All Assets (.zip)
            </button>
        </div>
        
        {/* 卡片列表 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {history.length === 0 ? (
            <div className="col-span-full text-center py-8 text-emerald-600 bg-emerald-900/50 rounded-3xl border border-dashed border-emerald-800 h-24 flex items-center justify-center">
              No sessions found.
            </div>
          ) : (
            history.map((session: SessionData) => (
              <div 
                key={session.id} 
                onClick={() => !editingId && onOpen(session)}
                className="bg-emerald-900 p-4 rounded-3xl border border-emerald-800 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-900/50 transition-all cursor-pointer group flex flex-col justify-between h-24 relative"
              >
                 {editingId === session.id ? (
                    // 标题编辑模式
                    <div className="flex flex-col gap-1 h-full" onClick={e => e.stopPropagation()}>
                       <input
                        type="text"
                        value={editTitle} 
                        onChange={e => setEditTitle(e.target.value)}
                        className="font-bold text-sm border border-emerald-600 p-1 rounded-lg focus:outline-none text-emerald-100 bg-emerald-800 w-full"
                       />
                       <div className="flex gap-1 mt-auto">
                         <button onClick={(e) => saveEdit(session, e)} className="flex-1 bg-emerald-600 text-white text-[10px] py-1 rounded">Save</button>
                         <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="flex-1 bg-emerald-800 text-emerald-400 text-[10px] py-1 rounded hover:bg-emerald-700">Cancel</button>
                       </div>
                    </div>
                  ) : (
                    <>
                      {/* 标题和语言 */}
                      <div>
                        <div className="flex justify-between items-start">
                           <h4 className="font-bold text-emerald-100 text-sm leading-tight truncate mb-1 flex-1" title={session.title || session.topic}>{session.title || session.topic}</h4>
                           <span className="text-[8px] bg-emerald-950 text-emerald-500 px-1 rounded border border-emerald-800 ml-1">{session.language?.substring(0,2).toUpperCase()}</span>
                        </div>
                        {/* 标签 */}
                        <div className="flex overflow-hidden h-4 gap-1">
                          {session.tags && session.tags.map((t, i) => (
                             <span key={i} className="text-[8px] bg-emerald-800 text-emerald-300 px-1.5 py-0.5 rounded-full border border-emerald-700 whitespace-nowrap">{t}</span>
                          ))}
                        </div>
                      </div>
                      
                      {/* 底部信息: 时间和难度 */}
                      <div className="mt-auto">
                        <div className="flex items-center justify-between text-[9px] font-medium text-emerald-500">
                          <span className="flex items-center gap-1"><Icons.Clock className="w-3 h-3"/> {new Date(session.lastStudiedTimestamp).toLocaleDateString()}</span>
                          <span className="bg-emerald-800 text-emerald-300 px-1.5 py-0.5 rounded font-bold border border-emerald-700">
                             {session.difficulty}m
                          </span>
                        </div>
                      </div>

                      {/* 悬浮操作菜单 (下载/编辑/删除) */}
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-emerald-800 p-0.5 rounded-lg shadow-sm border border-emerald-700 z-20">
                         <button onClick={(e) => {
                             e.stopPropagation();
                             if(session.aiAudioBlob) {
                                 const url = URL.createObjectURL(session.aiAudioBlob);
                                 const a = document.createElement('a');
                                 a.href = url;
                                 a.download = `${session.title}.wav`;
                                 a.click();
                                 URL.revokeObjectURL(url);
                             }
                         }} className="p-1 text-emerald-300 hover:text-emerald-100 hover:bg-emerald-700 rounded" title="Download Audio"><Icons.Music className="w-3 h-3"/></button>
                         <button onClick={(e) => {
                             e.stopPropagation();
                             if(session.script && session.script.length) {
                                 const text = session.script.map(l => `${l.speaker}: ${l.text}`).join('\n');
                                 const blob = new Blob([text], { type: 'text/plain' });
                                 const url = URL.createObjectURL(blob);
                                 const a = document.createElement('a');
                                 a.href = url;
                                 a.download = `${session.title}.txt`;
                                 a.click();
                                 URL.revokeObjectURL(url);
                             }
                         }} className="p-1 text-emerald-300 hover:text-emerald-100 hover:bg-emerald-700 rounded" title="Download Script"><Icons.FileText className="w-3 h-3"/></button>
                        <button onClick={(e) => startEditing(session, e)} className="p-1 text-emerald-300 hover:text-white hover:bg-emerald-700 rounded" title="Edit"><Icons.Edit className="w-3 h-3"/></button>
                        <button onClick={(e) => {
                            e.preventDefault(); // 新增：防止默认行为
                            e.stopPropagation(); // 强制阻止冒泡
                            onDelete(session.id, e);
                        }} className="p-1 text-emerald-300 hover:text-red-400 hover:bg-emerald-700 rounded" title="Delete"><Icons.Trash className="w-3 h-3"/></button>
                      </div>
                    </>
                  )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
