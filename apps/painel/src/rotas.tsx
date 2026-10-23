import { createBrowserRouter, Navigate } from 'react-router';
import { Cardapio } from './telas/Cardapio.tsx';
import { CriarConta } from './telas/CriarConta.tsx';
import { CriarRestaurante } from './telas/CriarRestaurante.tsx';
import { Entrar } from './telas/Entrar.tsx';
import { EditarPrato } from './telas/EditarPrato.tsx';
import { EsqueciASenha } from './telas/EsqueciASenha.tsx';
import { ComRestaurante, SemRestaurante } from './telas/ExigeSessao.tsx';
import { Personalizacao } from './telas/Personalizacao.tsx';
import { RedefinirSenha } from './telas/RedefinirSenha.tsx';

export function criarRotas() {
  return createBrowserRouter([
    { path: '/', element: <Navigate to="/personalizacao" replace /> },
    { path: '/entrar', Component: Entrar },
    { path: '/criar-conta', Component: CriarConta },
    { path: '/esqueci-a-senha', Component: EsqueciASenha },
    { path: '/redefinir-senha', Component: RedefinirSenha },
    {
      path: '/criar-restaurante',
      element: (
        <SemRestaurante>
          <CriarRestaurante />
        </SemRestaurante>
      ),
    },
    {
      path: '/cardapio',
      element: <ComRestaurante>{() => <Cardapio />}</ComRestaurante>,
    },
    {
      path: '/cardapio/pratos/:id',
      element: <ComRestaurante>{() => <EditarPrato />}</ComRestaurante>,
    },
    {
      path: '/personalizacao',
      element: <ComRestaurante>{() => <Personalizacao />}</ComRestaurante>,
    },
  ]);
}
