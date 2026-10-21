import { useId, type ReactNode } from 'react';
import { juntarClasses } from '../../utilitarios/classes.ts';
import { Esqueleto } from '../esqueleto/Esqueleto.tsx';
import estilos from './Tabela.module.css';

export interface ColunaTabela<Linha> {
  readonly chave: string;
  readonly titulo: string;
  readonly celula: (linha: Linha) => ReactNode;
  readonly numerica?: boolean | undefined;
}

export interface PropriedadesTabela<Linha> {
  readonly legenda: string;
  readonly colunas: readonly ColunaTabela<Linha>[];
  readonly linhas: readonly Linha[];
  readonly chaveDaLinha: (linha: Linha) => string;
  readonly carregando?: boolean | undefined;
  readonly mensagemVazia?: string | undefined;
}

function Corpo<Linha>({
  colunas,
  linhas,
  chaveDaLinha,
  carregando,
  mensagemVazia,
  legenda,
}: PropriedadesTabela<Linha>) {
  if (carregando === true || linhas.length === 0) {
    return (
      <tr>
        <td colSpan={colunas.length} className={estilos.mensagem}>
          {carregando === true ? (
            <Esqueleto rotulo={`Carregando ${legenda.toLowerCase()}`} linhas={3} />
          ) : (
            mensagemVazia
          )}
        </td>
      </tr>
    );
  }
  return linhas.map((linha) => (
    <tr key={chaveDaLinha(linha)}>
      {colunas.map((coluna, indice) =>
        indice === 0 ? (
          <th key={coluna.chave} scope="row" className={estilos.celula}>
            {coluna.celula(linha)}
          </th>
        ) : (
          <td
            key={coluna.chave}
            className={juntarClasses(estilos.celula, coluna.numerica === true && estilos.numerica)}
          >
            {coluna.celula(linha)}
          </td>
        ),
      )}
    </tr>
  ));
}

export function Tabela<Linha>(propriedades: PropriedadesTabela<Linha>) {
  const { legenda, colunas, carregando = false, mensagemVazia = 'Nada por aqui ainda.' } = propriedades;
  const legendaId = useId();
  return (
    <div className={estilos.rolagem} role="region" aria-labelledby={legendaId} tabIndex={0}>
      <table className={estilos.tabela} aria-busy={carregando || undefined}>
        <caption id={legendaId} className={estilos.legenda}>
          {legenda}
        </caption>
        <thead>
          <tr>
            {colunas.map((coluna) => (
              <th
                key={coluna.chave}
                scope="col"
                className={juntarClasses(estilos.cabecalho, coluna.numerica === true && estilos.numerica)}
              >
                {coluna.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <Corpo {...propriedades} carregando={carregando} mensagemVazia={mensagemVazia} />
        </tbody>
      </table>
    </div>
  );
}
