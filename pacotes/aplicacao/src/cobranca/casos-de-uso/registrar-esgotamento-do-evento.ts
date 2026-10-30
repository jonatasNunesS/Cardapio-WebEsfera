import { CODIGOS } from '@cardapio/dominio';
import type { EventosDePagamento } from '../portas/eventos-de-pagamento.ts';

export async function registrarEsgotamentoDoEvento(
  dependencias: { readonly eventos: EventosDePagamento },
  eventoId: string,
): Promise<void> {
  await dependencias.eventos.registrarFalha(eventoId, CODIGOS.PAGAMENTO_PROCESSAR_TENTATIVAS_ESGOTADAS);
}
