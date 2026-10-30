import { useMemo, useSyncExternalStore } from 'react';
import { criarCarrinho, type Carrinho } from './carrinho.ts';

const armazenamento = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);
const carrinhos = new Map<string, Carrinho>();

export function carrinhoDa(slug: string, numero: number): Carrinho {
  const chave = `carrinho:${slug}:${String(numero)}`;
  const existente = carrinhos.get(chave);
  if (existente !== undefined) {
    return existente;
  }
  const novo = criarCarrinho(chave, armazenamento);
  carrinhos.set(chave, novo);
  return novo;
}

export function useCarrinho(slug: string, numero: number) {
  const carrinho = useMemo(() => carrinhoDa(slug, numero), [slug, numero]);
  const estado = useSyncExternalStore(carrinho.assinar, carrinho.ler, carrinho.ler);
  return { carrinho, estado };
}
