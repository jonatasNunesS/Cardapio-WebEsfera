import {
  CODIGOS,
  criarErroDeNegocio,
  Resultado,
  validarHorarios,
  type ErroDeNegocio,
  type Horario,
} from '@cardapio/dominio';
import { podeGerir, type AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { RepositorioDeHorarios } from '../portas/repositorio-de-horarios.ts';

export async function definirHorarios(
  dependencias: { readonly horarios: RepositorioDeHorarios },
  acesso: AcessoAoRestaurante,
  horarios: readonly Horario[],
): Promise<Resultado<readonly Horario[], ErroDeNegocio>> {
  if (!podeGerir(acesso)) {
    return Resultado.falha(
      criarErroDeNegocio(CODIGOS.HORARIO_DEFINIR_SEM_PERMISSAO, 'Só o dono ou o gerente muda os horários.'),
    );
  }
  const validos = validarHorarios(horarios);
  if (!validos.ok) {
    return validos;
  }
  await dependencias.horarios.substituir(acesso.restauranteId, validos.valor);
  return validos;
}
