import {
  autenticadorTotp,
  carregarSenhasVazadas,
  criarCifraAesGcm,
  criarCofreArgon2,
  criarEnviadorDeEmailIndisponivel,
  criarEnviadorDeEmailNoConsole,
  criarRegistroDeTentativas,
  criarRepositorioDeAdmins,
  criarRepositorioDeContas,
  criarRepositorioDeHorarios,
  criarRepositorioDePersonalizacao,
  criarRepositorioDeRestaurantes,
  criarRepositorioDeSessoes,
  geradorDeCodigosDeRecuperacao,
  geradorDeSegredos,
  lerChaveDeCifra,
  type AcessoAoBanco,
} from '@cardapio/infraestrutura';
import type { Logger } from '@cardapio/observabilidade/node';
import { criarSinaisDeSeguranca } from '@cardapio/observabilidade/node';
import type { AmbienteApi } from '../ambiente.ts';
import type { DependenciasDeIdentidade } from '../identidade/dependencias.ts';

export const ROTULO_DO_TOTP = 'Admin';

function enviadorDeEmail(ambiente: AmbienteApi) {
  return ambiente.APP_ENV === 'local' ? criarEnviadorDeEmailNoConsole() : criarEnviadorDeEmailIndisponivel();
}

export function comporIdentidade(
  ambiente: AmbienteApi,
  banco: AcessoAoBanco,
  logger: Logger,
): DependenciasDeIdentidade {
  return {
    contas: criarRepositorioDeContas(banco),
    sessoes: criarRepositorioDeSessoes(banco),
    tentativas: criarRegistroDeTentativas(banco),
    admins: criarRepositorioDeAdmins(banco),
    restaurantes: criarRepositorioDeRestaurantes(banco),
    personalizacoes: criarRepositorioDePersonalizacao(banco),
    horarios: criarRepositorioDeHorarios(banco),
    cofre: criarCofreArgon2(),
    senhasVazadas: carregarSenhasVazadas(),
    segredos: geradorDeSegredos,
    totp: autenticadorTotp,
    cifra: criarCifraAesGcm(lerChaveDeCifra(ambiente.CHAVE_CIFRA_TOTP)),
    recuperacao: geradorDeCodigosDeRecuperacao,
    sinais: criarSinaisDeSeguranca(logger),
    email: enviadorDeEmail(ambiente),
    relogio: { agora: () => new Date() },
    urlDoPainel: ambiente.URL_PAINEL,
    rotuloDoTotp: ROTULO_DO_TOTP,
  };
}
