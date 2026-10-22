import type { RepositorioDeRestaurantes, RestauranteNovo } from '@cardapio/aplicacao';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { AcessoAoBanco, Transacao } from '../banco.ts';
import { encontrarErroDoPostgres } from '../erros.ts';
import { historicoSlugs, personalizacoes, restaurantes, vinculos } from '../esquema/index.ts';

const RESTRICOES_DE_SLUG: ReadonlySet<string> = new Set([
  'restaurantes_slug_key',
  'historico_slugs_slug_key',
]);

function ehSlugOcupado(erro: unknown): boolean {
  const doPostgres = encontrarErroDoPostgres(erro);
  return doPostgres?.code === '23505' && RESTRICOES_DE_SLUG.has(doPostgres.constraint ?? '');
}

async function reservarSlug(
  transacao: Transacao,
  restauranteId: string,
  slug: string,
  novo: RestauranteNovo,
): Promise<boolean> {
  try {
    await transacao.transaction(async (ponto) => {
      await ponto.insert(restaurantes).values({
        id: restauranteId,
        slug,
        nome: novo.nome,
        situacao: 'teste',
        testeTerminaEm: novo.testeTerminaEm,
      });
      await ponto.insert(historicoSlugs).values({ restauranteId, slug });
    });
    return true;
  } catch (erro) {
    if (ehSlugOcupado(erro)) {
      return false;
    }
    throw erro;
  }
}

export function criarRepositorioDeRestaurantes(banco: AcessoAoBanco): RepositorioDeRestaurantes {
  return {
    criar(novo) {
      const restauranteId = uuidv7();
      return banco.comRestaurante(restauranteId, async (transacao) => {
        for (const slug of novo.candidatosDeSlug) {
          if (await reservarSlug(transacao, restauranteId, slug, novo)) {
            await transacao.insert(vinculos).values({ restauranteId, usuarioId: novo.donoId, papel: 'dono' });
            await transacao.insert(personalizacoes).values({ restauranteId, ...novo.personalizacao });
            return { restauranteId, slug };
          }
        }
        return null;
      });
    },
    buscar: (restauranteId) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const [linha] = await transacao
          .select({
            nome: restaurantes.nome,
            slug: restaurantes.slug,
            situacao: restaurantes.situacao,
            testeTerminaEm: restaurantes.testeTerminaEm,
          })
          .from(restaurantes)
          .where(eq(restaurantes.id, restauranteId));
        return linha ?? null;
      }),
  };
}
