import { describe, expect, it } from 'vitest';
import { ehLinkDoInstagram } from '../personalizacao/link-instagram.ts';
import { chamadoPodeTransitar, clientePodeCancelarChamado, type SituacaoDoChamado } from './chamado.ts';
import { dividirPorPessoas, resumirConta, taxaDeServico } from './conta.ts';

describe('chamado', () => {
  const todas: SituacaoDoChamado[] = ['aguardando', 'em_atendimento', 'concluido', 'cancelado'];

  it('anda só na ordem; concluído e cancelado não saem do lugar', () => {
    const validas = todas.flatMap((de) =>
      todas.filter((para) => chamadoPodeTransitar(de, para)).map((p) => `${de}>${p}`),
    );
    expect(validas).toEqual([
      'aguardando>em_atendimento',
      'aguardando>cancelado',
      'em_atendimento>concluido',
      'em_atendimento>cancelado',
    ]);
  });

  it('o cliente cancela só enquanto aguardando', () => {
    expect(todas.filter(clientePodeCancelarChamado)).toEqual(['aguardando']);
  });
});

describe('resumo da conta', () => {
  const pedidos = [
    { situacao: 'enviado' as const, totalCentavos: 8900 },
    { situacao: 'entregue' as const, totalCentavos: 2400 },
    { situacao: 'cancelado' as const, totalCentavos: 99_999 },
  ];

  it('soma os pedidos não cancelados, com e sem a taxa de 10%', () => {
    expect(resumirConta(pedidos)).toMatchObject({
      subtotalCentavos: 11300,
      taxaCentavos: 1130,
      totalComTaxaCentavos: 12430,
      totalSemTaxaCentavos: 11300,
    });
  });

  it('a taxa arredonda meio centavo para cima', () => {
    expect([
      taxaDeServico(0),
      taxaDeServico(4),
      taxaDeServico(5),
      taxaDeServico(15),
      taxaDeServico(1234),
    ]).toEqual([0, 0, 1, 2, 123]);
  });

  it.each([1, 2, 3, 7])('divide por %i arredondando para cima, cobrindo o total exato', (pessoas) => {
    const total = 12430;
    const valor = dividirPorPessoas(total)[pessoas - 1] ?? 0;
    expect(valor * pessoas).toBeGreaterThanOrEqual(total);
    expect((valor - 1) * pessoas).toBeLessThan(total);
  });

  it('a tabela vai de 1 a 20 pessoas, com e sem taxa', () => {
    const resumo = resumirConta(pedidos);
    expect(resumo.porPessoa.comTaxa).toHaveLength(20);
    expect(resumo.porPessoa.semTaxa[0]).toBe(11300);
    expect(resumo.porPessoa.comTaxa[2]).toBe(4144);
  });

  it('conta vazia dá zero', () => {
    expect(resumirConta([]).totalComTaxaCentavos).toBe(0);
  });
});

describe('link do Instagram', () => {
  it.each([
    ['https://instagram.com/brasaetrigo', true],
    ['https://www.instagram.com/brasa.e_trigo/', true],
    ['http://instagram.com/brasa', false],
    ['https://instagram.com.golpe.com/brasa', false],
    ['https://instagram.com/brasa?x=1', false],
    ['https://instagram.com/', false],
    ['https://user@instagram.com/brasa', false],
  ])('%s: %s', (link, esperado) => {
    expect(ehLinkDoInstagram(link)).toBe(esperado);
  });
});
