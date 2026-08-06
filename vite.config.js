import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // base stays '/'. If this is ever served from a GitHub Pages *project* URL
  // (jdipietro3.github.io/personal-portfolio-site/), this must become
  // '/personal-portfolio-site/' or every built asset 404s.
  base: '/',
});
