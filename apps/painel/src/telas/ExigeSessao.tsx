import { ROTAS_DO_PAINEL, type RestauranteDaSessao } from '@cardapio/contratos';
import { Botao, Esqueleto } from '@cardapio/ui';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { api, CHAVE_DA_SESSAO, useSessao } from '../api.ts';
import estilos from './Painel.module.css';

function BotaoSair() {
  const navegar = useNavigate();
  const consultas = useQueryClient();
  const sair = () => {
    void api.pedir('DELETE', ROTAS_DO_PAINEL.sessao).then(() => {
      consultas.removeQueries({ queryKey: CHAVE_DA_SESSAO });
      void navegar('/entrar');
    });
  };
  return (
    <Botao variante="texto" onClick={sair}>
      Sair
    </Botao>
  );
}

export function SemRestaurante({ children }: { readonly children: ReactNode }) {
  const sessao = useSessao();
  if (sessao.data === undefined) {
    return <Esqueleto rotulo="Carregando o painel" />;
  }
  if (!sessao.data.ok) {
    return <Navigate to="/entrar" replace />;
  }
  return sessao.data.dados.restaurante === null ? children : <Navigate to="/personalizacao" replace />;
}

export function ComRestaurante({
  children,
}: {
  readonly children: (restaurante: RestauranteDaSessao) => ReactNode;
}) {
  const sessao = useSessao();
  if (sessao.data === undefined) {
    return <Esqueleto rotulo="Carregando o painel" />;
  }
  if (!sessao.data.ok) {
    return <Navigate to="/entrar" replace />;
  }
  const { restaurante } = sessao.data.dados;
  if (restaurante === null) {
    return <Navigate to="/criar-restaurante" replace />;
  }
  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecalho}>
        <p className={estilos.restaurante}>{restaurante.nome}</p>
        <nav aria-label="Seções do painel" className={estilos.navegacao}>
          <Link to="/cardapio">Cardápio</Link>
          <Link to="/mesas">Mesas e QR Codes</Link>
          <Link to="/personalizacao">Personalização</Link>
        </nav>
        <BotaoSair />
      </header>
      {children(restaurante)}
    </div>
  );
}
