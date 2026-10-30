import {
  CODIGOS,
  ErroEstadoInconsistente,
  type AlvoDaAlteracao,
  type AssinaturaGuardada,
  type CobrancaGuardada,
  type DesfechoDaAlteracao,
  type EstadoTravado,
  type MudancaDaCobranca,
  type PlanoOferecido,
  type RepositorioDeAssinaturas,
} from '@cardapio/aplicacao';
import type {
  EstadoDaCobranca,
  SituacaoDaAssinatura,
  SituacaoDaCobranca,
  SituacaoDoRestaurante,
} from '@cardapio/dominio';
import { sql, type SQL } from 'drizzle-orm';
import type { AcessoAoBanco, Transacao } from '../banco.ts';

interface LinhaDePlano extends Record<string, unknown> {
  readonly plano_id: string;
  readonly codigo: string;
  readonly nome: string;
  readonly preco_centavos: number;
  readonly limite_mesas: number;
}

interface LinhaDeAssinatura extends LinhaDePlano {
  readonly id: string;
  readonly mp_assinatura_id: string;
  readonly situacao: SituacaoDaAssinatura;
  readonly init_point: string;
  readonly pago_ate: string | null;
  readonly proxima_cobranca_em: string | null;
}

interface LinhaDeCobranca extends Record<string, unknown> {
  readonly mp_cobranca_id: string;
  readonly mp_pagamento_id: string | null;
  readonly valor_centavos: number;
  readonly situacao: SituacaoDaCobranca;
  readonly vence_em: string;
  readonly paga_em: string | null;
}

interface LinhaDoRestaurante extends Record<string, unknown> {
  readonly situacao: SituacaoDoRestaurante;
  readonly teste_termina_em: string;
  readonly fuso_horario: string;
  readonly pago_ate: string | null;
}

const data = (valor: string) => new Date(valor);
const talvez = (valor: string | null) => (valor === null ? null : new Date(valor));

const paraPlano = (linha: LinhaDePlano): PlanoOferecido => ({
  id: linha.plano_id,
  codigo: linha.codigo,
  nome: linha.nome,
  precoCentavos: linha.preco_centavos,
  limiteMesas: linha.limite_mesas,
});

const paraAssinatura = (linha: LinhaDeAssinatura): AssinaturaGuardada => ({
  id: linha.id,
  plano: paraPlano(linha),
  mpAssinaturaId: linha.mp_assinatura_id,
  situacao: linha.situacao,
  initPoint: linha.init_point,
  pagoAte: talvez(linha.pago_ate),
  proximaCobrancaEm: talvez(linha.proxima_cobranca_em),
});

const paraCobranca = (linha: LinhaDeCobranca): CobrancaGuardada => ({
  mpCobrancaId: linha.mp_cobranca_id,
  mpPagamentoId: linha.mp_pagamento_id,
  valorCentavos: linha.valor_centavos,
  situacao: linha.situacao,
  venceEm: data(linha.vence_em),
  pagaEm: talvez(linha.paga_em),
});

const COLUNAS_DA_ASSINATURA = sql.raw(`a.id, a.mp_assinatura_id, a.situacao, a.init_point, a.pago_ate,
  a.proxima_cobranca_em, p.id AS plano_id, p.codigo, p.nome, p.preco_centavos, p.limite_mesas`);

const instante = (data: Date | null) => (data === null ? null : data.toISOString());

async function umaAssinatura(transacao: Transacao, filtro: SQL, travar = false) {
  const { rows } = await transacao.execute<LinhaDeAssinatura>(sql`
    SELECT ${COLUNAS_DA_ASSINATURA} FROM assinaturas a JOIN planos p ON p.id = a.plano_id
    WHERE ${filtro} ORDER BY a.criado_em DESC LIMIT 1 ${travar ? sql`FOR UPDATE OF a` : sql``}`);
  const [linha] = rows;
  return linha === undefined ? null : paraAssinatura(linha);
}

const inconsistente = (casoDeUso: string, mensagem: string) =>
  new ErroEstadoInconsistente(CODIGOS.BANCO_CONTEXTO_INVALIDO, mensagem, { modulo: 'cobranca', casoDeUso });

const viva = sql`a.situacao <> 'cancelada'`;

async function estadoDoRestaurante(transacao: Transacao, travar: boolean): Promise<EstadoDaCobranca | null> {
  const { rows } = await transacao.execute<LinhaDoRestaurante>(sql`
    SELECT r.situacao, r.teste_termina_em, r.fuso_horario,
           (SELECT max(a.pago_ate) FROM assinaturas a) AS pago_ate
    FROM restaurantes r WHERE r.id = app.restaurante_atual() ${travar ? sql`FOR UPDATE OF r` : sql``}`);
  const [linha] = rows;
  return linha === undefined
    ? null
    : {
        situacaoAtual: linha.situacao,
        testeTerminaEm: data(linha.teste_termina_em),
        fusoHorario: linha.fuso_horario,
        pagoAte: talvez(linha.pago_ate),
      };
}

async function cobrancasDa(transacao: Transacao, assinaturaId: string | null): Promise<CobrancaGuardada[]> {
  if (assinaturaId === null) {
    return [];
  }
  const { rows } = await transacao.execute<LinhaDeCobranca>(sql`
    SELECT mp_cobranca_id, mp_pagamento_id, valor_centavos, situacao, vence_em, paga_em
    FROM cobrancas WHERE assinatura_id = ${assinaturaId}`);
  return rows.map(paraCobranca);
}

async function gravarCobranca(transacao: Transacao, assinaturaId: string, cobranca: CobrancaGuardada) {
  await transacao.execute(sql`
    INSERT INTO cobrancas (restaurante_id, assinatura_id, mp_cobranca_id, mp_pagamento_id, valor_centavos,
                           situacao, vence_em, paga_em)
    VALUES (app.restaurante_atual(), ${assinaturaId}, ${cobranca.mpCobrancaId}, ${cobranca.mpPagamentoId},
            ${cobranca.valorCentavos}, ${cobranca.situacao}, ${cobranca.venceEm.toISOString()}::timestamptz,
            ${instante(cobranca.pagaEm)}::timestamptz)
    ON CONFLICT (mp_cobranca_id) DO UPDATE SET
      mp_pagamento_id = EXCLUDED.mp_pagamento_id, valor_centavos = EXCLUDED.valor_centavos,
      situacao = EXCLUDED.situacao, vence_em = EXCLUDED.vence_em, paga_em = EXCLUDED.paga_em,
      atualizado_em = now()`);
}

async function aplicar(transacao: Transacao, estado: EstadoTravado, mudanca: MudancaDaCobranca) {
  const assinatura = estado.assinatura;
  if (assinatura === null) {
    await alterarRestaurante(transacao, mudanca);
    return;
  }
  if (mudanca.assinatura !== null) {
    await transacao.execute(sql`
      UPDATE assinaturas SET situacao = ${mudanca.assinatura.situacao},
        pago_ate = ${instante(mudanca.assinatura.pagoAte)}::timestamptz,
        proxima_cobranca_em = ${instante(mudanca.assinatura.proximaCobrancaEm)}::timestamptz,
        atualizado_em = now()
      WHERE id = ${assinatura.id}`);
  }
  for (const cobranca of mudanca.cobrancas) {
    await gravarCobranca(transacao, assinatura.id, cobranca);
  }
  await alterarRestaurante(transacao, mudanca);
}

async function alterarRestaurante(transacao: Transacao, mudanca: MudancaDaCobranca) {
  if (mudanca.situacaoDoRestaurante !== null) {
    await transacao.execute(sql`
      UPDATE restaurantes SET situacao = ${mudanca.situacaoDoRestaurante}, atualizado_em = now()
      WHERE id = app.restaurante_atual()`);
  }
  for (const evento of mudanca.eventos) {
    await transacao.execute(sql`
      INSERT INTO caixa_saida (restaurante_id, tipo_evento, carga)
      VALUES (app.restaurante_atual(), ${evento.tipo}, ${JSON.stringify(evento.carga)}::jsonb)`);
  }
}

async function alterar(
  transacao: Transacao,
  alvo: AlvoDaAlteracao,
  decidir: (estado: EstadoTravado) => MudancaDaCobranca | null,
): Promise<DesfechoDaAlteracao> {
  const restaurante = await estadoDoRestaurante(transacao, true);
  const filtro = alvo.mpAssinaturaId === null ? viva : sql`a.mp_assinatura_id = ${alvo.mpAssinaturaId}`;
  const assinatura = restaurante === null ? null : await umaAssinatura(transacao, filtro, true);
  if (restaurante === null || (alvo.mpAssinaturaId !== null && assinatura === null)) {
    return 'assinatura-desconhecida';
  }
  const estado: EstadoTravado = {
    restaurante,
    assinatura,
    cobrancas: await cobrancasDa(transacao, assinatura?.id ?? null),
  };
  const mudanca = decidir(estado);
  if (mudanca === null) {
    return 'sem-mudanca';
  }
  await aplicar(transacao, estado, mudanca);
  return 'aplicada';
}

export function criarRepositorioDeAssinaturas(banco: AcessoAoBanco): RepositorioDeAssinaturas {
  return {
    listarPlanos: () =>
      banco.semRestaurante('listarPlanos', async (transacao) => {
        const { rows } = await transacao.execute<LinhaDePlano>(sql`
          SELECT id AS plano_id, codigo, nome, preco_centavos, limite_mesas FROM planos
          WHERE ativo ORDER BY preco_centavos, codigo`);
        return rows.map(paraPlano);
      }),
    assinaturaAtual: (restauranteId) =>
      banco.comRestaurante(restauranteId, (transacao) => umaAssinatura(transacao, viva)),
    historico: (restauranteId) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const { rows } = await transacao.execute<LinhaDeCobranca>(sql`
          SELECT mp_cobranca_id, mp_pagamento_id, valor_centavos, situacao, vence_em, paga_em
          FROM cobrancas ORDER BY vence_em DESC, criado_em DESC LIMIT 24`);
        return rows.map(paraCobranca);
      }),
    estadoDaCobranca: (restauranteId) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const estado = await estadoDoRestaurante(transacao, false);
        if (estado === null) {
          throw inconsistente('estadoDaCobranca', 'Restaurante do contexto não encontrado');
        }
        return estado;
      }),
    guardarNova: (restauranteId, nova) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        await transacao.execute(
          sql`SELECT 1 FROM restaurantes WHERE id = app.restaurante_atual() FOR UPDATE`,
        );
        const existente = await umaAssinatura(transacao, sql`a.mp_assinatura_id = ${nova.mpAssinaturaId}`);
        if (existente !== null) {
          return existente;
        }
        await transacao.execute(sql`
          UPDATE assinaturas SET situacao = 'cancelada', atualizado_em = now() WHERE situacao = 'pendente'`);
        await transacao.execute(sql`
          INSERT INTO assinaturas (restaurante_id, plano_id, mp_assinatura_id, situacao, init_point, proxima_cobranca_em)
          VALUES (app.restaurante_atual(), ${nova.planoId}, ${nova.mpAssinaturaId}, ${nova.situacao},
                  ${nova.initPoint}, ${instante(nova.proximaCobrancaEm)}::timestamptz)`);
        const guardada = await umaAssinatura(transacao, sql`a.mp_assinatura_id = ${nova.mpAssinaturaId}`);
        if (guardada === null) {
          throw inconsistente('guardarNova', 'Assinatura gravada não encontrada');
        }
        return guardada;
      }),
    alterarComTrava: (alvo, decidir) =>
      banco.comRestaurante(alvo.restauranteId, (transacao) => alterar(transacao, alvo, decidir)),
  };
}
