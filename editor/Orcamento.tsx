import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { calcularOrcamento, descreverBordas, descreverUsinagem, type CategoriaCusto, type EntradaOrcamento, type Orcamento as ResultadoOrcamento } from '@marcenaria/core';
import { formatarMoeda, gerarXlsx, lerDecimalEscalado, lerPrecoCentavos, type Celula } from '@marcenaria/catalog';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Campo, CampoTexto, Cartao } from '../components/ui';
import { buscarFerragens, buscarFitas, chaveFerragens, chaves } from '../lib/catalogo';
import { mensagemDeErro } from '../lib/erros';
import { baixarBytes } from '../lib/exportar';
import { lerCampo } from '../lib/formulario';
import { chavesOrcamentos, dataMais, emitirOrcamento, type DadosOrcamento } from '../lib/orcamentos';
import { NOME_MATERIAL } from './estilo';
import { descricaoFerragem, linhasDeFerragem } from './ferragens';
import type { Formulario, OrcamentoForm } from './formulario';
import type { ResumoPlano } from './PlanoCorte';
import { descricaoMaterial, type Calculo } from './useCalculo';

export interface ProjetoDoOrcamento {
  id: string;
  nome: string;
  versao: number;
  /** Há alteração não salva: o orçamento precisa sair de uma versão gravada. */
  alterado: boolean;
  clienteId: string | null;
  clienteNome: string | null;
}

const NOME_CATEGORIA: Record<CategoriaCusto, string> = { chapa: 'Chapas', fita: 'Fita de borda', ferragem: 'Ferragens', mao_de_obra: 'Mão de obra', outro: 'Outros' };
const reais = (centavos: number) => centavos / 100;

/** Custo, margem e preço do projeto; emite o orçamento e exporta para Excel. */
export function Orcamento({
  f,
  atualizar,
  calculo,
  plano,
  somenteLeitura,
  nomeArquivo,
  projeto,
}: {
  f: Formulario;
  atualizar: (parcial: Partial<Formulario>) => void;
  calculo: Calculo;
  plano: ResumoPlano | null;
  somenteLeitura: boolean;
  nomeArquivo: string;
  projeto?: ProjetoDoOrcamento;
}) {
  const { empresa } = useEmpresaAtual();
  const navegar = useNavigate();
  const queryClient = useQueryClient();
  const fitas = useQuery({ queryKey: chaves.fitas(empresa.id), queryFn: () => buscarFitas(empresa.id) });
  const catalogo = useQuery({ queryKey: chaveFerragens(empresa.id), queryFn: () => buscarFerragens(empresa.id) });
  const [emitindo, setEmitindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const o = f.orcamento;
  const mudar = (parcial: Partial<OrcamentoForm>) => atualizar({ orcamento: { ...o, ...parcial } });
  const { lista, resultado } = calculo;
  if (!lista || !resultado) {
    return (
      <Cartao titulo="Orçamento">
        <p className="text-sm text-stone-500">O orçamento sai da lista de peças; corrija os problemas do módulo primeiro.</p>
      </Cartao>
    );
  }

  // ---- Campos
  const erros: string[] = [];
  const ler = <T,>(texto: string, fn: (t: string) => T, nome: string): T | undefined => {
    const r = lerCampo(texto, fn);
    if (r.erro) erros.push(r.erro);
    void nome;
    return r.valor;
  };
  const decimosHora = ler(o.horas, (t) => lerDecimalEscalado(t, 1, 'Horas'), 'Horas') ?? 0;
  const valorHora = ler(o.valorHora, (t) => lerPrecoCentavos(t, 'Valor da hora'), 'Valor da hora') ?? 0;
  const margem = ler(o.margem, (t) => lerDecimalEscalado(t, 2, 'Margem'), 'Margem') ?? 0;
  const desconto = ler(o.desconto, (t) => lerDecimalEscalado(t, 2, 'Desconto'), 'Desconto') ?? 0;
  const validade = /^\d{1,3}$/.test(o.validadeDias.trim()) ? Number(o.validadeDias) : NaN;
  if (!(validade >= 1 && validade <= 365)) erros.push('Validade: use de 1 a 365 dias.');
  if (margem > 100_000) erros.push('Margem: até 1000%.');
  if (desconto > 10_000) erros.push('Desconto: até 100%.');
  const outros = o.outros
    .filter((x) => x.descricao.trim() || x.valor.trim())
    .map((x, i) => ({ descricao: x.descricao.trim() || `Outro custo ${i + 1}`, valorCentavos: ler(x.valor, (t) => lerPrecoCentavos(t, x.descricao || 'Valor'), 'Valor') ?? 0 }));

  // ---- Linhas de custo
  const pendenciasExtras: string[] = [];
  if (!plano) pendenciasExtras.push('Plano de corte incompleto: sem ele não dá para saber quantas chapas comprar. Escolha materiais cadastrados, com formato de chapa.');
  const fita = (fitas.data ?? []).find((x) => x.id === f.corte.fita) ?? null;
  if (lista.fitaComSobraDmm > 0 && !fita) pendenciasExtras.push('Fita de borda: escolha a fita do catálogo no plano de corte para ter o preço.');
  const ferragens = linhasDeFerragem(calculo, f, catalogo.data ?? []);

  const entrada: EntradaOrcamento = {
    chapas: (plano?.custo ?? []).map((p) => ({ descricao: p.descricao, quantidade: p.quantidade, precoCentavos: p.precoCentavos })),
    fitas: fita ? [{ descricao: fita.nome, comprimentoDmm: lista.fitaComSobraDmm, precoMetroCentavos: fita.preco_metro_centavos }] : [],
    ferragens: ferragens.map((l) => ({ descricao: l.escolhido?.nome ?? descricaoFerragem(l.n), quantidade: l.n.quantidade, precoCentavos: l.escolhido?.preco_centavos ?? null })),
    maoDeObra: { minutos: decimosHora * 6, valorHoraCentavos: valorHora },
    outros,
    margemCentesimos: Math.min(margem, 100_000),
    descontoCentesimos: Math.min(desconto, 10_000),
  };

  let orc: ResultadoOrcamento;
  try {
    orc = calcularOrcamento(entrada);
  } catch (e) {
    return (
      <Cartao titulo="Orçamento">
        <Aviso>{mensagemDeErro(e)}</Aviso>
      </Cartao>
    );
  }
  const pendencias = [...pendenciasExtras, ...orc.pendencias];
  const podeEmitir = !!projeto && !projeto.alterado && pendencias.length === 0 && erros.length === 0 && !somenteLeitura;

  // ---- Resumo do móvel para a proposta
  function descricaoDoMovel(): string[] {
    const { matEstrutura, matFundo, matFrente, qtdModulos } = calculo;
    const comps = resultado!.componentes;
    const conta = (papel: string) => comps.filter((c) => c.papel === papel).length * qtdModulos;
    const linhas = [`${qtdModulos === 1 ? '1 módulo' : `${qtdModulos} módulos`} de ${f.L.trim()} × ${f.A.trim()} × ${f.P.trim()} mm (largura × altura × profundidade)`];
    linhas.push(`Estrutura em ${matEstrutura ? descricaoMaterial(matEstrutura) : `chapa de ${f.espessuraEstrutura} mm`}; fundo em ${matFundo ? descricaoMaterial(matFundo) : `chapa de ${f.espessuraFundo} mm`}`);
    const portas = conta('porta');
    const gavetas = conta('frente_gaveta');
    if (portas + gavetas > 0) {
      const partes = [portas ? `${portas} ${portas === 1 ? 'porta' : 'portas'}` : '', gavetas ? `${gavetas} ${gavetas === 1 ? 'gaveta' : 'gavetas'}` : ''].filter(Boolean);
      linhas.push(`${partes.join(' e ')}, frentes em ${matFrente ? descricaoMaterial(matFrente) : `chapa de ${f.espessuraFrente} mm`}`);
    }
    const prateleiras = conta('prateleira_fixa') + conta('prateleira_regulavel');
    const divisorias = conta('divisoria');
    const interior = [divisorias ? `${divisorias} ${divisorias === 1 ? 'divisória' : 'divisórias'}` : '', prateleiras ? `${prateleiras} ${prateleiras === 1 ? 'prateleira' : 'prateleiras'}` : ''].filter(Boolean);
    if (interior.length) linhas.push(`Interior com ${interior.join(' e ')}`);
    const nomesFerragens = [...new Set(ferragens.map((l) => l.escolhido?.nome).filter((x): x is string => !!x))];
    if (nomesFerragens.length) linhas.push(`Ferragens: ${nomesFerragens.join(', ')}`);
    return linhas;
  }

  async function emitir() {
    if (!projeto || !orc) return;
    setEmitindo(true);
    setErro(null);
    try {
      const dados: DadosOrcamento = {
        empresa: empresa.nome,
        descricao: descricaoDoMovel(),
        linhas: orc.linhas,
        custoCentavos: orc.custoCentavos,
        margemCentesimos: entrada.margemCentesimos,
        margemCentavos: orc.margemCentavos,
        precoCentavos: orc.precoCentavos,
        descontoCentesimos: entrada.descontoCentesimos ?? 0,
        descontoCentavos: orc.descontoCentavos,
        totalCentavos: orc.totalCentavos,
        condicoes: o.condicoes.trim(),
      };
      const id = await emitirOrcamento({
        empresaId: empresa.id,
        projetoId: projeto.id,
        projetoVersao: projeto.versao,
        projetoNome: projeto.nome,
        clienteId: projeto.clienteId,
        clienteNome: projeto.clienteNome,
        dados,
        validade: dataMais(validade),
      });
      await queryClient.invalidateQueries({ queryKey: chavesOrcamentos.lista(empresa.id) });
      navegar(`/orcamentos/${id}`);
    } catch (e) {
      setErro(mensagemDeErro(e));
      setEmitindo(false);
    }
  }

  function exportarExcel() {
    if (!orc || !lista) return;
    const n = (v: string): Celula => ({ v, estilo: 'negrito' });
    const dinheiro = (c: number | null): Celula => (c === null ? 'sem preço' : { v: reais(c), estilo: 'dinheiro' });
    const mm = (v: number): Celula => ({ v: v / 10, estilo: 'decimal' });
    const arquivo = gerarXlsx([
      {
        nome: 'Orçamento',
        larguras: [18, 46, 16, 16],
        linhas: [
          [n('Categoria'), n('Item'), n('Quantidade'), n('Custo')],
          ...orc.linhas.map((l): Celula[] => [NOME_CATEGORIA[l.categoria], l.descricao, l.quantidade, dinheiro(l.custoCentavos)]),
          [],
          [null, n('Custo total'), null, dinheiro(orc.custoCentavos)],
          [null, `Margem (${o.margem}%)`, null, dinheiro(orc.margemCentavos)],
          [null, 'Preço', null, dinheiro(orc.precoCentavos)],
          [null, `Desconto (${o.desconto}%)`, null, dinheiro(orc.descontoCentavos)],
          [null, n('Total para o cliente'), null, dinheiro(orc.totalCentavos)],
          [null, 'Lucro', null, dinheiro(orc.lucroCentavos)],
        ],
      },
      {
        nome: 'Peças',
        larguras: [8, 30, 16, 6, 14, 12, 12, 22, 26, 50],
        linhas: [
          [n('Código'), n('Peça'), n('Material'), n('Qtd'), n('Comprimento (mm)'), n('Largura (mm)'), n('Espessura (mm)'), n('Veio'), n('Fita de borda'), n('Usinagem')],
          ...lista.itens.map((i): Celula[] => [
            i.codigo,
            i.nome,
            NOME_MATERIAL[i.material],
            i.quantidade,
            mm(i.comprimento),
            mm(i.largura),
            mm(i.espessura),
            i.veio ? 'Segue o comprimento' : 'Sem veio',
            descreverBordas(i.bordas),
            i.usinagens.map(descreverUsinagem).join(' | '),
          ]),
        ],
      },
      {
        nome: 'Ferragens',
        larguras: [46, 8, 40, 14, 14],
        linhas: [
          [n('Ferragem'), n('Qtd'), n('Item do catálogo'), n('Preço unitário'), n('Total')],
          ...ferragens.map((l): Celula[] => [descricaoFerragem(l.n), l.n.quantidade, l.escolhido?.nome ?? '', dinheiro(l.escolhido?.preco_centavos ?? null), dinheiro(l.total)]),
        ],
      },
    ]);
    baixarBytes(`${nomeArquivo}-orcamento.xlsx`, arquivo, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  return (
    <Cartao
      titulo="Orçamento"
      descricao={`Custo de ${calculo.qtdModulos === 1 ? '1 módulo' : `${calculo.qtdModulos} módulos`}: chapas inteiras do plano de corte, fita com a sobra, ferragens do catálogo, mão de obra e extras.`}
      acoes={
        <Botao variante="secundario" onClick={exportarExcel}>
          Excel
        </Botao>
      }
    >
      <div className="-mx-5 overflow-x-auto sm:-mx-6">
        <table className="cartoes-celular min-w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-stone-500">
              <th className="px-5 py-2 font-medium sm:px-6">Item</th>
              <th className="px-3 py-2 font-medium">Quantidade</th>
              <th className="px-5 py-2 text-right font-medium sm:px-6">Custo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {orc.linhas.map((l, i) => (
              <tr key={i}>
                <td className="px-5 py-2 sm:px-6">
                  <span className="text-stone-500">{NOME_CATEGORIA[l.categoria]} · </span>
                  {l.descricao}
                </td>
                <td className="tabular px-3 py-2 whitespace-nowrap">{l.quantidade}</td>
                <td className="tabular px-5 py-2 text-right whitespace-nowrap sm:px-6">{l.custoCentavos === null ? <span className="text-red-700">sem preço</span> : formatarMoeda(l.custoCentavos)}</td>
              </tr>
            ))}
            {orc.linhas.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-4 text-center text-stone-500 sm:px-6">
                  Nenhum custo ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <fieldset disabled={somenteLeitura} className="mt-5 grid gap-3 border-t border-stone-100 pt-4 sm:grid-cols-4">
        <Campo rotulo="Mão de obra (horas)" inputMode="decimal" placeholder="Ex.: 6,5" value={o.horas} onChange={(e) => mudar({ horas: e.target.value })} />
        <Campo rotulo="Valor da hora (R$)" inputMode="decimal" placeholder="Ex.: 60" value={o.valorHora} onChange={(e) => mudar({ valorHora: e.target.value })} />
        <Campo rotulo="Margem (%)" title="Percentual somado ao custo" inputMode="decimal" value={o.margem} onChange={(e) => mudar({ margem: e.target.value })} />
        <Campo rotulo="Desconto (%)" inputMode="decimal" value={o.desconto} onChange={(e) => mudar({ desconto: e.target.value })} />
        <div className="space-y-2 sm:col-span-4">
          {o.outros.map((x, i) => (
            <div key={i} className="grid grid-cols-[1fr_8rem_auto] items-end gap-2">
              <Campo rotulo={i === 0 ? 'Outro custo' : ''} aria-label={`Descrição do outro custo ${i + 1}`} placeholder="Frete, instalação, pintura…" value={x.descricao} maxLength={80} onChange={(e) => mudar({ outros: o.outros.map((y, j) => (j === i ? { ...y, descricao: e.target.value } : y)) })} />
              <Campo rotulo={i === 0 ? 'Valor (R$)' : ''} aria-label={`Valor do outro custo ${i + 1}`} inputMode="decimal" value={x.valor} onChange={(e) => mudar({ outros: o.outros.map((y, j) => (j === i ? { ...y, valor: e.target.value } : y)) })} />
              <Botao variante="discreto" type="button" aria-label={`Remover outro custo ${i + 1}`} onClick={() => mudar({ outros: o.outros.filter((_, j) => j !== i) })}>
                ×
              </Botao>
            </div>
          ))}
          {o.outros.length < 30 && (
            <Botao variante="discreto" type="button" className="min-h-0 px-2 py-1" onClick={() => mudar({ outros: [...o.outros, { descricao: '', valor: '' }] })}>
              + Outro custo (frete, instalação…)
            </Botao>
          )}
        </div>
      </fieldset>

      <dl className="mt-5 grid gap-x-8 gap-y-1 border-t border-stone-100 pt-4 text-sm sm:grid-cols-2">
        <div className="space-y-1">
          {(Object.keys(NOME_CATEGORIA) as CategoriaCusto[])
            .filter((c) => orc.custoPorCategoria[c] > 0)
            .map((c) => (
              <div key={c} className="flex justify-between">
                <dt className="text-stone-500">{NOME_CATEGORIA[c]}</dt>
                <dd className="tabular">{formatarMoeda(orc.custoPorCategoria[c])}</dd>
              </div>
            ))}
        </div>
        <div className="space-y-1">
          <div className="flex justify-between">
            <dt className="text-stone-500">Custo total</dt>
            <dd className="tabular font-medium">{formatarMoeda(orc.custoCentavos)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">Margem</dt>
            <dd className="tabular">+ {formatarMoeda(orc.margemCentavos)}</dd>
          </div>
          {orc.descontoCentavos > 0 && (
            <div className="flex justify-between">
              <dt className="text-stone-500">Desconto</dt>
              <dd className="tabular">− {formatarMoeda(orc.descontoCentavos)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-stone-200 pt-1 text-base">
            <dt className="font-medium">Total para o cliente</dt>
            <dd className="tabular font-semibold">{formatarMoeda(orc.totalCentavos)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">Lucro</dt>
            <dd className={`tabular ${orc.lucroCentavos < 0 ? 'text-red-700' : 'text-pinho'}`}>{formatarMoeda(orc.lucroCentavos)}</dd>
          </div>
        </div>
      </dl>

      {(erros.length > 0 || pendencias.length > 0) && (
        <div className="mt-4">
          <Aviso tipo={erros.length ? 'erro' : 'info'}>
            <p className="mb-1 font-medium">{erros.length ? 'Corrija os campos:' : 'Falta para emitir o orçamento (o total acima está incompleto):'}</p>
            <ul className="list-inside list-disc space-y-1">
              {[...erros, ...pendencias].map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Aviso>
        </div>
      )}

      <fieldset disabled={somenteLeitura} className="mt-4 grid gap-3 sm:grid-cols-[8rem_1fr]">
        <Campo rotulo="Validade (dias)" inputMode="numeric" value={o.validadeDias} onChange={(e) => mudar({ validadeDias: e.target.value })} />
        <CampoTexto rotulo="Condições (aparecem na proposta)" rows={2} maxLength={1000} value={o.condicoes} onChange={(e) => mudar({ condicoes: e.target.value })} />
      </fieldset>

      {erro && (
        <div className="mt-4">
          <Aviso>{erro}</Aviso>
        </div>
      )}
      {!somenteLeitura && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          <p className="text-sm text-stone-500">
            {!projeto
              ? 'Salve como projeto para emitir o orçamento.'
              : projeto.alterado
                ? 'Salve a versão antes de emitir: o orçamento fica ligado a uma versão gravada.'
                : `Sai da versão ${projeto.versao} do projeto.`}
          </p>
          <Botao onClick={emitir} carregando={emitindo} disabled={!podeEmitir}>
            Emitir orçamento
          </Botao>
        </div>
      )}
    </Cartao>
  );
}
