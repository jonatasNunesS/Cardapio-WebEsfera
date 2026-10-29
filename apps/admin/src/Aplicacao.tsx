import { MesasDoRestaurante } from './telas/MesasDoRestaurante.tsx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Entrar } from './telas/Entrar.tsx';
import { Inicio } from './telas/Inicio.tsx';
import { PrimeiroAcesso } from './telas/PrimeiroAcesso.tsx';
import { SegundoFator } from './telas/SegundoFator.tsx';

function criarRotas() {
  return createBrowserRouter([
    { path: '/', Component: Inicio },
    { path: '/entrar', Component: Entrar },
    { path: '/mesas', Component: MesasDoRestaurante },
    { path: '/segundo-fator', Component: SegundoFator },
    { path: '/primeiro-acesso', Component: PrimeiroAcesso },
  ]);
}

export function Aplicacao() {
  const [consultas] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const [rotas] = useState(criarRotas);
  return (
    <QueryClientProvider client={consultas}>
      <RouterProvider router={rotas} />
    </QueryClientProvider>
  );
}
