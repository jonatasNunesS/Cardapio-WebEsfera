import { criarConfiguracaoVite } from '@cardapio/config/vite';

export default criarConfiguracaoVite('admin', new URL('./package.json', import.meta.url));
