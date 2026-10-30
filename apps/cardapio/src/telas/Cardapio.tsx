import type { PratoPublico } from '@cardapio/contratos';
import { Aviso, CartaoPrato, ChipCategoria } from '@cardapio/ui';
import { useState } from 'react';
import { useCaminho, useMesaPronta } from '../dados/contexto.ts';
import { propriedadesDoCartao, textoDaAbertura } from '../dados/pratos.ts';
import { Cabecalho } from './Cabecalho.tsx';
import estilos from './Cardapio.module.css';

function Fechado() {
  const { cardapio } = useMesaPronta();
  const texto = cardapio.personalizacao?.textos.restauranteFechado ?? '';
  const abertura = textoDaAbertura(cardapio.proximaAbertura);
  return (
    <Aviso tipo="informacao">
      {[
        texto === '' ? 'Estamos fechados agora.' : texto,
        abertura,
        'Você pode olhar o cardápio; os pedidos abrem com a cozinha.',
      ]
        .filter(Boolean)
        .join(' ')}
    </Aviso>
  );
}

function ListaDePratos({
  pratos,
  rotulo,
}: {
  readonly pratos: readonly PratoPublico[];
  readonly rotulo: string;
}) {
  const caminho = useCaminho();
  return (
    <ul className={estilos.lista} aria-label={rotulo}>
      {pratos.map((prato) => (
        <li key={prato.id}>
          <CartaoPrato {...propriedadesDoCartao(prato, caminho(`/prato/${prato.id}`))} />
        </li>
      ))}
    </ul>
  );
}

export function Cardapio() {
  const { cardapio } = useMesaPronta();
  const caminho = useCaminho();
  const [categoria, setCategoria] = useState(cardapio.secoes[0]?.id ?? '');
  const pratos = cardapio.secoes.flatMap((secao) => secao.pratos);
  const destaques = cardapio.destaques
    .map((id) => pratos.find((prato) => prato.id === id))
    .filter((prato): prato is PratoPublico => prato !== undefined);
  return (
    <>
      <Cabecalho />
      <main className={estilos.conteudo}>
        <h1 className={estilos.somenteLeitor}>Cardápio de {cardapio.restaurante.nome}</h1>
        {!cardapio.aberto && <Fechado />}
        {cardapio.secoes.length > 1 && (
          <ChipCategoria
            rotulo="Categorias"
            categorias={cardapio.secoes.map(({ id, nome }) => ({ id, nome }))}
            selecionada={categoria}
            aoEscolher={(id) => {
              setCategoria(id);
              document.getElementById(`secao-${id}`)?.scrollIntoView({ block: 'start' });
            }}
          />
        )}
        {destaques.map((prato) => (
          <CartaoPrato
            key={prato.id}
            {...propriedadesDoCartao(prato, caminho(`/prato/${prato.id}`))}
            destaque
            nivelTitulo={2}
          />
        ))}
        {cardapio.secoes.map((secao) => (
          <section
            key={secao.id}
            id={`secao-${secao.id}`}
            className={estilos.secao}
            aria-labelledby={`titulo-${secao.id}`}
          >
            <h2 id={`titulo-${secao.id}`} className={estilos.tituloDaSecao}>
              {secao.nome}
            </h2>
            <ListaDePratos pratos={secao.pratos} rotulo={`Pratos de ${secao.nome}`} />
          </section>
        ))}
        {cardapio.secoes.length === 0 && (
          <p className={estilos.vazio}>O cardápio ainda está sendo montado.</p>
        )}
      </main>
    </>
  );
}
