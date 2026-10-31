import { createBrowserRouter, Navigate } from 'react-router';
import { TelaDoConvite } from './convite/TelaDoConvite.tsx';
import { TelaFila } from './fila/TelaFila.tsx';
import { Cardapio } from './telas/Cardapio.tsx';
import { CriarConta } from './telas/CriarConta.tsx';
import { CriarRestaurante } from './telas/CriarRestaurante.tsx';
import { Entrar } from './telas/Entrar.tsx';
import { EditarPrato } from './telas/EditarPrato.tsx';
import { EsqueciASenha } from './telas/EsqueciASenha.tsx';
import { ComRestaurante, SemRestaurante } from './telas/ExigeSessao.tsx';
import { Mesas } from './telas/Mesas.tsx';
import { Personalizacao } from './telas/Personalizacao.tsx';
import { Plano } from './telas/Plano.tsx';
import { RedefinirSenha } from './telas/RedefinirSenha.tsx';

export function criarRotas() {
  return createBrowserRouter([
    { path: '/', element: <Navigate to="/personalizacao" replace /> },
    { path: '/entrar', Component: Entrar },
    { path: '/criar-conta', Component: CriarConta },
    { path: '/esqueci-a-senha', Component: EsqueciASenha },
    { path: '/redefinir-senha', Component: RedefinirSenha },
    { path: '/convite', Component: TelaDoConvite },
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
      path: '/fila',
      element: <ComRestaurante>{() => <TelaFila />}</ComRestaurante>,
    },
    {
      path: '/mesas',
      element: <ComRestaurante>{() => <Mesas />}</ComRestaurante>,
    },
    {
      path: '/plano',
      element: <ComRestaurante>{() => <Plano />}</ComRestaurante>,
    },
    {
      path: '/personalizacao',
      element: <ComRestaurante>{() => <Personalizacao />}</ComRestaurante>,
    },
  ]);
}
