import { criarConfiguracaoVite } from '@cardapio/config/vite';

export default criarConfiguracaoVite('painel', new URL('./package.json', import.meta.url));
