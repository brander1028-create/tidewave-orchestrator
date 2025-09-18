import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// v7.19: localStorage 초기화를 React 렌더링 전에 실행하여 초기 API 호출에서 401 방지
if (!localStorage.getItem('owner')) {
  localStorage.setItem('owner', 'system');
}
if (!localStorage.getItem('role')) {
  localStorage.setItem('role', 'Admin');
}

createRoot(document.getElementById("root")!).render(<App />);
