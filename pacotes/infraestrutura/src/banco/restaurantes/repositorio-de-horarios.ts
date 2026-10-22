import type { RepositorioDeHorarios } from '@cardapio/aplicacao';
import { eq } from 'drizzle-orm';
import type { AcessoAoBanco } from '../banco.ts';
import { horarios } from '../esquema/index.ts';

export function criarRepositorioDeHorarios(banco: AcessoAoBanco): RepositorioDeHorarios {
  return {
    substituir: (restauranteId, novos) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        await transacao.delete(horarios).where(eq(horarios.restauranteId, restauranteId));
        if (novos.length > 0) {
          await transacao.insert(horarios).values(novos.map((horario) => ({ restauranteId, ...horario })));
        }
      }),
  };
}
