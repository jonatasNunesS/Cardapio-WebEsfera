import type { DependenciasDasRotinasDeCobranca } from '../dependencias.ts';
import { percorrerRestaurantes } from '../percorrer-restaurantes.ts';

export const ESPERA_ANTES_DE_REPROCESSAR_MS = 10 * 60_000;
const LOTE_DE_EVENTOS = 500;

export interface ResumoDaConciliacao {
  readonly eventos: number;
  readonly restaurantes: number;
}

const diaDoLote = (agora: Date) => agora.toISOString().slice(0, 10).replaceAll('-', '');

export async function conciliarCobrancas(
  dependencias: DependenciasDasRotinasDeCobranca,
): Promise<ResumoDaConciliacao> {
  const agora = dependencias.relogio.agora();
  const dia = diaDoLote(agora);
  const pendentes = await dependencias.eventos.listarPendentes(
    new Date(agora.getTime() - ESPERA_ANTES_DE_REPROCESSAR_MS),
    LOTE_DE_EVENTOS,
  );
  for (const eventoId of pendentes) {
    await dependencias.filas.enfileirar({
      nome: 'processar-evento-pagamento',
      idDoJob: `evento-${eventoId}-conciliacao-${dia}`,
      dados: { eventoId },
    });
  }
  const restaurantes = await percorrerRestaurantes(dependencias.restaurantes, async (restauranteId) => {
    await dependencias.filas.enfileirar({
      nome: 'conciliar-assinatura',
      idDoJob: `conciliar-${restauranteId}-${dia}`,
      dados: {},
      restauranteId,
    });
  });
  return { eventos: pendentes.length, restaurantes };
}
