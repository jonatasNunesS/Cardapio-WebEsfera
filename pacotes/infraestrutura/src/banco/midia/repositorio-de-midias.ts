import type { DesfechoDaConclusao, MidiaRegistrada, RepositorioDeMidias } from '@cardapio/aplicacao';
import { caminhoDoOriginal, type Derivados, type MotivoDaRecusa } from '@cardapio/dominio';
import { sql, type SQL } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { AcessoAoBanco, Transacao } from '../banco.ts';

interface LinhaDeMidia extends Record<string, unknown> {
  readonly id: string;
  readonly prato_id: string;
  readonly tipo: MidiaRegistrada['tipo'];
  readonly situacao: MidiaRegistrada['situacao'];
  readonly tipo_conteudo: string;
  readonly tamanho_bytes: number;
  readonly caminho_original: string;
  readonly tentativa: number;
  readonly motivo_falha: MotivoDaRecusa | null;
  readonly derivados: Derivados | null;
  readonly original_apagado: boolean;
  readonly descartada: boolean;
}

interface LinhaDoPrato extends Record<string, unknown> {
  readonly midia_id: string | null;
}

const COLUNAS = sql.raw(`id, prato_id, tipo, situacao, tipo_conteudo, tamanho_bytes::integer AS tamanho_bytes,
  caminho_original, tentativa, motivo_falha, derivados,
  original_apagado_em IS NOT NULL AS original_apagado, descartada_em IS NOT NULL AS descartada`);

function paraMidia(linha: LinhaDeMidia): MidiaRegistrada {
  return {
    id: linha.id,
    pratoId: linha.prato_id,
    tipo: linha.tipo,
    situacao: linha.situacao,
    tipoConteudo: linha.tipo_conteudo,
    tamanhoBytes: linha.tamanho_bytes,
    caminhoOriginal: linha.caminho_original,
    tentativa: linha.tentativa,
    motivoFalha: linha.motivo_falha,
    derivados: linha.derivados,
    originalApagado: linha.original_apagado,
    descartada: linha.descartada,
  };
}

async function umaMidia(transacao: Transacao, consulta: SQL): Promise<MidiaRegistrada | null> {
  const { rows } = await transacao.execute<LinhaDeMidia>(consulta);
  const [linha] = rows;
  return linha === undefined ? null : paraMidia(linha);
}

async function travarPrato(transacao: Transacao, pratoId: string): Promise<LinhaDoPrato | undefined> {
  const { rows } = await transacao.execute<LinhaDoPrato>(
    sql`SELECT midia_id FROM pratos WHERE id = ${pratoId} AND removido_em IS NULL FOR UPDATE`,
  );
  return rows[0];
}

async function descartar(transacao: Transacao, filtro: SQL): Promise<void> {
  await transacao.execute(sql`
    WITH descartadas AS (
      UPDATE midias SET descartada_em = now(), atualizado_em = now()
       WHERE descartada_em IS NULL AND ${filtro}
      RETURNING restaurante_id, id
    )
    INSERT INTO caixa_saida (restaurante_id, tipo_evento, carga)
    SELECT restaurante_id, 'MidiaDescartada', jsonb_build_object('versao', 1, 'midiaId', id) FROM descartadas`);
}

async function avisarDescarte(transacao: Transacao, midiaId: string): Promise<void> {
  await transacao.execute(sql`
    INSERT INTO caixa_saida (restaurante_id, tipo_evento, carga)
    VALUES (app.restaurante_atual(), 'MidiaDescartada', jsonb_build_object('versao', 1, 'midiaId', ${midiaId}::uuid))`);
}

async function publicarNoPrato(
  transacao: Transacao,
  midia: MidiaRegistrada,
  derivados: Derivados,
): Promise<DesfechoDaConclusao> {
  const prato = await travarPrato(transacao, midia.pratoId);
  const travada = await umaMidia(
    transacao,
    sql`SELECT ${COLUNAS} FROM midias WHERE id = ${midia.id} FOR UPDATE`,
  );
  if (travada?.situacao !== 'processando' || travada.tentativa !== midia.tentativa) {
    return 'obsoleta';
  }
  const duracao = derivados.tipo === 'video' ? derivados.duracaoMs : null;
  await transacao.execute(sql`
    UPDATE midias SET situacao = 'pronta', derivados = ${JSON.stringify(derivados)}::jsonb, duracao_ms = ${duracao},
           pronta_em = now(), atualizado_em = now()
     WHERE id = ${midia.id}`);
  if (travada.descartada) {
    await avisarDescarte(transacao, midia.id);
    return 'descartada';
  }
  if (prato === undefined) {
    await descartar(transacao, sql`id = ${midia.id}`);
    return 'descartada';
  }
  if (prato.midia_id !== null) {
    await descartar(transacao, sql`id = ${prato.midia_id}`);
  }
  await transacao.execute(
    sql`UPDATE pratos SET midia_id = ${midia.id}, atualizado_em = now() WHERE id = ${midia.pratoId}`,
  );
  return 'publicada';
}

export function criarRepositorioDeMidias(banco: AcessoAoBanco): RepositorioDeMidias {
  return {
    criar: (restauranteId, nova) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const prato = await travarPrato(transacao, nova.pratoId);
        if (prato === undefined) {
          return { tipo: 'prato-inexistente' };
        }
        await descartar(transacao, sql`prato_id = ${nova.pratoId} AND id IS DISTINCT FROM ${prato.midia_id}`);
        const midiaId = uuidv7();
        const caminhoOriginal = caminhoDoOriginal(restauranteId, midiaId);
        await transacao.execute(sql`
          INSERT INTO midias (restaurante_id, id, prato_id, tipo, tipo_conteudo, tamanho_bytes, caminho_original)
          VALUES (app.restaurante_atual(), ${midiaId}, ${nova.pratoId}, ${nova.tipo}, ${nova.tipoConteudo},
                  ${nova.tamanhoBytes}, ${caminhoOriginal})`);
        return { tipo: 'criada', midiaId, caminhoOriginal };
      }),
    obter: (restauranteId, midiaId) =>
      banco.comRestaurante(restauranteId, (transacao) =>
        umaMidia(transacao, sql`SELECT ${COLUNAS} FROM midias WHERE id = ${midiaId}`),
      ),
    solicitarProcessamento: (restauranteId, midiaId, situacaoEsperada) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const { rows } = await transacao.execute<{ tentativa: number }>(sql`
          WITH alterada AS (
            UPDATE midias SET situacao = 'processando', tentativa = tentativa + 1, motivo_falha = NULL,
                   processamento_iniciado_em = NULL, atualizado_em = now()
             WHERE id = ${midiaId} AND situacao = ${situacaoEsperada}
               AND descartada_em IS NULL AND original_apagado_em IS NULL
            RETURNING restaurante_id, id, tentativa
          ), evento AS (
            INSERT INTO caixa_saida (restaurante_id, tipo_evento, carga)
            SELECT restaurante_id, 'MidiaEnviada',
                   jsonb_build_object('versao', 1, 'midiaId', id, 'tentativa', tentativa)
              FROM alterada
          )
          SELECT tentativa FROM alterada`);
        return rows[0]?.tentativa ?? null;
      }),
    iniciarProcessamento: (restauranteId, midiaId, tentativa) =>
      banco.comRestaurante(restauranteId, (transacao) =>
        umaMidia(
          transacao,
          sql`UPDATE midias SET processamento_iniciado_em = now(), atualizado_em = now()
               WHERE id = ${midiaId} AND situacao = 'processando' AND tentativa = ${tentativa}
                 AND descartada_em IS NULL
           RETURNING ${COLUNAS}`,
        ),
      ),
    concluir: (restauranteId, midiaId, tentativa, derivados) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const midia = await umaMidia(transacao, sql`SELECT ${COLUNAS} FROM midias WHERE id = ${midiaId}`);
        if (midia?.tentativa !== tentativa) {
          return 'obsoleta';
        }
        return publicarNoPrato(transacao, midia, derivados);
      }),
    falhar: (restauranteId, midiaId, tentativa, motivo) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const resultado = await transacao.execute(sql`
          UPDATE midias SET situacao = 'falhou', motivo_falha = ${motivo}, atualizado_em = now()
           WHERE id = ${midiaId} AND situacao = 'processando' AND tentativa = ${tentativa}`);
        return (resultado.rowCount ?? 0) > 0;
      }),
    listarDoPrato: (restauranteId, pratoId) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const { rows } = await transacao.execute<LinhaDoPrato>(
          sql`SELECT midia_id FROM pratos WHERE id = ${pratoId} AND removido_em IS NULL`,
        );
        const [prato] = rows;
        if (prato === undefined) {
          return null;
        }
        const atual =
          prato.midia_id === null
            ? null
            : await umaMidia(transacao, sql`SELECT ${COLUNAS} FROM midias WHERE id = ${prato.midia_id}`);
        const pendente = await umaMidia(
          transacao,
          sql`SELECT ${COLUNAS} FROM midias
               WHERE prato_id = ${pratoId} AND descartada_em IS NULL AND id IS DISTINCT FROM ${prato.midia_id}
               ORDER BY criado_em DESC, id DESC LIMIT 1`,
        );
        return { atual, pendente };
      }),
    removerDoPrato: (restauranteId, pratoId) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const prato = await travarPrato(transacao, pratoId);
        if (prato === undefined) {
          return false;
        }
        await descartar(transacao, sql`prato_id = ${pratoId}`);
        if (prato.midia_id !== null) {
          await transacao.execute(
            sql`UPDATE pratos SET midia_id = NULL, atualizado_em = now() WHERE id = ${pratoId}`,
          );
        }
        return true;
      }),
    marcarOriginalApagado: (restauranteId, midiaId) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        await transacao.execute(
          sql`UPDATE midias SET original_apagado_em = now(), atualizado_em = now()
               WHERE id = ${midiaId} AND original_apagado_em IS NULL`,
        );
      }),
  };
}
