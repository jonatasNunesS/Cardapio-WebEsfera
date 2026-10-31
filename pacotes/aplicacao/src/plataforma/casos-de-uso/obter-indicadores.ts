import type { DependenciasDaPlataforma } from '../dependencias.ts';
import type { AcessoDoAdmin, Indicadores } from '../portas/repositorio-da-plataforma.ts';

export function obterIndicadores(
  dependencias: DependenciasDaPlataforma,
  acesso: AcessoDoAdmin,
): Promise<Indicadores> {
  return dependencias.plataforma.indicadores(acesso, dependencias.relogio.agora());
}
