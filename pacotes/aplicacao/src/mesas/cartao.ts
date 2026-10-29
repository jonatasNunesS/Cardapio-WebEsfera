import type { DadosDoCartao } from './portas/cartoes-de-qr.ts';
import type { ListaDeMesas, MesaComLink } from './casos-de-uso/listar-mesas.ts';

export function paraCartao(lista: ListaDeMesas, mesa: MesaComLink): DadosDoCartao {
  return {
    link: mesa.link,
    numero: mesa.numero,
    nomeDaMesa: mesa.nome,
    nomeDoRestaurante: lista.nomeDoRestaurante,
  };
}
