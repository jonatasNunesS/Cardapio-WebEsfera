import { decidirPelaRegua } from '../decidir-mudanca.ts';
import type { DependenciasDasRotinasDeCobranca } from '../dependencias.ts';
import { percorrerRestaurantes } from '../percorrer-restaurantes.ts';

export interface ResumoDaInadimplencia {
  readonly avaliados: number;
  readonly alterados: number;
}

export async function aplicarInadimplencia(
  dependencias: Pick<DependenciasDasRotinasDeCobranca, 'assinaturas' | 'restaurantes' | 'relogio'>,
): Promise<ResumoDaInadimplencia> {
  const decidir = decidirPelaRegua(dependencias.relogio.agora());
  let alterados = 0;
  const avaliados = await percorrerRestaurantes(dependencias.restaurantes, async (restauranteId) => {
    const desfecho = await dependencias.assinaturas.alterarComTrava(
      { restauranteId, mpAssinaturaId: null },
      decidir,
    );
    alterados += desfecho === 'aplicada' ? 1 : 0;
  });
  return { avaliados, alterados };
}
