export type { SessaoAberta } from './abrir-sessao.ts';
export { confirmarRedefinicaoDeSenha } from './casos-de-uso/confirmar-redefinicao-de-senha.ts';
export type {
  DependenciasDeConfirmarRedefinicao,
  EntradaDeConfirmarRedefinicao,
} from './casos-de-uso/confirmar-redefinicao-de-senha.ts';
export { criarConta, TAMANHO_MAXIMO_DO_NOME_DA_PESSOA } from './casos-de-uso/criar-conta.ts';
export type { DependenciasDeCriarConta, EntradaDeCriarConta } from './casos-de-uso/criar-conta.ts';
export { entrar } from './casos-de-uso/entrar.ts';
export type { DependenciasDeEntrar, Entrada, EntradaDeEntrar } from './casos-de-uso/entrar.ts';
export {
  pedirRedefinicaoDeSenha,
  VALIDADE_DO_TOKEN_DE_REDEFINICAO_MS,
} from './casos-de-uso/pedir-redefinicao-de-senha.ts';
export type { DependenciasDePedirRedefinicao } from './casos-de-uso/pedir-redefinicao-de-senha.ts';
export { renovarSessao } from './casos-de-uso/renovar-sessao.ts';
export type {
  DependenciasDeRenovarSessao,
  EntradaDeRenovarSessao,
  SessaoValida,
} from './casos-de-uso/renovar-sessao.ts';
export { sair } from './casos-de-uso/sair.ts';
export type { DependenciasDeSair } from './casos-de-uso/sair.ts';
export type { CofreDeSenhas } from './portas/cofre-de-senhas.ts';
export type { EnviadorDeEmail, MensagemDeEmail } from './portas/enviador-de-email.ts';
export type { GeradorDeSegredos } from './portas/gerador-de-segredos.ts';
export type { ListaDeSenhasVazadas } from './portas/lista-de-senhas-vazadas.ts';
export type { RegistroDeTentativas, TentativasDoAlvo } from './portas/registro-de-tentativas.ts';
export type {
  Credenciais,
  PapelNoRestaurante,
  PedidoDeRedefinicao,
  RepositorioDeContas,
  Vinculo,
} from './portas/repositorio-de-contas.ts';
export type { NovaSessao, RepositorioDeSessoes, SessaoGuardada } from './portas/repositorio-de-sessoes.ts';
