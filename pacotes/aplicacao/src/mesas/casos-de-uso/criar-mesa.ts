import {
  exigirCodigoDaMesa,
  Resultado,
  validarDadosDaMesa,
  validarNumeroDaMesa,
  type DadosDaMesa,
  type ErroDeNegocio,
} from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { DependenciasDasMesas } from '../dependencias.ts';
import { autoriaDe, paraResultado, semPermissaoNaMesa } from '../desfechos.ts';
import type { MesaGuardada } from '../portas/repositorio-de-mesas.ts';

export interface PedidoDeMesa extends DadosDaMesa {
  readonly numero: number;
}

export async function criarMesa(
  dependencias: DependenciasDasMesas,
  acesso: AcessoAoRestaurante,
  pedido: PedidoDeMesa,
): Promise<Resultado<MesaGuardada, ErroDeNegocio>> {
  const proibido = semPermissaoNaMesa(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  const numero = validarNumeroDaMesa(pedido.numero);
  if (!numero.ok) {
    return numero;
  }
  const dados = validarDadosDaMesa(pedido);
  if (!dados.ok) {
    return dados;
  }
  const limite = await dependencias.limite.limite(acesso.restauranteId);
  const gravar = () =>
    dependencias.mesas.criar(
      acesso.restauranteId,
      { numero: numero.valor, ...dados.valor, codigo: exigirCodigoDaMesa(dependencias.codigos.gerar()) },
      limite,
      autoriaDe(acesso),
    );
  const primeira = await gravar();
  return paraResultado(primeira.tipo === 'codigo-repetido' ? await gravar() : primeira, limite);
}
