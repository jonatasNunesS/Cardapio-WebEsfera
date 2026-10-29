import { rotaCom, ROTAS_DAS_MESAS_NO_ADMIN, type RespostaMesasNoAdmin } from '@cardapio/contratos';
import type { RespostaDaApi } from '@cardapio/contratos/cliente';
import { Aviso, Botao, CampoTexto, Tabela } from '@cardapio/ui';
import { useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../api.ts';
import estilos from './Admin.module.css';

function Resultado({ resposta }: { readonly resposta: RespostaDaApi<RespostaMesasNoAdmin> }) {
  if (!resposta.ok) {
    return <Aviso tipo="erro">{resposta.problema.detail}</Aviso>;
  }
  const { nomeDoRestaurante, mesas } = resposta.dados;
  return (
    <Tabela
      legenda={`Mesas de ${nomeDoRestaurante} (somente leitura)`}
      linhas={mesas}
      chaveDaLinha={(mesa) => String(mesa.numero)}
      mensagemVazia="Este restaurante ainda não tem mesas."
      colunas={[
        { chave: 'numero', titulo: 'Número', numerica: true, celula: (mesa) => mesa.numero },
        { chave: 'nome', titulo: 'Nome', celula: (mesa) => mesa.nome ?? '' },
        { chave: 'area', titulo: 'Área', celula: (mesa) => mesa.area ?? '' },
        { chave: 'situacao', titulo: 'Situação', celula: (mesa) => (mesa.ativa ? 'Ativa' : 'Desativada') },
        {
          chave: 'link',
          titulo: 'Link',
          celula: (mesa) => <code className={estilos.link}>{mesa.link}</code>,
        },
      ]}
    />
  );
}

export function MesasDoRestaurante() {
  const [slug, setSlug] = useState('');
  const [resposta, setResposta] = useState<RespostaDaApi<RespostaMesasNoAdmin> | null>(null);
  const buscar = (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    void api
      .pedir<RespostaMesasNoAdmin>('GET', rotaCom(ROTAS_DAS_MESAS_NO_ADMIN.mesas, { slug: slug.trim() }))
      .then(setResposta);
  };
  return (
    <main className={estilos.pagina}>
      <Link to="/">Voltar</Link>
      <h1>Mesas de um restaurante</h1>
      <form className={estilos.formulario} onSubmit={buscar}>
        <CampoTexto
          rotulo="Endereço do restaurante (slug)"
          required
          value={slug}
          onChange={(evento) => {
            setSlug(evento.target.value);
          }}
        />
        <Botao type="submit">Ver mesas</Botao>
      </form>
      {resposta !== null && <Resultado resposta={resposta} />}
    </main>
  );
}
