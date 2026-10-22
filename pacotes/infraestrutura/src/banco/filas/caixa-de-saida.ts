import {
  CODIGOS,
  ErroAplicacao,
  ErroDependenciaExterna,
  type CaixaDeSaida,
  type EventoPublicavel,
  type RelatorDeErros,
} from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import type { AcessoAoBanco, Transacao } from '../banco.ts';

export const TENTATIVAS_MAXIMAS_DA_CAIXA_DE_SAIDA = 10;

interface LinhaPendente extends Record<string, unknown> {
  readonly restaurante_id: string;
  readonly id: string;
  readonly tipo_evento: string;
  readonly carga: Record<string, unknown>;
  readonly criado_em: string | Date;
  readonly tentativas: number;
}

function paraEvento(linha: LinhaPendente): EventoPublicavel {
  return {
    id: linha.id,
    restauranteId: linha.restaurante_id,
    tipo: linha.tipo_evento,
    carga: linha.carga,
    ocorridoEm: new Date(linha.criado_em),
  };
}

function travarPendentes(transacao: Transacao, lote: number) {
  return transacao.execute<LinhaPendente>(sql`
    SELECT restaurante_id, id, tipo_evento, carga, criado_em, tentativas
    FROM caixa_saida
    WHERE publicado_em IS NULL AND tentativas < ${TENTATIVAS_MAXIMAS_DA_CAIXA_DE_SAIDA}
    ORDER BY criado_em, id
    LIMIT ${lote}
    FOR UPDATE SKIP LOCKED`);
}

function pares(linhas: readonly LinhaPendente[]) {
  return sql`(restaurante_id, id) IN (SELECT * FROM unnest(
    ${sql.param(linhas.map((linha) => linha.restaurante_id))}::uuid[],
    ${sql.param(linhas.map((linha) => linha.id))}::uuid[]))`;
}

async function marcar(transacao: Transacao, publicadas: LinhaPendente[], falhas: LinhaPendente[]) {
  if (publicadas.length > 0) {
    await transacao.execute(sql`UPDATE caixa_saida SET publicado_em = now() WHERE ${pares(publicadas)}`);
  }
  if (falhas.length > 0) {
    await transacao.execute(sql`UPDATE caixa_saida SET tentativas = tentativas + 1 WHERE ${pares(falhas)}`);
  }
}

function esgotado(linha: LinhaPendente, causa: unknown): ErroAplicacao {
  return new ErroAplicacao(
    CODIGOS.CAIXA_SAIDA_PUBLICAR_ESGOTADO,
    'Evento da caixa de saída esgotou as tentativas de publicação',
    {
      modulo: 'filas',
      casoDeUso: 'publicarCaixaDeSaida',
      restauranteId: linha.restaurante_id,
      dados: { eventoId: linha.id, tipo: linha.tipo_evento },
    },
    causa,
  );
}

export function criarCaixaDeSaida(banco: AcessoAoBanco, relator: RelatorDeErros): CaixaDeSaida {
  async function publicarLinha(
    linha: LinhaPendente,
    publicar: (evento: EventoPublicavel) => Promise<void>,
  ): Promise<'publicado' | 'falhou' | 'interromper'> {
    try {
      await publicar(paraEvento(linha));
      return 'publicado';
    } catch (erro) {
      if (!(erro instanceof ErroAplicacao)) {
        throw erro;
      }
      if (linha.tentativas + 1 >= TENTATIVAS_MAXIMAS_DA_CAIXA_DE_SAIDA) {
        relator.reportar(esgotado(linha, erro));
      } else {
        relator.registrarPasso({
          categoria: 'caixa-saida',
          mensagem: 'publicação falhou; vai tentar de novo',
          dados: { eventoId: linha.id, tentativa: linha.tentativas + 1 },
        });
      }
      return erro instanceof ErroDependenciaExterna ? 'interromper' : 'falhou';
    }
  }

  return {
    publicarPendentes: (lote, publicar) =>
      banco.comSistema(async (transacao) => {
        const { rows } = await travarPendentes(transacao, lote);
        const publicadas: LinhaPendente[] = [];
        const falhas: LinhaPendente[] = [];
        for (const linha of rows) {
          const situacao = await publicarLinha(linha, publicar);
          (situacao === 'publicado' ? publicadas : falhas).push(linha);
          if (situacao === 'interromper') {
            break;
          }
        }
        await marcar(transacao, publicadas, falhas);
        return { publicados: publicadas.length, falhas: falhas.length };
      }),
  };
}
