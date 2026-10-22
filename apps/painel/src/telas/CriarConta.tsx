import { ROTAS_DO_PAINEL } from '@cardapio/contratos';
import { Aviso, Botao, CampoTexto, PaginaDeAcesso, useEnvioDeFormulario } from '@cardapio/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, CHAVE_DA_SESSAO } from '../api.ts';
import { MARCA } from './Marca.ts';
import estilos from './Painel.module.css';

export function CriarConta() {
  const [dados, setDados] = useState({ nome: '', email: '', senha: '' });
  const navegar = useNavigate();
  const consultas = useQueryClient();
  const envio = useEnvioDeFormulario(
    () => api.pedir('POST', ROTAS_DO_PAINEL.contas, dados),
    () => {
      void consultas.invalidateQueries({ queryKey: CHAVE_DA_SESSAO });
      void navegar('/criar-restaurante');
    },
  );
  const mudar = (campo: keyof typeof dados) => (evento: { target: { value: string } }) => {
    setDados((atuais) => ({ ...atuais, [campo]: evento.target.value }));
  };
  return (
    <PaginaDeAcesso
      marca={MARCA}
      titulo="Criar conta"
      descricao="Teste grátis por 10 dias, sem cartão."
      rodape={<Link to="/entrar">Já tenho conta</Link>}
    >
      <form noValidate onSubmit={envio.aoEnviar} className={estilos.formulario}>
        {envio.erros.geral !== undefined && <Aviso tipo="erro">{envio.erros.geral}</Aviso>}
        <CampoTexto
          id={envio.idDoCampo('nome')}
          rotulo="Seu nome"
          autoComplete="name"
          value={dados.nome}
          onChange={mudar('nome')}
          erro={envio.erroDe('nome')}
        />
        <CampoTexto
          id={envio.idDoCampo('email')}
          rotulo="E-mail"
          type="email"
          autoComplete="email"
          value={dados.email}
          onChange={mudar('email')}
          erro={envio.erroDe('email')}
        />
        <CampoTexto
          id={envio.idDoCampo('senha')}
          rotulo="Senha"
          type="password"
          autoComplete="new-password"
          dica="Pelo menos 10 caracteres. Uma frase curta é fácil de lembrar."
          value={dados.senha}
          onChange={mudar('senha')}
          erro={envio.erroDe('senha')}
        />
        <Botao type="submit" larguraTotal carregando={envio.enviando}>
          Criar conta
        </Botao>
      </form>
    </PaginaDeAcesso>
  );
}
