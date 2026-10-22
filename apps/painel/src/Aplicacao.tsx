import { ProvedorDeToast } from '@cardapio/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router';
import { criarRotas } from './rotas.tsx';

export function Aplicacao() {
  const [consultas] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const [rotas] = useState(criarRotas);
  return (
    <QueryClientProvider client={consultas}>
      <ProvedorDeToast>
        <RouterProvider router={rotas} />
      </ProvedorDeToast>
    </QueryClientProvider>
  );
}
