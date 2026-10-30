import type { RepositorioDePersonalizacao } from '@cardapio/aplicacao';
import { eq, sql } from 'drizzle-orm';
import type { AcessoAoBanco } from '../banco.ts';
import { personalizacoes } from '../esquema/index.ts';

export function criarRepositorioDePersonalizacao(banco: AcessoAoBanco): RepositorioDePersonalizacao {
  return {
    buscar: (restauranteId) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const [linha] = await transacao
          .select()
          .from(personalizacoes)
          .where(eq(personalizacoes.restauranteId, restauranteId));
        if (linha === undefined) {
          return null;
        }
        return {
          corMarca: linha.corMarca,
          corSobreMarca: linha.corSobreMarca,
          corMarcaTexto: linha.corMarcaTexto,
          logoUrl: linha.logoUrl,
          capaUrl: linha.capaUrl,
          frase: linha.frase,
          linkAvaliacaoGoogle: linha.linkAvaliacaoGoogle,
          linkInstagram: linha.linkInstagram,
          textos: linha.textos,
          versao: linha.versao,
        };
      }),
    publicar: (restauranteId, personalizacao) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const [linha] = await transacao
          .insert(personalizacoes)
          .values({ restauranteId, ...personalizacao })
          .onConflictDoUpdate({
            target: personalizacoes.restauranteId,
            set: { ...personalizacao, versao: sql`${personalizacoes.versao} + 1`, atualizadoEm: sql`now()` },
          })
          .returning({ versao: personalizacoes.versao });
        return linha?.versao ?? 0;
      }),
  };
}
