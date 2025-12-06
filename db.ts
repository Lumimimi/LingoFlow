
import { SessionData } from "./types";

// 数据库配置
const DB_NAME = "lingoflow_v2"; // 数据库名称
const DB_VERSION = 5;           // 版本号，如果修改了表结构需要升级版本
const STORE_NAME = "sessions";  // 表名 (Object Store)

// 初始化并打开数据库连接
const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  
  // 当数据库版本升级时触发 (首次创建表)
  request.onupgradeneeded = (event) => {
    const db = (event.target as IDBOpenDBRequest).result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      // 创建以 'id' 为主键的表
      db.createObjectStore(STORE_NAME, { keyPath: "id" });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

// 保存或更新一个 Session (增/改)
export const saveSession = async (session: SessionData) => {
  const db = await dbPromise;
  const tx = db.transaction(STORE_NAME, "readwrite"); // 开启读写事务
  tx.objectStore(STORE_NAME).put(session); // put 方法：如果 id 存在则更新，不存在则插入
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// 获取所有 Sessions (查)
export const getAllSessions = async (): Promise<SessionData[]> => {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly"); // 开启只读事务
    const request = tx.objectStore(STORE_NAME).getAll(); // 获取所有数据
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.lastStudiedTimestamp - a.lastStudiedTimestamp)); // 按最后学习时间倒序排列
    request.onerror = () => reject(request.error);
  });
};

// 删除一个 Session (删)
export const deleteSession = async (id: string) => {
  const db = await dbPromise;
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(id);
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// 清空整个数据库 (慎用)
export const clearDatabase = async () => {
  const db = await dbPromise;
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).clear();
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};
