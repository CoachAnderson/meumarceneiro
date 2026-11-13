import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cabecalhos } from './seguranca.mjs';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  // O preview serve o build com os cabeçalhos de produção (CSP incluída),
  // liberando só o Supabase local para teste.
  preview: { headers: cabecalhos(['http://127.0.0.1:54321', 'ws://127.0.0.1:54321']) },
});
