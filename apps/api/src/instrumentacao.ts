import { iniciarObservabilidadeDoProcesso } from '@cardapio/observabilidade/node';

iniciarObservabilidadeDoProcesso('api', new URL('../package.json', import.meta.url));
