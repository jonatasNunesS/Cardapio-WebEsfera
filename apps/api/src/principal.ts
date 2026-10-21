import { carregarAmbiente } from '@cardapio/config';
import { instalarTratadoresDeFalha } from '@cardapio/observabilidade/node';
import { esquemaAmbienteApi } from './ambiente.ts';
import { comporApi } from './composicao/index.ts';

instalarTratadoresDeFalha();
const ambiente = carregarAmbiente(esquemaAmbienteApi);
const servidor = comporApi(ambiente);

for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sinal, () => {
    void servidor.close();
  });
}

await servidor.listen({ port: ambiente.PORTA_API, host: '0.0.0.0' });
