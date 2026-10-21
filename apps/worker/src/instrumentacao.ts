import { iniciarObservabilidadeDoProcesso } from '@cardapio/observabilidade/node';

iniciarObservabilidadeDoProcesso('worker', new URL('../package.json', import.meta.url));
