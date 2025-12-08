
// 对话行接口：定义剧本中的每一行对话
// 包含时间戳以支持逐句播放
export interface DialogueLine {
  speaker: string; // 说话人名字 (例如: "Speaker A", "Hans")
  text: string;    // 对话内容
  startTime?: number; // 该句在音频中的开始时间 (秒)
  endTime?: number;   // 该句在音频中的结束时间 (秒)
}

// 词汇接口：定义 AI 提取的重点词汇
export interface Vocabulary {
  word: string;    // 单词或短语
  meaning: string; // 释义 (英语或目标语言解释)
}

// 语法笔记接口：定义 AI 提取的常用句式和语法点
export interface GrammarNote {
  phrase: string;      // 关键句型或短语
  explanation: string; // 语法解释或用法说明
}

// 学习日志接口：记录每一次练习的详细产出
export interface StudyLog {
  id: string;              // 日志唯一 ID
  timestamp: number;       // 练习发生的时间戳
  initialAudioBlob: Blob | null; // 第一步：口述摘要的录音文件
  initialText: string;     // 第一步：口述摘要的 AI 转写文本
  finalAudioBlob: Blob | null;   // 最后一步：最终复述的录音文件
  finalText: string;       // 最后一步：最终复述的 AI 转写文本
  userDraft: string;       // 中间步骤：用户的详细写作草稿
  aiCorrection: string;    // AI 给出的 HTML 格式纠错反馈 (红绿 Diff)
}

// 课程会话核心数据结构
export interface SessionData {
  id: string;              // 会话唯一 ID (UUID)
  createdTimestamp: number;// 创建时间
  lastStudiedTimestamp: number; // 最后一次学习时间 (用于排序)
  title: string;           // 课程标题
  topic: string;           // 场景描述 (Prompt)
  tags: string[];          // 标签数组 (例如: ["tech", "work"])
  difficulty: number;      // 难度/时长等级 (1-4 分钟)
  language: string;        // 目标语言 (例如: "German")
  format: 'dialogue' | 'monologue'; // 生成格式: 对话 (双人) 或 独白 (单人)
  script: DialogueLine[];  // 完整的对话剧本
  vocabulary: Vocabulary[];// 重点词汇表
  grammarNotes?: GrammarNote[]; // 语法/句式总结 (可选)
  aiAudioBlob: Blob | null;// AI 生成的 TTS 原声文件 (WAV 格式)
  studyLogs: StudyLog[];   // 所有的练习历史记录
}