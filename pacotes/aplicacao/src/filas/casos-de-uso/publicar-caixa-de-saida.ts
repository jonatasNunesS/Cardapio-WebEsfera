import type { CaixaDeSaida, ResumoDaPublicacao } from '../portas/caixa-de-saida.ts';
import type { FilaDeJobs } from '../portas/fila-de-jobs.ts';
import type { EventoPublicavel, PublicadorTempoReal } from '../portas/publicador-tempo-real.ts';

export const LOTE_DA_CAIXA_DE_SAIDA = 200;

export type RoteamentoDeEventos = Readonly<Record<string, readonly string[]>>;

export interface DependenciasDePublicarCaixaDeSaida {
  readonly caixaDeSaida: CaixaDeSaida;
  readonly publicador: PublicadorTempoReal;
  readonly filas: FilaDeJobs;
  readonly roteamento: RoteamentoDeEventos;
}

async function publicarEvento(dependencias: DependenciasDePublicarCaixaDeSaida, evento: EventoPublicavel) {
  for (const nome of dependencias.roteamento[evento.tipo] ?? []) {
    await dependencias.filas.enfileirar({
      nome,
      idDoJob: `evento-${evento.id}-${nome}`,
      dados: { eventoId: evento.id, tipo: evento.tipo, carga: evento.carga },
      restauranteId: evento.restauranteId,
    });
  }
  await dependencias.publicador.publicar(evento);
}

export function publicarCaixaDeSaida(
  dependencias: DependenciasDePublicarCaixaDeSaida,
  lote = LOTE_DA_CAIXA_DE_SAIDA,
): Promise<ResumoDaPublicacao> {
  return dependencias.caixaDeSaida.publicarPendentes(lote, (evento) => publicarEvento(dependencias, evento));
}
