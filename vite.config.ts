/// <reference types="vitest" />
import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  server: { host: true },
  // les copies de travail des agents (.claude/worktrees) ne font pas partie des tests du projet
  test: { exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'] },
});
