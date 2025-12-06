
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// 应用程序入口
// 寻找 DOM 中的 root 节点并将 React 应用挂载上去
const container = document.getElementById("root");
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}
