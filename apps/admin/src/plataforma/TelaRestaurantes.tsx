import { Esqueleto, Tabela } from '@cardapio/ui';
import { Link, Navigate } from 'react-router';
import { NOMES_DAS_SITUACOES, useRestaurantes, useVisaoGeral } from './api-da-plataforma.ts';
import { NovoRestaurante } from './NovoRestaurante.tsx';
import estilos from './Plataforma.module.css';

function VisaoGeral() {
  const consulta = useVisaoGeral();
  if (consulta.data?.ok !== true) {
    return <Esqueleto rotulo="Carregando a visão geral" />;
  }
  const { porSituacao, pedidosUltimas24h, linkDoSentry } = consulta.data.dados;
  return (
    <section aria-labelledby="titulo-visao" className={estilos.secao}>
      <h2 id="titulo-visao">Visão geral</h2>
      <dl className={estilos.indicadores}>
        {Object.entries(NOMES_DAS_SITUACOES).map(([chave, nome]) => (
          <div key={chave}>
            <dt>{nome}</dt>
            <dd>{porSituacao[chave] ?? 0}</dd>
          </div>
        ))}
        <div>
          <dt>Pedidos nas últimas 24 h</dt>
          <dd>{pedidosUltimas24h}</dd>
        </div>
      </dl>
      {linkDoSentry === null ? null : <a href={linkDoSentry}>Abrir o Sentry</a>}
    </section>
  );
}

export function TelaRestaurantes() {
  const consulta = useRestaurantes();
  if (consulta.data?.ok === false) {
    return <Navigate to="/entrar" replace />;
  }
  return (
    <main className={estilos.pagina}>
      <Link to="/">Voltar</Link>
      <h1>Restaurantes</h1>
      <VisaoGeral />
      <NovoRestaurante />
      {consulta.data === undefined ? (
        <Esqueleto rotulo="Carregando os restaurantes" />
      ) : (
        <Tabela
          legenda="Restaurantes da plataforma"
          linhas={consulta.data.dados.restaurantes}
          chaveDaLinha={(restaurante) => restaurante.slug}
          mensagemVazia="Nenhum restaurante ainda."
          colunas={[
            {
              chave: 'nome',
              titulo: 'Nome',
              celula: (restaurante) => (
                <Link to={`/restaurantes/${restaurante.slug}`}>{restaurante.nome}</Link>
              ),
            },
            { chave: 'slug', titulo: 'Endereço', celula: (restaurante) => restaurante.slug },
            {
              chave: 'situacao',
              titulo: 'Situação',
              celula: (restaurante) => NOMES_DAS_SITUACOES[restaurante.situacao] ?? restaurante.situacao,
            },
            {
              chave: 'teste',
              titulo: 'Dias de teste',
              numerica: true,
              celula: (restaurante) => restaurante.diasDeTeste ?? '',
            },
          ]}
        />
      )}
    </main>
  );
}
