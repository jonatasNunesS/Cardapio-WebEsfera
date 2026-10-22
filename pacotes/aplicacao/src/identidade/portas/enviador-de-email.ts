export interface MensagemDeEmail {
  readonly para: string;
  readonly assunto: string;
  readonly texto: string;
}

export interface EnviadorDeEmail {
  enviar(mensagem: MensagemDeEmail): Promise<void>;
}
