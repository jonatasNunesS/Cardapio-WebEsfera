import {
  caminhoDoDerivado,
  LIMITES_DA_MIDIA,
  planejarProcessamento,
  Resultado,
  type Derivados,
  type MotivoDaRecusa,
} from '@cardapio/dominio';
import type { DependenciasDoProcessamento } from '../dependencias.ts';
import { montarDerivados, type Destino } from '../derivados-gerados.ts';
import type { ArquivosGerados } from '../portas/processador-de-midia.ts';
import type { MidiaRegistrada } from '../portas/repositorio-de-midias.ts';

const DIA_EM_MS = 24 * 60 * 60 * 1000;

export interface PedidoDeProcessamento extends Destino {
  readonly tentativa: number;
}

export type DesfechoDoProcessamento = 'ignorado' | 'publicada' | 'recusada' | 'descartada' | 'obsoleta';

function algumGrandeDemais(gerados: ArquivosGerados): boolean {
  return gerados.arquivos.some((arquivo) => arquivo.bytes > LIMITES_DA_MIDIA.tamanhoMaximoDoDerivadoBytes);
}

async function enviarDerivados(
  dependencias: DependenciasDoProcessamento,
  destino: Destino,
  gerados: ArquivosGerados,
) {
  for (const arquivo of gerados.arquivos) {
    await dependencias.armazenamento.enviar('publica', {
      caminho: caminhoDoDerivado(destino.restauranteId, destino.midiaId, arquivo.nome),
      arquivoLocal: arquivo.arquivoLocal,
      tipoConteudo: arquivo.tipoConteudo,
    });
  }
}

async function transformar(
  dependencias: DependenciasDoProcessamento,
  destino: Destino,
  midia: MidiaRegistrada,
  pasta: string,
): Promise<Resultado<Derivados, MotivoDaRecusa>> {
  const original = `${pasta}/original`;
  await dependencias.armazenamento.baixar('originais', midia.caminhoOriginal, original);
  const plano = planejarProcessamento(
    midia.tipo,
    await dependencias.processador.sondar(original, midia.tipo),
  );
  if (!plano.ok) {
    return plano;
  }
  const gerados = await dependencias.processador.gerar(original, plano.valor, pasta);
  if (!gerados.ok) {
    return gerados;
  }
  if (algumGrandeDemais(gerados.valor)) {
    return Resultado.falha('derivado_grande_demais');
  }
  await enviarDerivados(dependencias, destino, gerados.valor);
  return Resultado.ok(montarDerivados(destino, gerados.valor));
}

async function agendarApagarOriginal(
  dependencias: DependenciasDoProcessamento,
  destino: Destino,
): Promise<void> {
  await dependencias.filas.enfileirar({
    nome: 'apagar-original-midia',
    idDoJob: `apagar-original-${destino.midiaId}`,
    dados: { midiaId: destino.midiaId },
    restauranteId: destino.restauranteId,
    atrasoMs: LIMITES_DA_MIDIA.diasAteApagarOOriginal * DIA_EM_MS,
  });
}

async function garantirAgendamento(dependencias: DependenciasDoProcessamento, pedido: PedidoDeProcessamento) {
  const midia = await dependencias.midias.obter(pedido.restauranteId, pedido.midiaId);
  const publicada = midia?.situacao === 'pronta' && midia.tentativa === pedido.tentativa && !midia.descartada;
  if (publicada && !midia.originalApagado) {
    await agendarApagarOriginal(dependencias, pedido);
  }
}

export async function processarMidia(
  dependencias: DependenciasDoProcessamento,
  pedido: PedidoDeProcessamento,
): Promise<DesfechoDoProcessamento> {
  const { restauranteId, midiaId, tentativa } = pedido;
  const midia = await dependencias.midias.iniciarProcessamento(restauranteId, midiaId, tentativa);
  if (midia === null) {
    await garantirAgendamento(dependencias, pedido);
    return 'ignorado';
  }
  const derivados = await dependencias.pasta.comPasta((pasta) =>
    transformar(dependencias, pedido, midia, pasta),
  );
  if (!derivados.ok) {
    await dependencias.midias.falhar(restauranteId, midiaId, tentativa, derivados.erro);
    return 'recusada';
  }
  const desfecho = await dependencias.midias.concluir(restauranteId, midiaId, tentativa, derivados.valor);
  if (desfecho === 'publicada') {
    await agendarApagarOriginal(dependencias, pedido);
  }
  return desfecho;
}
