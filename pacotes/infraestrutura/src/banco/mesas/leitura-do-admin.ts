import type { LeituraDeMesasDoAdmin } from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import type { AcessoAoBanco } from '../banco.ts';

interface LinhaDoAdmin extends Record<string, unknown> {
  readonly restaurante_nome: string;
  readonly slug: string;
  readonly mesa_id: string | null;
  readonly numero: number | null;
  readonly nome: string | null;
  readonly area: string | null;
  readonly codigo: string | null;
  readonly ativa: boolean | null;
}

export function criarLeituraDeMesasDoAdmin(banco: AcessoAoBanco): LeituraDeMesasDoAdmin {
  return {
    listar: (administradorId, slug) =>
      banco.semRestaurante('adminListarMesas', async (transacao) => {
        const { rows } = await transacao.execute<LinhaDoAdmin>(
          sql`SELECT * FROM app.admin_listar_mesas(${administradorId}, ${slug})`,
        );
        const [primeira] = rows;
        if (primeira === undefined) {
          return null;
        }
        return {
          nomeDoRestaurante: primeira.restaurante_nome,
          slug: primeira.slug,
          mesas: rows.flatMap((linha) =>
            linha.numero === null || linha.codigo === null
              ? []
              : [
                  {
                    numero: linha.numero,
                    nome: linha.nome,
                    area: linha.area,
                    codigo: linha.codigo,
                    ativa: linha.ativa === true,
                  },
                ],
          ),
        };
      }),
  };
}
