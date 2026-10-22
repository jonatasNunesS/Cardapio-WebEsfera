import {
  CODIGOS,
  ErroEstadoInconsistente,
  type DadosDoCardapioPublico,
  type FonteDoCardapioPublico,
  type PratoEncontrado,
  type ResolucaoDoCardapio,
} from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import type { AcessoAoBanco } from '../banco.ts';
import { paraCategoria, paraPrato, type LinhaDeCategoria, type LinhaDePrato } from './linhas.ts';

interface LinhaDaResolucao extends Record<string, unknown> {
  readonly situacao: 'valido' | 'redirecionar' | 'inexistente';
  readonly restaurante_id: string | null;
  readonly slug_atual: string | null;
  readonly versao_cardapio: string | number | null;
}

interface LinhaDoCardapio extends Record<string, unknown> {
  readonly nome: string;
  readonly slug: string;
  readonly fuso_horario: string;
  readonly versao_cardapio: string | number;
  readonly personalizacao: DadosDoCardapioPublico['personalizacao'];
  readonly horarios: DadosDoCardapioPublico['horarios'];
  readonly categorias: LinhaDeCategoria[];
  readonly pratos: LinhaDePrato[];
}

interface LinhaEncontrada extends LinhaDePrato {
  readonly categoria: string;
}

const CONSULTA_DO_CARDAPIO = sql`
  SELECT r.nome, r.slug, r.fuso_horario, r.versao_cardapio,
    (SELECT json_build_object(
        'corMarca', p.cor_marca, 'corSobreMarca', p.cor_sobre_marca, 'corMarcaTexto', p.cor_marca_texto,
        'logoUrl', p.logo_url, 'capaUrl', p.capa_url, 'frase', p.frase,
        'linkAvaliacaoGoogle', p.link_avaliacao_google, 'textos', p.textos)
       FROM personalizacoes p) AS personalizacao,
    (SELECT coalesce(json_agg(json_build_object(
        'diaSemana', h.dia_semana, 'abre', to_char(h.abre, 'HH24:MI'), 'fecha', to_char(h.fecha, 'HH24:MI'))
        ORDER BY h.dia_semana), '[]'::json)
       FROM horarios h) AS horarios,
    (SELECT coalesce(json_agg(json_build_object('id', c.id, 'nome', c.nome, 'ordem', c.ordem, 'versao', c.versao)
        ORDER BY c.ordem, c.id), '[]'::json)
       FROM categorias c WHERE c.removida_em IS NULL) AS categorias,
    (SELECT coalesce(json_agg(json_build_object(
        'id', p.id, 'categoria_id', p.categoria_id, 'nome', p.nome, 'descricao', p.descricao,
        'preco_centavos', p.preco_centavos, 'disponivel', p.disponivel, 'destaque', p.destaque,
        'ordem', p.ordem, 'versao', p.versao) ORDER BY p.ordem, p.id), '[]'::json)
       FROM pratos p WHERE p.removido_em IS NULL) AS pratos
  FROM restaurantes r WHERE r.id = app.restaurante_atual()`;

const VETOR_COM_CATEGORIA = sql`(p.busca || setweight(to_tsvector('portuguese', app.sem_acento(c.nome)), 'C'))`;

function paraResolucao(linha: LinhaDaResolucao | undefined): ResolucaoDoCardapio {
  if (
    linha === undefined ||
    linha.situacao === 'inexistente' ||
    linha.restaurante_id === null ||
    linha.slug_atual === null ||
    linha.versao_cardapio === null
  ) {
    return { situacao: 'inexistente' };
  }
  return {
    situacao: linha.situacao,
    restauranteId: linha.restaurante_id,
    slugAtual: linha.slug_atual,
    versao: Number(linha.versao_cardapio),
  };
}

function paraDados(linha: LinhaDoCardapio): DadosDoCardapioPublico {
  return {
    versao: Number(linha.versao_cardapio),
    restaurante: { nome: linha.nome, slug: linha.slug, fusoHorario: linha.fuso_horario },
    personalizacao: linha.personalizacao,
    horarios: linha.horarios,
    categorias: linha.categorias.map(paraCategoria),
    pratos: linha.pratos.map(paraPrato),
  };
}

function paraEncontrado(linha: LinhaEncontrada): PratoEncontrado {
  return {
    id: linha.id,
    nome: linha.nome,
    descricao: linha.descricao,
    precoCentavos: linha.preco_centavos,
    disponivel: linha.disponivel,
    destaque: linha.destaque,
    categoria: linha.categoria,
  };
}

export function consultaDePrefixos(termos: readonly string[]): string {
  return termos.map((termo) => `${termo}:*`).join(' & ');
}

export function criarFonteDoCardapioPublico(banco: AcessoAoBanco): FonteDoCardapioPublico {
  return {
    resolver: (slug) =>
      banco.semRestaurante('resolverCardapio', async (transacao) => {
        const { rows } = await transacao.execute<LinhaDaResolucao>(
          sql`SELECT * FROM app.resolver_cardapio(${slug})`,
        );
        return paraResolucao(rows[0]);
      }),
    ler: (restauranteId) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const { rows } = await transacao.execute<LinhaDoCardapio>(CONSULTA_DO_CARDAPIO);
        const [linha] = rows;
        if (linha === undefined) {
          throw new ErroEstadoInconsistente(
            CODIGOS.BANCO_CONTEXTO_INVALIDO,
            'O restaurante resolvido pelo slug não aparece no próprio contexto',
            { modulo: 'cardapio', casoDeUso: 'lerCardapioPublico', restauranteId },
          );
        }
        return paraDados(linha);
      }),
    buscar: (restauranteId, termos) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const { rows } = await transacao.execute<LinhaEncontrada>(sql`
          WITH q AS (SELECT to_tsquery('portuguese', ${consultaDePrefixos(termos)}) AS consulta)
          SELECT p.id, p.categoria_id, p.nome, p.descricao, p.preco_centavos, p.disponivel, p.destaque,
                 p.ordem, p.versao, c.nome AS categoria
            FROM pratos p
            JOIN categorias c ON c.restaurante_id = p.restaurante_id AND c.id = p.categoria_id
            CROSS JOIN q
           WHERE p.removido_em IS NULL AND c.removida_em IS NULL AND ${VETOR_COM_CATEGORIA} @@ q.consulta
           ORDER BY ts_rank(${VETOR_COM_CATEGORIA}, q.consulta) DESC, c.ordem, p.ordem
           LIMIT 50`);
        return rows.map(paraEncontrado);
      }),
  };
}
