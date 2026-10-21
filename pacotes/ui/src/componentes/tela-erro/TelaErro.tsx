import { useId } from 'react';
import { Botao } from '../botao/Botao.tsx';
import { Icone } from '../icone/Icone.tsx';
import estilos from './TelaErro.module.css';

export interface PropriedadesTelaErro {
  readonly idRastreio: string;
  readonly aoTentarDeNovo: () => void;
}

export function TelaErro({ idRastreio, aoTentarDeNovo }: PropriedadesTelaErro) {
  const tituloId = useId();
  return (
    <main className={estilos.tela}>
      <section role="alert" aria-labelledby={tituloId} className={estilos.caixa}>
        <Icone nome="erro" tamanho={24} className={estilos.icone} />
        <h1 id={tituloId} className={estilos.titulo}>
          Algo deu errado
        </h1>
        <p className={estilos.texto}>Já fomos avisados. Tente de novo.</p>
        <p className={estilos.rastreio}>
          Código de rastreio: <code>{idRastreio}</code>
        </p>
        <Botao icone="tentarDeNovo" larguraTotal onClick={aoTentarDeNovo}>
          Tentar de novo
        </Botao>
      </section>
    </main>
  );
}
