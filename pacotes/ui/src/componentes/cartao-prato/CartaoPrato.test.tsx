import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CartaoPrato } from './CartaoPrato.tsx';

const BASE = { nome: 'Pão de fermentação natural', precoEmCentavos: 2400, href: '/prato/pao' };

describe('CartaoPrato', () => {
  it('normal: o nome é o link para o prato e o preço vem formatado', () => {
    render(
      <CartaoPrato {...BASE} descricao="Com manteiga de ervas." imagem={{ src: '/pao.webp', alt: 'Pão' }} />,
    );
    expect(screen.getByRole('link', { name: 'Pão de fermentação natural' }).getAttribute('href')).toBe(
      '/prato/pao',
    );
    expect(screen.getByText(/R\$\s24,00/u)).toBeDefined();
    expect(screen.getByRole('heading', { level: 3, name: 'Pão de fermentação natural' })).toBeDefined();
  });

  it('imagem com AVIF e WebP: picture com as fontes por tipo e dimensões no img', () => {
    const { container } = render(
      <CartaoPrato
        {...BASE}
        imagem={{ src: '/p.jpg', alt: 'Pão', avif: '/p.avif', webp: '/p.webp', largura: 800, altura: 600 }}
      />,
    );
    const fontes = [...container.querySelectorAll('picture source')].map((fonte) => [
      fonte.getAttribute('type'),
      fonte.getAttribute('srcset'),
    ]);
    const imagem = screen.getByRole('img', { name: 'Pão' });

    expect(fontes).toEqual([
      ['image/avif', '/p.avif'],
      ['image/webp', '/p.webp'],
    ]);
    expect([
      imagem.getAttribute('width'),
      imagem.getAttribute('height'),
      imagem.getAttribute('loading'),
    ]).toEqual(['800', '600', 'lazy']);
  });

  it('destaque: mostra o rótulo e o vídeo', () => {
    render(
      <CartaoPrato
        {...BASE}
        nome="Costela na brasa"
        destaque
        nivelTitulo={2}
        video={{ fonteMp4: '/c.mp4', capa: '/c.webp', descricao: 'Costela na brasa girando' }}
      />,
    );
    expect(screen.getByText('Destaque da casa')).toBeDefined();
    expect(screen.getByLabelText('Costela na brasa girando').tagName).toBe('VIDEO');
    expect(screen.getByRole('heading', { level: 2 })).toBeDefined();
  });

  it('esgotado: sem link, sem preço e com o motivo em texto', () => {
    render(<CartaoPrato {...BASE} nome="Burrata com tomates" esgotado />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(/R\$/u)).toBeNull();
    expect(screen.getByText('Esgotado hoje')).toBeDefined();
  });

  it('esgotado aceita outro motivo', () => {
    render(<CartaoPrato {...BASE} esgotado motivoEsgotado="Volta amanhã" />);
    expect(screen.getByText('Volta amanhã')).toBeDefined();
  });
});
