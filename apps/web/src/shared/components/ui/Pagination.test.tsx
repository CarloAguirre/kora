import { describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination, buildPageWindow, usePaginatedItems } from './Pagination';

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

  it('no muestra el selector de filas si no se puede cambiar', () => {
    render(<Pagination page={1} pageCount={3} total={58} pageSize={25} onPageChange={vi.fn()} />);

    expect(screen.queryByRole('combobox', { name: 'Filas por página' })).not.toBeInTheDocument();
  });

  it('avisa del cambio de filas por página', async () => {
    const onPageSizeChange = vi.fn();
    render(
      <Pagination
        page={1}
        pageCount={6}
        total={58}
        pageSize={10}
        onPageChange={vi.fn()}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Filas por página' });
    expect(select).toHaveValue('10');

    await userEvent.selectOptions(select, '50');

    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });
});

describe('usePaginatedItems', () => {
  const items = Array.from({ length: 58 }, (_, index) => index + 1);

  it('muestra 10 filas por defecto', () => {
    const { result } = renderHook(() => usePaginatedItems(items));

    expect(result.current.pageItems).toEqual(items.slice(0, 10));
    expect(result.current.pagination.pageCount).toBe(6);
  });

  it('al cambiar las filas por página vuelve a la primera', () => {
    const { result } = renderHook(() => usePaginatedItems(items));

    act(() => result.current.pagination.onPageChange(3));
    act(() => result.current.pagination.onPageSizeChange?.(25));

    expect(result.current.pagination.page).toBe(1);
    expect(result.current.pageItems).toHaveLength(25);
  });

  it('si la lista se achica no deja la página fuera de rango', () => {
    const { result, rerender } = renderHook(({ list }) => usePaginatedItems(list), {
      initialProps: { list: items },
    });

    act(() => result.current.pagination.onPageChange(6));
    rerender({ list: items.slice(0, 15) });

    expect(result.current.pagination.page).toBe(2);
    expect(result.current.pageItems).toEqual([11, 12, 13, 14, 15]);
  });
});
