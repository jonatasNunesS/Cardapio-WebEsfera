import { CODIGOS, ErroDependenciaExterna, type EnviadorDeEmail } from '@cardapio/aplicacao';

export function criarEnviadorDeEmailIndisponivel(): EnviadorDeEmail {
  return {
    enviar: () =>
      Promise.reject(
        new ErroDependenciaExterna(
          CODIGOS.EMAIL_ENVIAR_FALHOU,
          'Nenhum provedor de e-mail configurado neste ambiente',
          { modulo: 'identidade', casoDeUso: 'enviarEmail' },
          { provedor: 'nenhum', operacao: 'enviar' },
        ),
      ),
  };
}
