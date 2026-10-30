import { LinkBotao } from '@cardapio/ui';
import { useMesaPronta } from '../dados/contexto.ts';
import estilos from './Atendimento.module.css';

export function TelaDeAgradecimento() {
  const { mesa, cardapio } = useMesaPronta();
  const google = cardapio.personalizacao?.linkAvaliacaoGoogle ?? null;
  const instagram = cardapio.personalizacao?.linkInstagram ?? null;
  return (
    <main className={estilos.tela}>
      <h1 className={estilos.titulo}>Obrigado pela visita!</h1>
      <p className={estilos.subtitulo}>
        A conta da Mesa {mesa.numero} foi encerrada. Esperamos ver você de novo no {cardapio.restaurante.nome}
        .
      </p>
      {google !== null && (
        <>
          <p>Conte como foi. Sua avaliação ajuda outras pessoas a nos encontrar.</p>
          <LinkBotao href={google} target="_blank" rel="noopener">
            Avaliar no Google
          </LinkBotao>
        </>
      )}
      {instagram !== null && (
        <LinkBotao variante="secundario" href={instagram} target="_blank" rel="noopener">
          Seguir no Instagram
        </LinkBotao>
      )}
      <p className={estilos.nota}>Para pedir de novo, escaneie o QR Code da mesa.</p>
    </main>
  );
}
