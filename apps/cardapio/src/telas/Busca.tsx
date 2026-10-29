import { rotaCom, ROTAS_DO_CARDAPIO_PUBLICO } from '@cardapio/contratos/publico';
import type { RespostaBuscaPublica, ResultadoDaBusca } from '@cardapio/contratos';
import { CampoTexto, CartaoPrato } from '@cardapio/ui';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useCaminho, useMesaPronta } from '../dados/contexto.ts';
import { propriedadesDoCartao } from '../dados/pratos.ts';
import estilos from './Busca.module.css';

type Resultado =
  | { readonly tipo: 'vazio' }
  | { readonly tipo: 'buscando' }
  | { readonly tipo: 'achados'; readonly termo: string; readonly pratos: readonly ResultadoDaBusca[] }
  | { readonly tipo: 'sem-conexao' };

const ESPERA_MS = 250;

interface Respondido {
  readonly termo: string;
  readonly resultado: Resultado;
}

function useBusca(slug: string, termo: string): Resultado {
  const limpo = termo.trim();
  const [respondido, setRespondido] = useState<Respondido>({ termo: '', resultado: { tipo: 'vazio' } });
  useEffect(() => {
    if (limpo === '') {
      return undefined;
    }
    const controle = new AbortController();
    const responder = (resultado: Resultado) => {
      setRespondido({ termo: limpo, resultado });
    };
    const espera = setTimeout(() => {
      const rota = rotaCom(ROTAS_DO_CARDAPIO_PUBLICO.busca, { slug });
      fetch(`${rota}?termo=${encodeURIComponent(limpo)}`, { signal: controle.signal }).then(
        async (resposta) => {
          if (!resposta.ok) {
            responder({ tipo: 'sem-conexao' });
            return;
          }
          const corpo = (await resposta.json()) as RespostaBuscaPublica;
          responder({ tipo: 'achados', termo: limpo, pratos: corpo.resultados });
        },
        () => {
          if (!controle.signal.aborted) {
            responder({ tipo: 'sem-conexao' });
          }
        },
      );
    }, ESPERA_MS);
    return () => {
      clearTimeout(espera);
      controle.abort();
    };
  }, [slug, limpo]);
  if (limpo === '') {
    return { tipo: 'vazio' };
  }
  return respondido.termo === limpo ? respondido.resultado : { tipo: 'buscando' };
}

function Resultados({ resultado }: { readonly resultado: Resultado }) {
  const caminho = useCaminho();
  switch (resultado.tipo) {
    case 'vazio':
      return null;
    case 'buscando':
      return <p className={estilos.estado}>Buscando...</p>;
    case 'sem-conexao':
      return <p className={estilos.estado}>Sem conexão para buscar agora. O cardápio continua disponível.</p>;
    case 'achados':
      return resultado.pratos.length === 0 ? (
        <div className={estilos.estado}>
          <p className={estilos.tituloVazio}>Nada encontrado para “{resultado.termo}”</p>
          <p>Tente outro nome ou um ingrediente.</p>
          <Link to={caminho()}>Ver todas as categorias</Link>
        </div>
      ) : (
        <>
          <p className={estilos.estado} aria-live="polite">
            {resultado.pratos.length === 1
              ? '1 prato encontrado'
              : `${String(resultado.pratos.length)} pratos encontrados`}
          </p>
          <ul className={estilos.lista} aria-label="Resultados da busca">
            {resultado.pratos.map((prato) => (
              <li key={prato.id}>
                <CartaoPrato
                  {...propriedadesDoCartao(prato, caminho(`/prato/${prato.id}`))}
                  nivelTitulo={2}
                />
              </li>
            ))}
          </ul>
        </>
      );
  }
}

export function Busca() {
  const { cardapio } = useMesaPronta();
  const caminho = useCaminho();
  const [termo, setTermo] = useState('');
  const resultado = useBusca(cardapio.restaurante.slug, termo);
  return (
    <main className={estilos.busca}>
      <Link to={caminho()}>Voltar ao cardápio</Link>
      <h1 className={estilos.titulo}>Buscar no cardápio</h1>
      <search>
        <CampoTexto
          rotulo="Buscar prato ou ingrediente"
          type="search"
          maxLength={60}
          value={termo}
          onChange={(evento) => {
            setTermo(evento.target.value);
          }}
        />
      </search>
      <Resultados resultado={resultado} />
    </main>
  );
}
