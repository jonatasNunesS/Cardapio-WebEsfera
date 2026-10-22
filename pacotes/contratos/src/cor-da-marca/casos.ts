export const CORES_DE_REFERENCIA = {
  fundo: '#F7F4F0',
  textoPadrao: '#1F1A17',
  branco: '#FFFFFF',
} as const;

export interface CasoDeRazao {
  readonly frente: string;
  readonly fundo: string;
  readonly razao: number;
}

export const CASOS_DE_RAZAO: readonly CasoDeRazao[] = [
  { frente: '#FFFFFF', fundo: '#000000', razao: 21 },
  { frente: '#FFFFFF', fundo: '#FFFFFF', razao: 1 },
  { frente: '#FFFFFF', fundo: '#B4441F', razao: 5.54 },
  { frente: '#B4441F', fundo: '#F7F4F0', razao: 5.06 },
  { frente: '#1F1A17', fundo: '#F7F4F0', razao: 15.72 },
  { frente: '#5C524B', fundo: '#F7F4F0', razao: 6.93 },
  { frente: '#8C8079', fundo: '#FFFFFF', razao: 3.83 },
  { frente: '#303642', fundo: '#00C2CB', razao: 5.53 },
  { frente: '#FFFFFF', fundo: '#00C2CB', razao: 2.19 },
  { frente: '#F2F4F7', fundo: '#0B0F14', razao: 17.44 },
  { frente: '#E0B000', fundo: '#F7F4F0', razao: 1.85 },
];

export interface CasoDeCorDaMarca {
  readonly nome: string;
  readonly cor: string;
  readonly corSobreMarca: string;
  readonly corMarcaTexto: string;
  readonly passa: boolean;
  readonly sugestao?: string;
}

export const CASOS_DE_COR_DA_MARCA: readonly CasoDeCorDaMarca[] = [
  { nome: 'Terracota', cor: '#B4441F', corSobreMarca: '#FFFFFF', corMarcaTexto: '#B4441F', passa: true },
  { nome: 'Verde mata', cor: '#2F6B3A', corSobreMarca: '#FFFFFF', corMarcaTexto: '#2F6B3A', passa: true },
  { nome: 'Azul', cor: '#1F4E8C', corSobreMarca: '#FFFFFF', corMarcaTexto: '#1F4E8C', passa: true },
  { nome: 'Ameixa', cor: '#6B2D5C', corSobreMarca: '#FFFFFF', corMarcaTexto: '#6B2D5C', passa: true },
  { nome: 'Preto', cor: '#000000', corSobreMarca: '#FFFFFF', corMarcaTexto: '#000000', passa: true },
  {
    nome: 'Mostarda',
    cor: '#E0B000',
    corSobreMarca: '#1F1A17',
    corMarcaTexto: '#1F1A17',
    passa: false,
    sugestao: '#A88400',
  },
  {
    nome: 'Ciano WebEsfera',
    cor: '#00C2CB',
    corSobreMarca: '#1F1A17',
    corMarcaTexto: '#1F1A17',
    passa: false,
    sugestao: '#009BA2',
  },
  {
    nome: 'Branco',
    cor: '#FFFFFF',
    corSobreMarca: '#1F1A17',
    corMarcaTexto: '#1F1A17',
    passa: false,
    sugestao: '#8C8C8C',
  },
  {
    nome: 'Amarelo claro',
    cor: '#FFE066',
    corSobreMarca: '#1F1A17',
    corMarcaTexto: '#1F1A17',
    passa: false,
    sugestao: '#99863D',
  },
];
