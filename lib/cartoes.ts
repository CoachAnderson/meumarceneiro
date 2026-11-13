/**
 * Tabelas que viram cartões no celular (classe `cartoes-celular`, ou
 * `cartoes-tablet` para virar também no tablet em pé; estilo em
 * index.css). Aqui só se copia o nome de cada coluna, do cabeçalho, para as
 * células (data-rotulo), e a primeira célula de cada linha vira o título do
 * cartão quando a tela não marcou outro (data-cartao="titulo"). Assim, basta
 * pôr a classe na tabela.
 */

const vao = (c: Element) => Math.max(1, Number(c.getAttribute('colspan')) || 1);

function rotularTabela(tabela: HTMLTableElement) {
  const cabecalho = tabela.querySelector(':scope > thead > tr');
  if (!cabecalho) return;
  // Nome de cada coluna, contando colunas mescladas.
  const nomes: string[] = [];
  for (const th of Array.from(cabecalho.querySelectorAll(':scope > th, :scope > td'))) {
    const nome = (th.textContent ?? '').replace(/\s+/g, ' ').trim();
    for (let i = 0; i < vao(th); i++) nomes.push(nome);
  }
  for (const linha of Array.from(tabela.querySelectorAll(':scope > tbody > tr, :scope > tfoot > tr'))) {
    const rodape = linha.parentElement?.tagName === 'TFOOT';
    const celulas = Array.from(linha.querySelectorAll(':scope > td, :scope > th'));
    const temTitulo = celulas.some((c) => c.hasAttribute('data-cartao'));
    let coluna = 0;
    celulas.forEach((c, i) => {
      if (!temTitulo && !rodape && i === 0) c.setAttribute('data-cartao', 'titulo');
      else if (!c.hasAttribute('data-rotulo') && !c.hasAttribute('data-cartao')) c.setAttribute('data-rotulo', nomes[coluna] ?? '');
      coluna += vao(c);
    });
  }
}

let agendado = false;
function rotularTudo() {
  agendado = false;
  document.querySelectorAll<HTMLTableElement>('table.cartoes-celular, table.cartoes-tablet').forEach(rotularTabela);
}

/** Chamado uma vez na abertura: acompanha as tabelas que aparecem e mudam. */
export function iniciarCartoesCelular() {
  if (typeof MutationObserver === 'undefined') return;
  const observador = new MutationObserver(() => {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(rotularTudo);
  });
  observador.observe(document.body, { childList: true, subtree: true });
  rotularTudo();
}
