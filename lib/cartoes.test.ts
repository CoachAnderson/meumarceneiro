// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { iniciarCartoesCelular } from './cartoes';

/** Tabelas que viram cartões no celular: o rótulo de cada célula vem do cabeçalho. */

const esperarQuadro = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

function montar(html: string): HTMLTableElement {
  document.body.innerHTML = html;
  return document.querySelector('table')!;
}

const celulas = (t: HTMLTableElement, onde: 'tbody' | 'tfoot', linha: number) =>
  Array.from(t.querySelectorAll(`:scope > ${onde} > tr`)[linha]!.querySelectorAll('td'));
const rotulos = (t: HTMLTableElement, linha: number) =>
  celulas(t, 'tbody', linha).map((c) => c.getAttribute('data-rotulo') ?? `[${c.getAttribute('data-cartao')}]`);

describe('iniciarCartoesCelular', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('copia o nome da coluna para cada célula; a primeira vira o título do cartão', () => {
    const t = montar(`<table class="cartoes-celular"><thead><tr><th>Peça</th><th> Qtd </th><th>Corte (mm)</th></tr></thead>
      <tbody><tr><td>Lateral</td><td>2</td><td>720 × 550</td></tr></tbody></table>`);
    iniciarCartoesCelular();
    expect(rotulos(t, 0)).toEqual(['[titulo]', 'Qtd', 'Corte (mm)']);
  });

  it('respeita o título marcado pela tela e o rótulo já escrito', () => {
    const t = montar(`<table class="cartoes-tablet"><thead><tr><th>Cód.</th><th>Peça</th><th>Qtd</th><th>Fita</th></tr></thead>
      <tbody><tr><td data-cartao="titulo">P01</td><td data-cartao="titulo">Lateral</td><td>2</td><td data-rotulo="Fita de borda">frente</td></tr></tbody></table>`);
    iniciarCartoesCelular();
    expect(rotulos(t, 0)).toEqual(['[titulo]', '[titulo]', 'Qtd', 'Fita de borda']);
  });

  it('conta colunas mescladas; o rodapé não ganha título', () => {
    const t = montar(`<table class="cartoes-celular"><thead><tr><th colspan="2">Item</th><th>Total</th></tr></thead>
      <tbody><tr><td>Dobradiça</td><td>reta</td><td>R$ 13,80</td></tr></tbody>
      <tfoot><tr><td colspan="2">Soma</td><td>R$ 13,80</td></tr></tfoot></table>`);
    iniciarCartoesCelular();
    expect(rotulos(t, 0)).toEqual(['[titulo]', 'Item', 'Total']);
    expect(celulas(t, 'tfoot', 0).map((c) => c.getAttribute('data-rotulo'))).toEqual(['Item', 'Total']);
  });

  it('rotula as linhas que aparecem depois (a tela muda sem recarregar)', async () => {
    const t = montar(`<table class="cartoes-celular"><thead><tr><th>Nome</th><th>Saldo</th></tr></thead><tbody></tbody></table>`);
    iniciarCartoesCelular();
    const linha = document.createElement('tr');
    for (const texto of ['MDF', '12 chapas']) {
      const td = document.createElement('td');
      td.textContent = texto;
      linha.append(td);
    }
    t.querySelector('tbody')!.append(linha);
    await new Promise((r) => setTimeout(r, 0));
    await esperarQuadro();
    expect(rotulos(t, 0)).toEqual(['[titulo]', 'Saldo']);
  });

  it('não mexe em tabela sem a classe', () => {
    const t = montar(`<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>`);
    iniciarCartoesCelular();
    expect(celulas(t, 'tbody', 0).some((c) => c.hasAttribute('data-rotulo') || c.hasAttribute('data-cartao'))).toBe(false);
  });
});
