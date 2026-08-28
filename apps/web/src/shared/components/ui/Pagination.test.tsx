import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination, buildPageWindow } from './Pagination';

describe('buildPageWindow', () => {
  it('devuelve todas las páginas cuando son pocas', () => {
    expect(buildPageWindow(1, 3)).toEqual([1, 2, 3]);
  });

  it('inserta puntos suspensivos en listas largas', () => {
    // Pintar los 100 números rompería el diseño y no ayuda a nadie.
    expect(buildPageWindow(50, 100)).toEqual([1, 'ellipsis', 49, 50, 51, 'ellipsis', 100]);
  });

  it('no deja hueco cuando las páginas son consecutivas', () => {
    expect(buildPageWindow(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it('siempre incluye la primera y la última', () => {
    const window = buildPageWindow(5, 20);
    expect(window[0]).toBe(1);
    expect(window.at(-1)).toBe(20);
  });

  it('trata una única página sin adornos', () => {
    expect(buildPageWindow(1, 1)).toEqual([1]);
  });
});

describe('Pagination', () => {
  it('no se muestra si no hay resultados', () => {
    const { container } = render(
      <Pagination page={1} pageCount={0} total={0} pageSize={25} onPageChange={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('resume el rango visible', () => {
    render(<Pagination page={2} pageCount={3} total={58} pageSize={25} onPageChange={vi.fn()} />);

    expect(screen.getByText(/26–50 de 58/)).toBeInTheDocument();
  });

  it('en la última página no promete más resultados de los que hay', () => {
    render(<Pagination page={3} pageCount={3} total={58} pageSize={25} onPageChange={vi.fn()} />);

    expect(screen.getByText(/51–58 de 58/)).toBeInTheDocument();
  });

  it('deshabilita "anterior" en la primera página', () => {
    render(<Pagination page={1} pageCount={3} total={58} pageSize={25} onPageChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
  });

  it('deshabilita "siguiente" en la última página', () => {
    render(<Pagination page={3} pageCount={3} total={58} pageSize={25} onPageChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
  });

  it('marca la página actual para los lectores de pantalla', () => {
    render(<Pagination page={2} pageCount={3} total={58} pageSize={25} onPageChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Página 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('avisa del cambio de página', async () => {
    const onPageChange = vi.fn();
    render(
      <Pagination page={1} pageCount={3} total={58} pageSize={25} onPageChange={onPageChange} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Página 3' }));

    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
