import { criarConfiguracaoVite } from '@cardapio/config/vite';
import { mergeConfig } from 'vite';

const base = criarConfiguracaoVite('cardapio', new URL('./package.json', import.meta.url), { porta: 5175 });

// O service worker sai como /sw.js na raiz para controlar todo o host: docs/adr/0013-cardapio-do-cliente.md
export default mergeConfig(base, {
  build: {
    rollupOptions: {
      input: { index: 'index.html', sw: 'src/offline/trabalhador.ts' },
      output: {
        entryFileNames: (trecho: { name: string }) =>
          trecho.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js',
      },
    },
  },
  preview: { host: '127.0.0.1', port: 5175, strictPort: true },
});
