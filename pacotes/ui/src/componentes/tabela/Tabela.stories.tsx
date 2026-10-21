import type { Meta, StoryObj } from '@storybook/react-vite';
import { SeloSituacao, type Situacao } from '../selo-situacao/SeloSituacao.tsx';
import { Tabela, type ColunaTabela } from './Tabela.tsx';

interface Restaurante {
  readonly id: string;
  readonly nome: string;
  readonly cidade: string;
  readonly plano: string;
  readonly situacao: Situacao;
  readonly textoSituacao: string;
  readonly mensalidade: string;
  readonly mesas: string;
}

const COLUNAS: readonly ColunaTabela<Restaurante>[] = [
  { chave: 'nome', titulo: 'Restaurante', celula: (linha) => linha.nome },
  { chave: 'cidade', titulo: 'Cidade', celula: (linha) => linha.cidade },
  { chave: 'plano', titulo: 'Plano', celula: (linha) => linha.plano },
  {
    chave: 'situacao',
    titulo: 'Situação',
    celula: (linha) => <SeloSituacao situacao={linha.situacao} texto={linha.textoSituacao} />,
  },
  { chave: 'mensalidade', titulo: 'Mensalidade', celula: (linha) => linha.mensalidade, numerica: true },
  { chave: 'mesas', titulo: 'Mesas', celula: (linha) => linha.mesas, numerica: true },
];

const LINHAS: readonly Restaurante[] = [
  {
    id: '1',
    nome: 'Brasa & Trigo',
    cidade: 'Belo Horizonte',
    plano: 'Pro',
    situacao: 'paga',
    textoSituacao: 'Ativo',
    mensalidade: 'R$ 149,00',
    mesas: '24 de 30',
  },
  {
    id: '2',
    nome: 'Bar do Zé Pescador',
    cidade: 'Contagem',
    plano: 'Pro',
    situacao: 'vencida',
    textoSituacao: 'Em atraso',
    mensalidade: 'R$ 149,00',
    mesas: '22 de 30',
  },
  {
    id: '3',
    nome: 'Cantina Dona Lu',
    cidade: 'Betim',
    plano: 'Teste',
    situacao: 'emAtendimento',
    textoSituacao: 'Em teste',
    mensalidade: 'Grátis até 23/10',
    mesas: '12 de 30',
  },
  {
    id: '4',
    nome: 'Hamburgueria 77',
    cidade: 'Itaúna',
    plano: 'Básico',
    situacao: 'cancelado',
    textoSituacao: 'Cancelado',
    mensalidade: '-',
    mesas: '0',
  },
];

const meta = {
  title: 'Painel/Tabela',
  component: Tabela<Restaurante>,
  args: {
    legenda: 'Restaurantes',
    colunas: COLUNAS,
    linhas: LINHAS,
    chaveDaLinha: (linha: Restaurante) => linha.id,
  },
} satisfies Meta<typeof Tabela<Restaurante>>;

export default meta;
type Historia = StoryObj<typeof meta>;

export const ComDados: Historia = {};
export const Vazia: Historia = { args: { linhas: [], mensagemVazia: 'Nenhum restaurante com esse filtro.' } };
export const Carregando: Historia = { args: { carregando: true } };
