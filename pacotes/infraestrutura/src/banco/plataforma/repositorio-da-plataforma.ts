import type {
  AcessoDoAdmin,
  FinanceiroDoRestaurante,
  RepositorioDaPlataforma,
  RestauranteDoAdmin,
} from '@cardapio/aplicacao';
import type { SituacaoDoRestaurante } from '@cardapio/dominio';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { AcessoAoBanco, Transacao } from '../banco.ts';
import { personalizacoes } from '../esquema/index.ts';

interface LinhaDoRestaurante extends Record<string, unknown> {
  readonly nome: string;
  readonly slug: string;
  readonly situacao: SituacaoDoRestaurante;
  readonly suspenso: boolean;
  readonly teste_termina_em: string;
  readonly criado_em: string;
}

const iso = (data: Date) => data.toISOString();

async function auditar(
  transacao: Transacao,
  acesso: AcessoDoAdmin,
  registro: { acao: string; entidade: string; entidadeId: string | null; motivo: string | null },
) {
  await transacao.execute(sql`
    INSERT INTO auditoria (restaurante_id, autor_tipo, autor_id, acao, entidade, entidade_id, motivo)
    VALUES (app.restaurante_atual(), 'administrador', ${acesso.administradorId}, ${registro.acao},
            ${registro.entidade}, ${registro.entidadeId}, ${registro.motivo})`);
}

async function inserirConvite(
  transacao: Transacao,
  acesso: AcessoDoAdmin,
  usuarioId: string,
  convite: RestauranteDoAdmin['convite'],
  agora: Date,
) {
  await transacao.execute(sql`
    UPDATE convites SET invalidado_em = ${iso(agora)}::timestamptz
    WHERE usuario_id = ${usuarioId} AND usado_em IS NULL AND invalidado_em IS NULL`);
  const id = uuidv7();
  await transacao.execute(sql`
    INSERT INTO convites (restaurante_id, id, usuario_id, hash_token, criado_por, criado_em, expira_em)
    VALUES (app.restaurante_atual(), ${id}, ${usuarioId}, ${convite.hashToken}, ${acesso.administradorId},
            ${iso(agora)}::timestamptz, ${iso(convite.expiraEm)}::timestamptz)`);
  await auditar(transacao, acesso, {
    acao: 'convite.gerar',
    entidade: 'convite',
    entidadeId: id,
    motivo: null,
  });
}

async function criarNoContexto(
  transacao: Transacao,
  restauranteId: string,
  acesso: AcessoDoAdmin,
  novo: RestauranteDoAdmin,
  agora: Date,
) {
  const { rows } = await transacao.execute<{ desfecho: string; usuario_id: string | null }>(sql`
    SELECT * FROM app.admin_criar_restaurante(${acesso.administradorId}, ${novo.nome}, ${novo.slug},
      ${iso(novo.testeTerminaEm)}::timestamptz, ${novo.dono.nome}, ${novo.dono.email}, ${novo.dono.hashSenhaInutil})`);
  const [linha] = rows;
  if (linha?.desfecho !== 'criado' || linha.usuario_id === null) {
    return (linha?.desfecho ?? 'proibido') as 'slug-ocupado' | 'email-ocupado' | 'proibido';
  }
  await transacao.insert(personalizacoes).values({ restauranteId, ...novo.personalizacao });
  await inserirConvite(transacao, acesso, linha.usuario_id, novo.convite, agora);
  return 'criado' as const;
}

async function lerFinanceiro(transacao: Transacao): Promise<FinanceiroDoRestaurante | null> {
  const restaurante = await transacao.execute<{ situacao: SituacaoDoRestaurante }>(
    sql`SELECT situacao FROM restaurantes WHERE id = app.restaurante_atual()`,
  );
  const situacao = restaurante.rows[0]?.situacao;
  if (situacao === undefined) {
    return null;
  }
  const assinatura = await transacao.execute<{
    situacao: string;
    plano: string;
    pago_ate: string | null;
    proxima_cobranca_em: string | null;
  }>(sql`
    SELECT a.situacao, p.nome AS plano, a.pago_ate, a.proxima_cobranca_em
    FROM assinaturas a JOIN planos p ON p.id = a.plano_id
    ORDER BY (a.situacao <> 'cancelada') DESC, a.criado_em DESC LIMIT 1`);
  const cobrancas = await transacao.execute<{
    situacao: string;
    valor_centavos: number;
    vence_em: string;
    paga_em: string | null;
  }>(sql`SELECT situacao, valor_centavos, vence_em, paga_em FROM cobrancas ORDER BY vence_em DESC LIMIT 24`);
  const [viva] = assinatura.rows;
  const data = (valor: string | null) => (valor === null ? null : new Date(valor));
  return {
    situacaoDoRestaurante: situacao,
    assinatura:
      viva === undefined
        ? null
        : {
            situacao: viva.situacao,
            plano: viva.plano,
            pagoAte: data(viva.pago_ate),
            proximaCobrancaEm: data(viva.proxima_cobranca_em),
          },
    cobrancas: cobrancas.rows.map((linha) => ({
      situacao: linha.situacao,
      valorCentavos: linha.valor_centavos,
      venceEm: new Date(linha.vence_em),
      pagaEm: data(linha.paga_em),
    })),
  };
}

export function criarRepositorioDaPlataforma(banco: AcessoAoBanco): RepositorioDaPlataforma {
  return {
    listar: (acesso) =>
      banco.semRestaurante('adminListarRestaurantes', async (transacao) => {
        const { rows } = await transacao.execute<LinhaDoRestaurante>(
          sql`SELECT * FROM app.admin_listar_restaurantes(${acesso.administradorId})`,
        );
        return rows.map((linha) => ({
          nome: linha.nome,
          slug: linha.slug,
          situacao: linha.situacao,
          suspenso: linha.suspenso,
          testeTerminaEm: new Date(linha.teste_termina_em),
          criadoEm: new Date(linha.criado_em),
        }));
      }),
    resolver: (acesso, slug) =>
      banco.semRestaurante('adminResolverRestaurante', async (transacao) => {
        const { rows } = await transacao.execute<{ id: string | null }>(
          sql`SELECT app.admin_resolver_restaurante(${acesso.administradorId}, ${slug}) AS id`,
        );
        return rows[0]?.id ?? null;
      }),
    criar: (acesso, novo, agora) => {
      const restauranteId = uuidv7();
      return banco.comRestaurante(restauranteId, (transacao) =>
        criarNoContexto(transacao, restauranteId, acesso, novo, agora),
      );
    },
    gerarConvite: (acesso, restauranteId, convite, agora) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const contato = await transacao.execute<{ nome: string; email: string }>(
          sql`SELECT nome, email FROM app.admin_dono_do_restaurante(${acesso.administradorId})`,
        );
        const vinculo = await transacao.execute<{ usuario_id: string }>(
          sql`SELECT usuario_id FROM vinculos WHERE papel = 'dono' ORDER BY criado_em LIMIT 1`,
        );
        const [dono] = contato.rows;
        const [doDono] = vinculo.rows;
        if (dono === undefined || doDono === undefined) {
          return null;
        }
        await inserirConvite(transacao, acesso, doDono.usuario_id, convite, agora);
        return { nome: dono.nome, email: dono.email };
      }),
    suspender: (acesso, restauranteId, motivo, agora) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const { rows } = await transacao.execute<{ id: string }>(sql`
          INSERT INTO suspensoes_restaurante (restaurante_id, motivo, suspensa_por, suspensa_em)
          VALUES (app.restaurante_atual(), ${motivo}, ${acesso.administradorId}, ${iso(agora)}::timestamptz)
          ON CONFLICT (restaurante_id) WHERE reativada_em IS NULL DO NOTHING
          RETURNING id`);
        const [criada] = rows;
        if (criada !== undefined) {
          await auditar(transacao, acesso, {
            acao: 'restaurante.suspender',
            entidade: 'suspensao',
            entidadeId: criada.id,
            motivo,
          });
        }
        return criada !== undefined;
      }),
    reativar: (acesso, restauranteId, motivo, agora) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const { rows } = await transacao.execute<{ id: string }>(sql`
          UPDATE suspensoes_restaurante
          SET reativada_em = ${iso(agora)}::timestamptz, reativada_por = ${acesso.administradorId}, motivo_reativacao = ${motivo}
          WHERE reativada_em IS NULL RETURNING id`);
        const [fechada] = rows;
        if (fechada !== undefined) {
          await auditar(transacao, acesso, {
            acao: 'restaurante.reativar',
            entidade: 'suspensao',
            entidadeId: fechada.id,
            motivo,
          });
        }
        return fechada !== undefined;
      }),
    financeiro: (restauranteId) => banco.comRestaurante(restauranteId, lerFinanceiro),
    indicadores: (acesso, agora) =>
      banco.semRestaurante('adminIndicadores', async (transacao) => {
        const { rows } = await transacao.execute<{ chave: string; total: number }>(
          sql`SELECT * FROM app.admin_indicadores(${acesso.administradorId}, ${iso(agora)}::timestamptz)`,
        );
        const porSituacao: Record<string, number> = {};
        for (const linha of rows.filter((item) => item.chave.startsWith('situacao:'))) {
          porSituacao[linha.chave.slice('situacao:'.length)] = linha.total;
        }
        return {
          porSituacao,
          pedidosUltimas24h: rows.find((linha) => linha.chave === 'pedidos_24h')?.total ?? 0,
        };
      }),
    aceitarConvite: (hashToken, hashSenha, agora) =>
      banco.semRestaurante('aceitarConvite', async (transacao) => {
        const { rows } = await transacao.execute<{ aceito: boolean }>(
          sql`SELECT app.aceitar_convite(${hashToken}, ${hashSenha}, ${iso(agora)}::timestamptz) AS aceito`,
        );
        return rows[0]?.aceito === true;
      }),
  };
}
