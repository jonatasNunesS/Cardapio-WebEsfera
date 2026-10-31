import type { DependenciasDaPlataforma } from './dependencias.ts';
import type { ConviteNovo } from './portas/repositorio-da-plataforma.ts';

export const VALIDADE_DO_CONVITE_MS = 72 * 3600_000;

export function novoConvite(dependencias: DependenciasDaPlataforma, agora: Date) {
  const token = dependencias.segredos.token();
  const convite: ConviteNovo = {
    hashToken: dependencias.segredos.resumo(token),
    expiraEm: new Date(agora.getTime() + VALIDADE_DO_CONVITE_MS),
  };
  const link = `${dependencias.urlDoConvite}#token=${encodeURIComponent(token)}`;
  return { convite, link };
}
