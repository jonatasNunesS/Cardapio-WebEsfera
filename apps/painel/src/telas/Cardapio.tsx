import {
  formatarPreco,
  rotaCom,
  ROTAS_DO_CARDAPIO_NO_PAINEL as ROTAS,
  type CategoriaNoPainel,
  type PratoNoPainel,
} from '@cardapio/contratos';
import { Botao, BotaoIcone, Caixa, CampoTexto, Esqueleto, SeloSituacao } from '@cardapio/ui';
import { useState, type DragEvent, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { useAcaoNoCardapio, useCardapio } from '../cardapio.ts';
import estilos from './Cardapio.module.css';
import painel from './Painel.module.css';

type Acao = ReturnType<typeof useAcaoNoCardapio>;

function NovaCategoria({ acao }: { readonly acao: Acao }) {
  const [nome, setNome] = useState('');
  const criar = (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    void acao('POST', ROTAS.categorias, { nome }, 'Categoria criada.').then((ok) => {
      if (ok) {
        setNome('');
      }
    });
  };
  return (
    <form className={estilos.novaCategoria} onSubmit={criar}>
      <CampoTexto
        rotulo="Nova categoria"
        dica="Por exemplo: Entradas, Principais, Bebidas."
        value={nome}
        onChange={(evento) => {
          setNome(evento.target.value);
        }}
      />
      <Botao type="submit">Adicionar categoria</Botao>
    </form>
  );
}

function ChaveOtimista({
  rotulo,
  doServidor,
  salvar,
}: {
  readonly rotulo: string;
  readonly doServidor: boolean;
  readonly salvar: (marcada: boolean) => Promise<boolean>;
}) {
  const [estado, setEstado] = useState({ base: doServidor, valor: doServidor });
  if (estado.base !== doServidor) {
    setEstado({ base: doServidor, valor: doServidor });
  }
  return (
    <Caixa
      rotulo={rotulo}
      checked={estado.base === doServidor ? estado.valor : doServidor}
      onChange={(evento) => {
        const marcada = evento.target.checked;
        setEstado({ base: doServidor, valor: marcada });
        void salvar(marcada).then((ok) => {
          if (!ok) {
            setEstado({ base: doServidor, valor: doServidor });
          }
        });
      }}
    />
  );
}

function LinhaDoPrato({
  prato,
  posicao,
  total,
  acao,
  arraste,
}: {
  readonly prato: PratoNoPainel;
  readonly posicao: number;
  readonly total: number;
  readonly acao: Acao;
  readonly arraste: Arraste;
}) {
  const mover = (destino: number) =>
    void acao('PUT', rotaCom(ROTAS.posicaoDoPrato, { id: prato.id }), {
      versao: prato.versao,
      posicao: destino,
    });
  const alterar = (campo: 'disponivel' | 'destaque', valor: boolean) =>
    acao('PATCH', rotaCom(ROTAS.situacaoDoPrato, { id: prato.id }), {
      versao: prato.versao,
      [campo]: valor,
    });
  return (
    <li
      className={[estilos.prato, arraste.arrastado === prato.id ? estilos.pratoArrastado : undefined]
        .filter(Boolean)
        .join(' ')}
      draggable
      onDragStart={() => {
        arraste.comecar(prato.id);
      }}
      onDragOver={(evento: DragEvent) => {
        evento.preventDefault();
      }}
      onDrop={(evento: DragEvent) => {
        evento.preventDefault();
        arraste.soltar(posicao);
      }}
    >
      <div>
        <div className={estilos.nomeDoPrato}>
          <h3 className={estilos.tituloDoPrato}>{prato.nome}</h3>
          {!prato.disponivel && <SeloSituacao situacao="esgotado" />}
          {prato.destaque && <SeloSituacao situacao="destaque" />}
        </div>
        <p className={estilos.preco}>{formatarPreco(prato.precoCentavos)}</p>
      </div>
      <div className={estilos.acoes}>
        <BotaoIcone
          icone="subir"
          rotulo={`Subir ${prato.nome}`}
          disabled={posicao === 0}
          onClick={() => {
            mover(posicao - 1);
          }}
        />
        <BotaoIcone
          icone="descer"
          rotulo={`Descer ${prato.nome}`}
          disabled={posicao === total - 1}
          onClick={() => {
            mover(posicao + 1);
          }}
        />
        <Link to={`/cardapio/pratos/${prato.id}`}>
          Editar<span className={estilos.somenteLeitor}> {prato.nome}</span>
        </Link>
        <BotaoIcone
          icone="excluir"
          rotulo={`Remover ${prato.nome}`}
          onClick={() =>
            void acao(
              'DELETE',
              rotaCom(ROTAS.prato, { id: prato.id }),
              { versao: prato.versao },
              'Prato removido.',
            )
          }
        />
      </div>
      <div className={estilos.chaves}>
        <ChaveOtimista
          rotulo={`Esgotado: ${prato.nome}`}
          doServidor={!prato.disponivel}
          salvar={(marcada) => alterar('disponivel', !marcada)}
        />
        <ChaveOtimista
          rotulo={`Destaque: ${prato.nome}`}
          doServidor={prato.destaque}
          salvar={(marcada) => alterar('destaque', marcada)}
        />
      </div>
    </li>
  );
}

interface Arraste {
  readonly arrastado: string | null;
  comecar(id: string): void;
  soltar(posicao: number): void;
}

function useArraste(pratos: readonly PratoNoPainel[], acao: Acao): Arraste {
  const [arrastado, setArrastado] = useState<string | null>(null);
  return {
    arrastado,
    comecar: setArrastado,
    soltar(posicao) {
      const prato = pratos.find((item) => item.id === arrastado);
      setArrastado(null);
      if (prato !== undefined) {
        void acao('PUT', rotaCom(ROTAS.posicaoDoPrato, { id: prato.id }), { versao: prato.versao, posicao });
      }
    },
  };
}

function SecaoDaCategoria({
  categoria,
  posicao,
  total,
  acao,
}: {
  readonly categoria: CategoriaNoPainel;
  readonly posicao: number;
  readonly total: number;
  readonly acao: Acao;
}) {
  const arraste = useArraste(categoria.pratos, acao);
  const idDoTitulo = `categoria-${categoria.id}`;
  const mover = (destino: number) =>
    void acao('PUT', rotaCom(ROTAS.posicaoDaCategoria, { id: categoria.id }), {
      versao: categoria.versao,
      posicao: destino,
    });
  return (
    <section className={estilos.secao} aria-labelledby={idDoTitulo}>
      <div className={estilos.topoDaSecao}>
        <h2 id={idDoTitulo} className={estilos.nomeDaSecao}>
          {categoria.nome}
        </h2>
        <div className={estilos.acoes}>
          <BotaoIcone
            icone="subir"
            rotulo={`Subir categoria ${categoria.nome}`}
            disabled={posicao === 0}
            onClick={() => {
              mover(posicao - 1);
            }}
          />
          <BotaoIcone
            icone="descer"
            rotulo={`Descer categoria ${categoria.nome}`}
            disabled={posicao === total - 1}
            onClick={() => {
              mover(posicao + 1);
            }}
          />
          <BotaoIcone
            icone="excluir"
            rotulo={`Remover categoria ${categoria.nome}`}
            onClick={() =>
              void acao(
                'DELETE',
                rotaCom(ROTAS.categoria, { id: categoria.id }),
                { versao: categoria.versao },
                'Categoria removida.',
              )
            }
          />
          <Link to={`/cardapio/pratos/novo?categoria=${categoria.id}`}>
            Novo prato<span className={estilos.somenteLeitor}> em {categoria.nome}</span>
          </Link>
        </div>
      </div>
      {categoria.pratos.length === 0 ? (
        <p className={estilos.vazio}>Nenhum prato nesta categoria ainda.</p>
      ) : (
        <ol className={estilos.lista} aria-label={`Pratos de ${categoria.nome}`}>
          {categoria.pratos.map((prato, indice) => (
            <LinhaDoPrato
              key={prato.id}
              prato={prato}
              posicao={indice}
              total={categoria.pratos.length}
              acao={acao}
              arraste={arraste}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

export function Cardapio() {
  const consulta = useCardapio();
  const acao = useAcaoNoCardapio();
  const categorias = consulta.data?.ok === true ? consulta.data.dados.categorias : null;
  return (
    <main className={painel.conteudo}>
      <h1 className={painel.titulo}>Cardápio</h1>
      <NovaCategoria acao={acao} />
      {categorias === null ? (
        <Esqueleto rotulo="Carregando o cardápio" />
      ) : categorias.length === 0 ? (
        <p className={estilos.vazio}>Comece criando uma categoria.</p>
      ) : (
        categorias.map((categoria, indice) => (
          <SecaoDaCategoria
            key={categoria.id}
            categoria={categoria}
            posicao={indice}
            total={categorias.length}
            acao={acao}
          />
        ))
      )}
    </main>
  );
}
