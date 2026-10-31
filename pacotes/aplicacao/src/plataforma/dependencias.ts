import type { Relogio } from '../compartilhado/portas/relogio.ts';
import type { CofreDeSenhas } from '../identidade/portas/cofre-de-senhas.ts';
import type { GeradorDeSegredos } from '../identidade/portas/gerador-de-segredos.ts';
import type { ListaDeSenhasVazadas } from '../identidade/portas/lista-de-senhas-vazadas.ts';
import type { EnviadorConvite } from './portas/enviador-convite.ts';
import type { RepositorioDaPlataforma } from './portas/repositorio-da-plataforma.ts';

export interface DependenciasDaPlataforma {
  readonly plataforma: RepositorioDaPlataforma;
  readonly enviador: EnviadorConvite;
  readonly segredos: GeradorDeSegredos;
  readonly cofre: CofreDeSenhas;
  readonly senhasVazadas: ListaDeSenhasVazadas;
  readonly relogio: Relogio;
  readonly urlDoConvite: string;
}
