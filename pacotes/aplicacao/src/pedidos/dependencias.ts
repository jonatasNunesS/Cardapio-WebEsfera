import type { Relogio } from '../compartilhado/portas/relogio.ts';
import type { RepositorioDePedidos, Resumidor } from './portas/repositorio-de-pedidos.ts';

export interface DependenciasDosPedidos {
  readonly pedidos: RepositorioDePedidos;
  readonly resumidor: Resumidor;
  readonly relogio: Relogio;
}
