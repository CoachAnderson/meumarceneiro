import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { codigosDasPecas, descreverBordas, descreverUsinagem, dmm, formatarMm, modeloMontagem } from '@marcenaria/core';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Campo, Cartao } from '../components/ui';
import { buscarFerragens, buscarFitas, chaveFerragens, chaves } from '../lib/catalogo';
import { mensagemDeErro } from '../lib/erros';
import { metros } from '../lib/exportar';
import { chavesProducao, criarOrdem, LIMITE_DADOS_ORDEM, type Consumo, type DadosOrdem, type EtiquetaOrdem } from '../lib/producao';
import { NOME_MATERIAL } from './estilo';
import { descricaoFerragem, linhasDeFerragem } from './ferragens';
import type { Formulario } from './formulario';
import type { ProjetoDoOrcamento } from './Orcamento';
import type { ResumoPlano } from './PlanoCorte';
import type { Calculo } from './useCalculo';

const medida = (c: number, l: number) => `${formatarMm(dmm(c))} × ${formatarMm(dmm(l))}`;

/** Cria a ordem de produção: fotografia das peças, do plano de corte e do que ele consome. */
export function EnviarProducao({ f, calculo, plano, projeto }: { f: Formulario; calculo: Calculo; plano: ResumoPlano | null; projeto?: ProjetoDoOrcamento }) {
  const { empresa } = useEmpresaAtual();
  const navegar = useNavigate();
  const queryClient = useQueryClient();
  const fitas = useQuery({ queryKey: chaves.fitas(empresa.id), queryFn: () => buscarFitas(empresa.id) });
  const catalogo = useQuery({ queryKey: chaveFerragens(empresa.id), queryFn: () => buscarFerragens(empresa.id) });
  const [prazo, setPrazo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { lista } = calculo;
  const motivo = !projeto
    ? 'Salve como projeto para enviar à produção.'
    : projeto.alterado
      ? 'Salve a versão antes: a ordem fica ligada a uma versão gravada.'
      : !lista || !plano
        ? 'O plano de corte precisa estar completo (materiais cadastrados, com formato de chapa).'
        : null;

  function montar(): DadosOrdem | null {
    if (!lista || !plano) return null;
    const corte = new Map(plano.grupos.flatMap((g) => g.pecas.map((p) => [p.id, p] as const)));
    const consumo: Consumo = { chapas: [], retalhos: [], fitas: [], ferragens: [], sobras: [] };
    for (const g of plano.grupos) {
      for (const ch of g.chapas) {
        const destino = ch.tipo === 'chapa' ? consumo.chapas : consumo.retalhos;
        const existente = destino.find((x) => x.id === ch.chapaId);
        if (existente) existente.quantidade++;
        else destino.push({ id: ch.chapaId, quantidade: 1, nome: `${g.material} · ${ch.tipo === 'chapa' ? 'chapa' : 'retalho'} ${medida(ch.comprimento, ch.largura)}` });
        // Sobras aproveitáveis, nos mesmos eixos da chapa (o veio se mantém).
        for (const s of ch.retalhos) {
          if (s.dx < 500 || s.dy < 500) continue;
          const igual = consumo.sobras.find((x) => x.material_id === g.materialId && x.comprimento_dmm === s.dx && x.largura_dmm === s.dy);
          if (igual) igual.quantidade++;
          else consumo.sobras.push({ material_id: g.materialId, comprimento_dmm: s.dx, largura_dmm: s.dy, quantidade: 1, nome: `${g.material} · ${medida(s.dx, s.dy)}` });
        }
      }
    }
    const fita = (fitas.data ?? []).find((x) => x.id === f.corte.fita);
    if (fita && lista.fitaComSobraDmm > 0) consumo.fitas.push({ id: fita.id, dmm: lista.fitaComSobraDmm, nome: fita.nome });
    const ferragens = linhasDeFerragem(calculo, f, catalogo.data ?? []);
    for (const l of ferragens) if (l.escolhido) consumo.ferragens.push({ id: l.escolhido.id, quantidade: l.n.quantidade, nome: l.escolhido.nome });

    // Uma etiqueta por peça a cortar, de cada módulo.
    const resultado = calculo.resultado;
    const codigos = codigosDasPecas(lista.itens);
    const itemDe = new Map(lista.itens.map((i) => [i.codigo, i]));
    const bordas = new Map(calculo.pecas.map((p) => [p.id, p.bordas]));
    const etiquetas: EtiquetaOrdem[] = [];
    if (resultado) {
      for (let unidade = 1; unidade <= calculo.qtdModulos; unidade++) {
        for (const c of resultado.componentes) {
          const codigo = codigos.get(c.id);
          if (c.comprado || !codigo) continue;
          const b = bordas.get(c.id);
          etiquetas.push({
            componente: c.id,
            unidade,
            codigo,
            nome: c.nome,
            fita: !!b && Object.values(b).some(Boolean),
            furo: (itemDe.get(codigo)?.usinagens.length ?? 0) > 0,
          });
        }
      }
    }

    const dados: DadosOrdem = {
      quantidadeModulos: calculo.qtdModulos,
      itens: lista.itens.map((i) => {
        const c = corte.get(i.codigo);
        return {
          codigo: i.codigo,
          nome: i.nome,
          material: `${NOME_MATERIAL[i.material]} ${formatarMm(i.espessura)} mm`,
          quantidade: i.quantidade,
          acabada: medida(i.comprimento, i.largura),
          corte: c ? medida(c.comprimento, c.largura) : medida(i.comprimento, i.largura),
          fita: descreverBordas(i.bordas),
          usinagem: i.usinagens.map(descreverUsinagem).join('; '),
        };
      }),
      grupos: plano.grupos.map((g) => ({ material: g.material, veio: g.veio, pecas: g.pecas, chapas: g.chapas })),
      ferragens: ferragens.map((l) => ({ descricao: descricaoFerragem(l.n), quantidade: l.n.quantidade, item: l.escolhido?.nome ?? null })),
      consumo,
      etiquetas,
    };
    if (resultado?.valido) {
      const comModelo = { ...dados, modelo: modeloMontagem(resultado, codigos) };
      if (JSON.stringify(comModelo).length <= LIMITE_DADOS_ORDEM) return comModelo;
    }
    return dados;
  }

  const previa = motivo ? null : montar();
  const semBaixa: string[] = [];
  if (previa) {
    if (lista && lista.fitaComSobraDmm > 0 && previa.consumo.fitas.length === 0) semBaixa.push('a fita (escolha a fita do catálogo no plano de corte)');
    if (previa.ferragens.some((x) => !x.item)) semBaixa.push('ferragens sem item no catálogo');
  }

  async function enviar() {
    if (!projeto || !previa) return;
    setEnviando(true);
    setErro(null);
    try {
      const id = await criarOrdem({
        empresaId: empresa.id,
        projetoId: projeto.id,
        projetoVersao: projeto.versao,
        projetoNome: projeto.nome,
        clienteNome: projeto.clienteNome,
        dados: previa,
        prazo: prazo || null,
        observacao: observacao.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: chavesProducao.lista(empresa.id) });
      navegar(`/producao/${id}`);
    } catch (e) {
      setErro(mensagemDeErro(e));
      setEnviando(false);
    }
  }

  return (
    <Cartao titulo="Produção" descricao="A ordem leva para a oficina as peças, o plano de corte e a lista do que sai do estoque. Não leva preços.">
      {previa && (
        <dl className="mb-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-stone-500">Chapas</dt>
            <dd className="font-medium">
              {previa.consumo.chapas.reduce((s, x) => s + x.quantidade, 0)}
              {previa.consumo.retalhos.length > 0 && <span className="font-normal text-stone-500"> + {previa.consumo.retalhos.reduce((s, x) => s + x.quantidade, 0)} retalho(s)</span>}
            </dd>
          </div>
          <div>
            <dt className="text-stone-500">Fita</dt>
            <dd className="font-medium">{previa.consumo.fitas[0] ? `${metros(dmm(previa.consumo.fitas[0].dmm))} m` : '–'}</dd>
          </div>
          <div>
            <dt className="text-stone-500">Sobras que viram retalho</dt>
            <dd className="font-medium">{previa.consumo.sobras.reduce((s, x) => s + x.quantidade, 0)}</dd>
          </div>
        </dl>
      )}
      {semBaixa.length > 0 && (
        <div className="mb-4">
          <Aviso tipo="info">A ordem pode ser criada, mas a baixa de estoque não vai incluir {semBaixa.join(' nem ')}.</Aviso>
        </div>
      )}
      {erro && (
        <div className="mb-4">
          <Aviso>{erro}</Aviso>
        </div>
      )}
      <div className="grid items-end gap-3 sm:grid-cols-[10rem_1fr_auto]">
        <Campo rotulo="Prazo" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        <Campo rotulo="Observação para a oficina" value={observacao} maxLength={1000} onChange={(e) => setObservacao(e.target.value)} />
        <Botao onClick={enviar} carregando={enviando} disabled={!previa}>
          Enviar para produção
        </Botao>
      </div>
      {motivo && <p className="mt-3 text-sm text-stone-500">{motivo}</p>}
    </Cartao>
  );
}
