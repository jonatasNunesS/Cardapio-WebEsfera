import { ROTAS_DA_PLATAFORMA, type RespostaConviteGerado } from '@cardapio/contratos';
import { Aviso, Botao, CampoTexto } from '@cardapio/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { api } from '../api.ts';
import { CHAVE_DOS_RESTAURANTES } from './api-da-plataforma.ts';
import { LinkDoConvite } from './LinkDoConvite.tsx';
import estilos from './Plataforma.module.css';

const VAZIO = { nome: '', slug: '', emailDoDono: '' };

export function NovoRestaurante() {
  const consultas = useQueryClient();
  const [campos, setCampos] = useState(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const criar = (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    void api
      .pedir<RespostaConviteGerado>('POST', ROTAS_DA_PLATAFORMA.restaurantes, campos)
      .then((resposta) => {
        setErro(resposta.ok ? null : resposta.problema.detail);
        setLink(resposta.ok ? resposta.dados.linkDoConvite : null);
        if (resposta.ok) {
          setCampos(VAZIO);
          void consultas.invalidateQueries({ queryKey: CHAVE_DOS_RESTAURANTES });
        }
      });
  };
  const campo = (chave: keyof typeof VAZIO) => ({
    value: campos[chave],
    onChange: (evento: { target: { value: string } }) => {
      setCampos({ ...campos, [chave]: evento.target.value });
    },
  });
  return (
    <section aria-labelledby="titulo-novo" className={estilos.secao}>
      <h2 id="titulo-novo">Novo restaurante</h2>
      <form className={estilos.formulario} onSubmit={criar}>
        <CampoTexto rotulo="Nome do restaurante" required {...campo('nome')} />
        <CampoTexto rotulo="Endereço (slug)" dica="Por exemplo: brasa-centro." required {...campo('slug')} />
        <CampoTexto rotulo="E-mail do dono" type="email" required {...campo('emailDoDono')} />
        <Botao type="submit">Criar e gerar convite</Botao>
      </form>
      {erro === null ? null : <Aviso tipo="erro">{erro}</Aviso>}
      <LinkDoConvite link={link} />
    </section>
  );
}
