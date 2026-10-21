import { criarConfiguracaoVite } from '@cardapio/config/vite';

export default criarConfiguracaoVite('cardapio', new URL('./package.json', import.meta.url));
