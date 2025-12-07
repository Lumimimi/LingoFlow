
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载环境变量
  // 第二个参数 process.cwd() 是当前工作目录
  // 第三个参数 '' 表示加载所有变量，不仅仅是 VITE_ 开头的
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // 这一步非常关键！
      // 它会在构建时，把代码里的 'process.env.API_KEY' 字符串
      // 替换为实际的环境变量值。
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    },
  };
});