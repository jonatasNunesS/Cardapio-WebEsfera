import { ROTAS_DO_ADMIN } from '@cardapio/contratos';
import { Botao, Esqueleto, PaginaDeAcesso } from '@cardapio/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router';
import { api, MARCA } from '../api.ts';

const CHAVE = ['sessao-admin'] as const;

export function Inicio() {
  const sessao = useQuery({ queryKey: CHAVE, queryFn: () => api.pedir('GET', ROTAS_DO_ADMIN.sessao) });
  const navegar = useNavigate();
  const consultas = useQueryClient();
  if (sessao.data === undefined) {
    return <Esqueleto rotulo="Carregando" />;
  }
  if (!sessao.data.ok) {
    return <Navigate to="/entrar" replace />;
  }
  const sair = () => {
    void api.pedir('DELETE', ROTAS_DO_ADMIN.sessao).then(() => {
      consultas.removeQueries({ queryKey: CHAVE });
      void navegar('/entrar');
    });
  };
  return (
    <PaginaDeAcesso marca={MARCA} titulo="Sessão ativa" descricao="Você entrou com senha e segundo fator.">
      <Botao variante="secundario" onClick={sair}>
        Sair
      </Botao>
    </PaginaDeAcesso>
  );
}
