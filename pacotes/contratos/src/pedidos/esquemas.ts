import { z } from 'zod';
export {
  CABECALHO_DA_CHAVE_DE_IDEMPOTENCIA,
  ROTAS_DO_ATENDIMENTO,
  type RespostaChamado,
  type RespostaConta,
  type RespostaSessaoDaMesa,
  type SituacaoDoChamadoNaApi,
  type TipoDeChamadoNaApi,
  gerarUuidV7,
  ROTAS_DO_PEDIDO,
  type ItemDoPedidoNaApi,
  type LinhaDoPedidoNaApi,
  type RespostaPedido,
  type SituacaoDoPedidoNaApi,
} from '../publico.ts';

export const esquemaPedidoDoCliente = z.strictObject({
  itens: z
    .array(
      z.strictObject({
        pratoId: z.uuid(),
        quantidade: z.number().int(),
        observacao: z.string().max(560).default(''),
      }),
    )
    .max(30),
});

export const esquemaChaveDoPedido = z.uuid({ version: 'v7' });
