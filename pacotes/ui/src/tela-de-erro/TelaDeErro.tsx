import estilos from './TelaDeErro.module.css';

export interface PropriedadesTelaDeErro {
  readonly idRastreio: string;
  readonly aoTentarDeNovo: () => void;
}

export function TelaDeErro({ idRastreio, aoTentarDeNovo }: PropriedadesTelaDeErro) {
  return (
    <main className={estilos.tela}>
      <section role="alert" aria-labelledby="titulo-tela-de-erro" className={estilos.caixa}>
        <h1 id="titulo-tela-de-erro" className={estilos.titulo}>
          Algo deu errado
        </h1>
        <p className={estilos.texto}>Já fomos avisados. Tente de novo.</p>
        <p className={estilos.rastreio}>
          Código de rastreio: <code>{idRastreio}</code>
        </p>
        <button type="button" className={estilos.botao} onClick={aoTentarDeNovo}>
          Tentar de novo
        </button>
      </section>
    </main>
  );
}
