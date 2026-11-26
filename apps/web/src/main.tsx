import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App';
import { loadRemoteAISettings } from './lib/firebase';

const queryClient = new QueryClient();

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const applyScheme = () => document.documentElement.classList.toggle('dark', darkQuery.matches);
applyScheme();
darkQuery.addEventListener('change', applyScheme);

// Runs in the background; AI requests use the built-in defaults until it finishes.
loadRemoteAISettings().catch((err) => console.warn('[Remote Config] Not applied', err));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
