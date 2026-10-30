import { createBrowserRouter } from 'react-router';
import { carregarTelasDoAtendimento } from './atendimento/sob-demanda.ts';
import { carregarTelasDoPedido } from './pedido/sob-demanda.ts';
import { carregarRotaDaMesa, revalidarMesa } from './dados/rota-da-mesa.ts';
import { Busca } from './telas/Busca.tsx';
import { Cardapio } from './telas/Cardapio.tsx';
import { Carregando, ErroDaRota } from './telas/Estados.tsx';
import { Mesa } from './telas/Mesa.tsx';
import { Prato } from './telas/Prato.tsx';
import { TelaNeutra } from './telas/TelaNeutra.tsx';

export function criarRotas() {
  return createBrowserRouter([
    {
      path: '/:slug/mesa/:numero',
      loader: carregarRotaDaMesa,
      shouldRevalidate: revalidarMesa,
      Component: Mesa,
      HydrateFallback: Carregando,
      ErrorBoundary: ErroDaRota,
      children: [
        { index: true, Component: Cardapio },
        { path: 'prato/:pratoId', Component: Prato },
        { path: 'busca', Component: Busca },
        {
          path: 'carrinho',
          lazy: async () => ({ Component: (await carregarTelasDoPedido()).TelaDoCarrinho }),
        },
        {
          path: 'atendimento',
          lazy: async () => ({ Component: (await carregarTelasDoAtendimento()).TelaDoAtendimento }),
        },
        {
          path: 'conta',
          lazy: async () => ({ Component: (await carregarTelasDoAtendimento()).TelaDaConta }),
        },
        {
          path: 'obrigado',
          lazy: async () => ({ Component: (await carregarTelasDoAtendimento()).TelaDeAgradecimento }),
        },
        {
          path: 'pedido/:pedidoId',
          lazy: async () => ({ Component: (await carregarTelasDoPedido()).TelaDoPedido }),
        },
      ],
    },
    { path: '*', element: <TelaNeutra motivo="qr-invalido" />, ErrorBoundary: ErroDaRota },
  ]);
}
