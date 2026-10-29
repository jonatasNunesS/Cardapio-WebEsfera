import type { RespostaCardapioPublico } from '@cardapio/contratos';
import { Botao } from '@cardapio/ui';
import type { MesaLembrada } from '../dados/lembranca.ts';
import estilos from './Abertura.module.css';

export interface PropriedadesAbertura {
  readonly mesa: MesaLembrada;
  readonly cardapio: RespostaCardapioPublico;
  readonly aoContinuar: () => void;
}

export function Abertura({ mesa, cardapio, aoContinuar }: PropriedadesAbertura) {
  const { personalizacao, restaurante } = cardapio;
  return (
    <main className={estilos.abertura}>
      {personalizacao?.capaUrl != null && (
        <img className={estilos.capa} src={personalizacao.capaUrl} alt="" fetchPriority="high" />
      )}
      <div className={estilos.conteudo}>
        {personalizacao?.logoUrl != null && (
          <img className={estilos.logo} src={personalizacao.logoUrl} alt={`Logo de ${restaurante.nome}`} />
        )}
        <p className={estilos.restaurante}>{restaurante.nome}</p>
        {personalizacao !== null && personalizacao.frase !== '' && (
          <p className={estilos.frase}>{personalizacao.frase}</p>
        )}
        <h1 className={estilos.mesa}>Você está na Mesa {mesa.numero}</h1>
        {personalizacao !== null && personalizacao.textos.boasVindas !== '' && (
          <p className={estilos.texto}>{personalizacao.textos.boasVindas}</p>
        )}
        <p className={estilos.texto}>Sem app e sem cadastro.</p>
        <Botao larguraTotal onClick={aoContinuar}>
          Ver cardápio
        </Botao>
        <p className={estilos.nota}>Não é a sua mesa? Escaneie o QR Code da mesa em que você está.</p>
      </div>
    </main>
  );
}
