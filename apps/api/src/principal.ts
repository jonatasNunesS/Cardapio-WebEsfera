import { carregarAmbiente } from '@cardapio/config';
import { esquemaAmbienteApi } from './ambiente.ts';
import { comporApi } from './composicao/index.ts';

const ambiente = carregarAmbiente(esquemaAmbienteApi);
const servidor = comporApi(ambiente);

for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sinal, () => {
    void servidor.close();
  });
}

await servidor.listen({ port: ambiente.PORTA_API, host: '0.0.0.0' });
