export { consultarRestaurante } from './casos-de-uso/consultar-restaurante.ts';
export { criarRestaurante } from './casos-de-uso/criar-restaurante.ts';
export type {
  DependenciasDeCriarRestaurante,
  EntradaDeCriarRestaurante,
} from './casos-de-uso/criar-restaurante.ts';
export { definirHorarios } from './casos-de-uso/definir-horarios.ts';
export type { RepositorioDeHorarios } from './portas/repositorio-de-horarios.ts';
export type {
  RepositorioDeRestaurantes,
  RestauranteCriado,
  RestauranteNovo,
  ResumoDoRestaurante,
} from './portas/repositorio-de-restaurantes.ts';
