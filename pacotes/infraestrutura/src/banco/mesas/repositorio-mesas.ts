import type { RepositorioMesas, ResolucaoDeMesa } from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import type { AcessoAoBanco } from '../banco.ts';

interface LinhaDeResolucao extends Record<string, unknown> {
  readonly situacao: 'valida' | 'redirecionar' | 'invalida';
  readonly restaurante_id: string | null;
  readonly mesa_id: string | null;
  readonly slug_atual: string | null;
  readonly numero_atual: number | null;
  readonly codigo_reconhecido: boolean;
}

function paraResolucao(linha: LinhaDeResolucao | undefined): ResolucaoDeMesa {
  if (
    linha === undefined ||
    linha.situacao === 'invalida' ||
    linha.restaurante_id === null ||
    linha.mesa_id === null ||
    linha.slug_atual === null ||
    linha.numero_atual === null
  ) {
    return { situacao: 'invalida', codigoReconhecido: linha?.codigo_reconhecido ?? false };
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
