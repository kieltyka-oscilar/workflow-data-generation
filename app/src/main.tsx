import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

console.log('MAIN.TSX IS EXECUTING!');
const root = document.getElementById('root');
if (root) {
  root.innerHTML = '<h1>React is attempting to mount...</h1>';
} else {
  console.error("NO ROOT DIV FOUND!");
}

try {
  createRoot(root!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  console.log('React rendered successfully!');
} catch (err) {
  console.error("REACT RENDER CRASH:", err);
  if (root) root.innerHTML = `<h1 style="color:red">Error: ${err.message}</h1>`;
}
