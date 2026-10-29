import { CODIGOS, criarErroDeNegocio, Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import { podeGerir, type AcessoAoRestaurante } from '../compartilhado/acesso.ts';
import { ErroEstadoInconsistente } from '../compartilhado/erros/erro-estado-inconsistente.ts';
import type { Autoria, DesfechoDaMesa, MesaGuardada } from './portas/repositorio-de-mesas.ts';

export function semPermissaoNaMesa(acesso: AcessoAoRestaurante): ErroDeNegocio | undefined {
  return podeGerir(acesso)
    ? undefined
    : criarErroDeNegocio(CODIGOS.MESA_EDITAR_SEM_PERMISSAO, 'Só o dono ou o gerente muda as mesas.');
}

export function autoriaDe(acesso: AcessoAoRestaurante): Autoria {
  return { usuarioId: acesso.usuarioId ?? null };
}

export function paraResultado(desfecho: DesfechoDaMesa, limite = 0): Resultado<MesaGuardada, ErroDeNegocio> {
  switch (desfecho.tipo) {
    case 'ok':
      return Resultado.ok(desfecho.mesa);
    case 'nao-encontrada':
      return Resultado.falha(
        criarErroDeNegocio(CODIGOS.MESA_EDITAR_NAO_ENCONTRADA, 'Esta mesa não existe mais.'),
      );
    case 'numero-repetido':
      return Resultado.falha(
        criarErroDeNegocio(CODIGOS.MESA_EDITAR_NUMERO_REPETIDO, 'Já existe uma mesa com esse número.', {
          campo: 'numero',
        }),
      );
    case 'limite':
      return Resultado.falha(
        criarErroDeNegocio(
          CODIGOS.MESA_CRIAR_LIMITE_DO_PLANO,
          `O plano permite até ${String(limite)} mesas ativas. Desative uma mesa ou mude de plano.`,
          { limite },
        ),
      );
    case 'codigo-repetido':
      throw new ErroEstadoInconsistente(
        CODIGOS.MESA_CODIGO_GERADO_INVALIDO,
        'Código de mesa repetido duas vezes',
        {
          modulo: 'mesas',
          casoDeUso: 'gerarCodigo',
        },
      );
  }
}
