import type { EnviadorDeEmail, MensagemDeEmail } from '@cardapio/aplicacao';

export interface EnviadorDeEmailDeTeste extends EnviadorDeEmail {
  readonly enviados: readonly MensagemDeEmail[];
}

export function criarEnviadorDeEmailDeTeste(): EnviadorDeEmailDeTeste {
  const enviados: MensagemDeEmail[] = [];
  return {
    enviados,
    enviar(mensagem) {
      enviados.push(mensagem);
      return Promise.resolve();
    },
  };
}

export function criarEnviadorDeEmailNoConsole(
  escrever: (texto: string) => void = (texto) => process.stdout.write(texto),
): EnviadorDeEmail {
  return {
    enviar(mensagem) {
      escrever(
        `\n[e-mail local] Para: ${mensagem.para}\nAssunto: ${mensagem.assunto}\n\n${mensagem.texto}\n\n`,
      );
      return Promise.resolve();
    },
  };
}
