import { juntarClasses } from '../../utilitarios/classes.ts';
import estilos from './Botao.module.css';

export type VarianteBotao = 'principal' | 'secundario' | 'perigo' | 'texto';

export function classesDoBotao(variante: VarianteBotao, larguraTotal: boolean, extra?: string): string {
  return juntarClasses(estilos.botao, estilos[variante], larguraTotal && estilos.larguraTotal, extra);
}
