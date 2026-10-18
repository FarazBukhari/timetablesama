import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import { App } from './ui/App';
import { ProjectProvider } from './ui/store';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProjectProvider>
      <App />
    </ProjectProvider>
  </StrictMode>,
);
