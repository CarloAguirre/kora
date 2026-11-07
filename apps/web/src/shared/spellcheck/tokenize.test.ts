import { describe, expect, it } from 'vitest';
import { rankSuggestions, tokenize } from './tokenize';

const words = (text: string) => tokenize(text).map((token) => token.word);

describe('tokenize', () => {
  it('devuelve cada palabra con su posición en el texto', () => {
    expect(tokenize('hoa como estás')).toEqual([
      { word: 'hoa', start: 0, end: 3 },
      { word: 'como', start: 4, end: 8 },
      { word: 'estás', start: 9, end: 14 },
    ]);
  });

  it('separa por puntuación y guiones', () => {
    expect(words('¿Diseño socio-económico? Sí, (listo).')).toEqual(['Diseño', 'socio', 'económico', 'Sí', 'listo']);
  });

  it('salta URLs, correos, rutas y nombres de archivo', () => {
    expect(words('ver https://kabeli.cl y www.kora.cl o a juan@kabeli.cl en src/app index.tsx')).toEqual([
      'ver',
      'en',
    ]);
  });

  it('salta siglas, nombres con mayúsculas internas y palabras pegadas a números', () => {
    expect(words('El QA de la API en JavaScript tomó 3hrs, la 2da vez')).toEqual(['El', 'de', 'la', 'en', 'tomó', 'la', 'vez']);
  });

  it('salta palabras de una letra', () => {
    expect(words('y o a')).toEqual([]);
  });
});

describe('rankSuggestions', () => {
  it('pone primero las que solo difieren en tildes o eñe', () => {
    expect(rankSuggestions('diseno', ['disenso', 'disueno', 'diseco', 'diseño'])).toEqual([
      'diseño',
      'disenso',
      'disueno',
      'diseco',
    ]);
  });

  it('descarta las partidas con guion y deja al final las partidas con espacio', () => {
    expect(rankSuggestions('bitacora', ['bitácora', 'bit acora', 'bit-acora'])).toEqual(['bitácora', 'bit acora']);
  });

  it('recorta al límite', () => {
    expect(rankSuggestions('x', ['a', 'b', 'c', 'd'], 2)).toEqual(['a', 'b']);
  });
});
