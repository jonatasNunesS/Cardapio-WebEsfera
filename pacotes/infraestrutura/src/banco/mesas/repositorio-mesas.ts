import type { RepositorioMesas, ResolucaoDeMesa } from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import type { AcessoAoBanco } from '../banco.ts';

interface LinhaDeResolucao extends Record<string, unknown> {
  readonly situacao: 'valida' | 'redirecionar' | 'inativa' | 'cancelado' | 'desconhecido';
  readonly restaurante_id: string | null;
  readonly mesa_id: string | null;
  readonly slug_atual: string | null;
  readonly numero_atual: number | null;
}

function paraResolucao(linha: LinhaDeResolucao | undefined): ResolucaoDeMesa {
  if (linha === undefined) {
    return { situacao: 'desconhecido' };
  }
  if (linha.situacao !== 'valida' && linha.situacao !== 'redirecionar') {
    return { situacao: linha.situacao };
  }
  if (
    linha.restaurante_id === null ||
    linha.mesa_id === null ||
    linha.slug_atual === null ||
    linha.numero_atual === null
  ) {
    return { situacao: 'desconhecido' };
  }
  return {
    situacao: linha.situacao,
    restauranteId: linha.restaurante_id,
    mesaId: linha.mesa_id,
    slugAtual: linha.slug_atual,
    numeroAtual: linha.numero_atual,
  };
}

export function criarRepositorioMesas(banco: AcessoAoBanco): RepositorioMesas {
  return {
    resolverMesa: (slug, numero, codigo) =>
      banco.semRestaurante('resolverMesa', async (transacao) => {
        const resultado = await transacao.execute<LinhaDeResolucao>(
          sql`SELECT * FROM app.resolver_mesa(${slug}, ${numero}, ${codigo})`,
        );
        return paraResolucao(resultado.rows[0]);
      }),
  };
}
