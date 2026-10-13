import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // GitHub Pages serves project sites from /<repository-name>/.
    base: env.VITE_BASE_PATH || '/',
  };
});
