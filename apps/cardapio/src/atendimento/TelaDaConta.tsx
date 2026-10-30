import type { RespostaConta } from '@cardapio/contratos/publico';
import { Aviso, Caixa, formatarReais, LinkBotao, SeletorQuantidade } from '@cardapio/ui';
import { useEffect, useState } from 'react';
import { useCaminho, useMesaPronta } from '../dados/contexto.ts';
import { carrinhoDa } from '../pedido/usar-carrinho.ts';
import { lerConta, type Lido } from './api.ts';
import estilos from './Atendimento.module.css';

export function TelaDaConta() {
  const { mesa } = useMesaPronta();
  const caminho = useCaminho();
  const pedidosFeitos = carrinhoDa(mesa.slug, mesa.numero).ler().pedidos.length;
  const [conta, setConta] = useState<Lido<RespostaConta> | null>(null);
  const [comTaxa, setComTaxa] = useState(true);
  const [pessoas, setPessoas] = useState(1);
  useEffect(() => {
    void lerConta().then(setConta);
  }, [pedidosFeitos]);
  if (conta === null) {
    return (
      <main className={estilos.tela} aria-busy="true">
        <p>Carregando a conta...</p>
      </main>
    );
  }
  if (!conta.ok) {
    return (
      <main className={estilos.tela}>
        <h1 className={estilos.titulo}>Conta da Mesa {mesa.numero}</h1>
        <Aviso tipo="aviso">
          {conta.problema?.detail ?? 'Sem conexão. Abra a conta de novo em instantes.'}
        </Aviso>
        <LinkBotao variante="secundario" href={caminho()}>
          Voltar ao cardápio
        </LinkBotao>
      </main>
    );
  }
  const valores = conta.dados;
  const total = comTaxa ? valores.totalComTaxaCentavos : valores.totalSemTaxaCentavos;
  const porPessoa = (comTaxa ? valores.porPessoa.comTaxa : valores.porPessoa.semTaxa)[pessoas - 1] ?? total;
  return (
    <main className={estilos.tela}>
      <h1 className={estilos.titulo}>Conta da Mesa {mesa.numero}</h1>
      {valores.itens.length === 0 ? (
        <p>Nenhum pedido ainda nesta mesa.</p>
      ) : (
        <ul className={estilos.linhas}>
          {valores.itens.map((item, indice) => (
            <li key={`${item.nome}-${String(indice)}`} className={estilos.linha}>
              <span>
                {item.quantidade} × {item.nome}
              </span>
              <span>{formatarReais(item.precoCentavos * item.quantidade)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className={estilos.linha}>
        <span>Subtotal</span>
        <span>{formatarReais(valores.subtotalCentavos)}</span>
      </p>
      <Caixa
        rotulo="Taxa de serviço (10%, opcional)"
        checked={comTaxa}
        onChange={(evento) => {
          setComTaxa(evento.target.checked);
        }}
      />
      <p className={estilos.linha}>
        <span>Taxa de serviço</span>
        <span>{formatarReais(comTaxa ? valores.taxaCentavos : 0)}</span>
      </p>
      <p className={estilos.total}>
        <span>Total</span>
        <span>{formatarReais(total)}</span>
      </p>
      <section className={estilos.opcoes} aria-label="Dividir a conta">
        <SeletorQuantidade
          nomeDoItem="pessoas na divisão"
          valor={pessoas}
          minimo={1}
          maximo={20}
          aoMudar={setPessoas}
        />
        <p aria-live="polite">
          {pessoas === 1 ? '1 pessoa' : `${String(pessoas)} pessoas`}: {formatarReais(porPessoa)} por pessoa
          {pessoas > 1 && ` (arredondado para cima; total exato ${formatarReais(total)})`}
        </p>
      </section>
      <p className={estilos.nota}>Pagamento com o garçom: Pix, cartão ou dinheiro.</p>
      <LinkBotao href={caminho('/atendimento')}>Chamar garçom ou pedir a conta</LinkBotao>
      <LinkBotao variante="texto" href={caminho()}>
        Pedir mais alguma coisa
      </LinkBotao>
    </main>
  );
}
