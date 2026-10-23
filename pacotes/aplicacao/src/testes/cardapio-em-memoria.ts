import { ESPACO_DA_ORDEM, type ItemOrdenado } from '@cardapio/dominio';
import type {
  CategoriaGuardada,
  DadosDoPratoParaGravar,
  Desfecho,
  ItemVersionado,
  Movimento,
  PratoGuardado,
  RepositorioDoCardapio,
  SituacaoDoPrato,
} from '../cardapio/index.ts';

interface Linha<T> {
  restauranteId: string;
  removido: boolean;
  valor: T;
}

const chaveDoNome = (nome: string) => nome.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

let sequencia = 0;
const novoId = () => {
  sequencia += 1;
  return `00000000-0000-7000-8000-${String(sequencia).padStart(12, '0')}`;
};

export class CardapioEmMemoria implements RepositorioDoCardapio {
  readonly categorias: Linha<CategoriaGuardada>[] = [];
  readonly pratos: Linha<PratoGuardado>[] = [];

  private ativas<T extends { id: string }>(linhas: Linha<T>[], restauranteId: string) {
    return linhas.filter((linha) => linha.restauranteId === restauranteId && !linha.removido);
  }

  private achar<T extends { id: string; versao: number }>(
    linhas: Linha<T>[],
    restauranteId: string,
    item: ItemVersionado,
  ): Linha<T> | 'conflito' | 'nao-encontrado' {
    const linha = this.ativas(linhas, restauranteId).find((atual) => atual.valor.id === item.id);
    if (linha === undefined) {
      return 'nao-encontrado';
    }
    return linha.valor.versao === item.versao ? linha : 'conflito';
  }

  private nomeOcupado(restauranteId: string, nome: string, exceto?: string) {
    return this.ativas(this.categorias, restauranteId).some(
      (linha) => linha.valor.id !== exceto && chaveDoNome(linha.valor.nome) === chaveDoNome(nome),
    );
  }

  private fim(itens: readonly ItemOrdenado[]) {
    return itens.reduce((maior, item) => Math.max(maior, item.ordem), 0) + ESPACO_DA_ORDEM;
  }

  listar(restauranteId: string) {
    return Promise.resolve({
      categorias: this.ativas(this.categorias, restauranteId).map((linha) => linha.valor),
      pratos: this.ativas(this.pratos, restauranteId).map((linha) => linha.valor),
    });
  }

  criarCategoria(restauranteId: string, nome: string): Promise<Desfecho<CategoriaGuardada>> {
    if (this.nomeOcupado(restauranteId, nome)) {
      return Promise.resolve({ tipo: 'nome-repetido' });
    }
    const ordem = this.fim(this.ativas(this.categorias, restauranteId).map((linha) => linha.valor));
    const valor = { id: novoId(), nome, ordem, versao: 1 };
    this.categorias.push({ restauranteId, removido: false, valor });
    return Promise.resolve({ tipo: 'ok', valor });
  }

  editarCategoria(
    restauranteId: string,
    item: ItemVersionado,
    nome: string,
  ): Promise<Desfecho<CategoriaGuardada>> {
    const linha = this.achar(this.categorias, restauranteId, item);
    if (typeof linha === 'string') {
      return Promise.resolve({ tipo: linha });
    }
    if (this.nomeOcupado(restauranteId, nome, item.id)) {
      return Promise.resolve({ tipo: 'nome-repetido' });
    }
    linha.valor = { ...linha.valor, nome, versao: linha.valor.versao + 1 };
    return Promise.resolve({ tipo: 'ok', valor: linha.valor });
  }

  removerCategoria(restauranteId: string, item: ItemVersionado): Promise<Desfecho<null>> {
    const linha = this.achar(this.categorias, restauranteId, item);
    if (typeof linha === 'string') {
      return Promise.resolve({ tipo: linha });
    }
    if (this.ativas(this.pratos, restauranteId).some((prato) => prato.valor.categoriaId === item.id)) {
      return Promise.resolve({ tipo: 'com-pratos' });
    }
    linha.removido = true;
    return Promise.resolve({ tipo: 'ok', valor: null });
  }

  private categoriaExiste(restauranteId: string, categoriaId: string) {
    return this.ativas(this.categorias, restauranteId).some((linha) => linha.valor.id === categoriaId);
  }

  private pratosDa(restauranteId: string, categoriaId: string) {
    return this.ativas(this.pratos, restauranteId)
      .map((linha) => linha.valor)
      .filter((prato) => prato.categoriaId === categoriaId);
  }

  criarPrato(restauranteId: string, prato: DadosDoPratoParaGravar): Promise<Desfecho<PratoGuardado>> {
    if (!this.categoriaExiste(restauranteId, prato.categoriaId)) {
      return Promise.resolve({ tipo: 'categoria-inexistente' });
    }
    const valor = {
      ...prato,
      id: novoId(),
      ordem: this.fim(this.pratosDa(restauranteId, prato.categoriaId)),
      versao: 1,
    };
    this.pratos.push({ restauranteId, removido: false, valor });
    return Promise.resolve({ tipo: 'ok', valor });
  }

  editarPrato(
    restauranteId: string,
    item: ItemVersionado,
    prato: DadosDoPratoParaGravar,
  ): Promise<Desfecho<PratoGuardado>> {
    const linha = this.achar(this.pratos, restauranteId, item);
    if (typeof linha === 'string') {
      return Promise.resolve({ tipo: linha });
    }
    if (!this.categoriaExiste(restauranteId, prato.categoriaId)) {
      return Promise.resolve({ tipo: 'categoria-inexistente' });
    }
    const mudouDeCategoria = prato.categoriaId !== linha.valor.categoriaId;
    const ordem = mudouDeCategoria
      ? this.fim(this.pratosDa(restauranteId, prato.categoriaId))
      : linha.valor.ordem;
    linha.valor = { ...linha.valor, ...prato, ordem, versao: linha.valor.versao + 1 };
    return Promise.resolve({ tipo: 'ok', valor: linha.valor });
  }

  alterarSituacaoDoPrato(restauranteId: string, situacao: SituacaoDoPrato): Promise<Desfecho<PratoGuardado>> {
    const linha = this.achar(this.pratos, restauranteId, situacao);
    if (typeof linha === 'string') {
      return Promise.resolve({ tipo: linha });
    }
    linha.valor = {
      ...linha.valor,
      disponivel: situacao.disponivel ?? linha.valor.disponivel,
      destaque: situacao.destaque ?? linha.valor.destaque,
      versao: linha.valor.versao + 1,
    };
    return Promise.resolve({ tipo: 'ok', valor: linha.valor });
  }

  removerPrato(restauranteId: string, item: ItemVersionado): Promise<Desfecho<null>> {
    const linha = this.achar(this.pratos, restauranteId, item);
    if (typeof linha === 'string') {
      return Promise.resolve({ tipo: linha });
    }
    linha.removido = true;
    return Promise.resolve({ tipo: 'ok', valor: null });
  }

  mover(restauranteId: string, movimento: Movimento): Promise<Desfecho<null>> {
    const linhas: Linha<CategoriaGuardada | PratoGuardado>[] =
      movimento.tipo === 'categoria' ? this.categorias : this.pratos;
    const linha = this.achar(linhas, restauranteId, movimento);
    if (typeof linha === 'string') {
      return Promise.resolve({ tipo: linha });
    }
    const vizinhas = this.ativas(linhas, restauranteId).filter(
      (atual) =>
        !('categoriaId' in linha.valor) ||
        ('categoriaId' in atual.valor && atual.valor.categoriaId === linha.valor.categoriaId),
    );
    const novas = new Map(
      movimento.planejar(vizinhas.map((atual) => atual.valor)).map((item) => [item.id, item.ordem]),
    );
    for (const atual of vizinhas) {
      const ordem = novas.get(atual.valor.id);
      if (ordem !== undefined) {
        atual.valor = { ...atual.valor, ordem };
      }
    }
    linha.valor = { ...linha.valor, versao: linha.valor.versao + 1 };
    return Promise.resolve({ tipo: 'ok', valor: null });
  }
}
