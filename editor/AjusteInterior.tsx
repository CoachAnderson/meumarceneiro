import { useEffect, useState, type KeyboardEvent } from "react";
import { formatarMm, lerMm, type Dmm, type ResultadoModulo } from "@marcenaria/core";
import { Botao } from "../components/ui";
import type { Formulario, VaoForm } from "./formulario";
import {
  faixaDe,
  livresDaPrateleira,
  moverDivisoriaNoFormulario,
  moverPrateleiraNoFormulario,
  passo,
  type Alvo,
  type Faixa,
} from "./ajustes";

/**
 * Ajuste do interior a partir da peça clicada: posição da divisória, altura
 * da prateleira e o básico do vão. Tudo opcional: sem mexer aqui, o móvel
 * continua com vãos e prateleiras divididos por igual.
 */
export function AjusteInterior({
  alvo,
  resultado,
  f,
  atualizar,
  somenteLeitura,
}: {
  alvo: Alvo;
  resultado: ResultadoModulo;
  f: Formulario;
  atualizar: (parcial: Partial<Formulario>) => void;
  somenteLeitura: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => setErro(null), [alvo]);

  const mudarVaos = (vaos: VaoForm[]) => {
    setErro(null);
    atualizar({ vaos });
  };
  const mudarVao = (indice: number, parcial: Partial<VaoForm>) =>
    mudarVaos(f.vaos.map((v, i) => (i === indice - 1 ? { ...v, ...parcial } : v)));

  if (alvo.tipo === "divisoria") {
    const faixa = faixaDe(resultado, alvo);
    if (!faixa) return null;
    const esquerda = resultado.vaos[alvo.k - 1]!;
    const direita = resultado.vaos[alvo.k]!;
    const aplicar = (valor: number) => {
      const m = moverDivisoriaNoFormulario(f.vaos, resultado, alvo.k, valor);
      if (m.erro !== null) setErro(m.erro);
      else mudarVaos(m.vaos);
    };
    return (
      <Painel titulo="Posição da divisória" erro={erro}>
        <p className="tabular text-sm text-stone-700">
          Vão {esquerda.indice} (à esquerda): <strong>{formatarMm(esquerda.largura)} mm</strong>
          {esquerda.fixo ? "" : " (automático)"} · Vão {direita.indice} (à direita): <strong>{formatarMm(direita.largura)} mm</strong>
          {direita.fixo ? "" : " (automático)"}
        </p>
        {!somenteLeitura && (
          <>
            <CampoMedida
              rotulo={`Largura do vão ${esquerda.indice} (mm)`}
              atual={faixa.atual}
              faixa={faixa}
              aoAplicar={aplicar}
              aoErro={setErro}
            />
            <Setas
              faixa={faixa}
              aoMudar={aplicar}
              rotulos={{ menos: "Para a esquerda", mais: "Para a direita" }}
              simbolos={{ menos: "←", mais: "→" }}
            />
            <p className="text-xs text-stone-500">
              Também dá para arrastar a divisória no desenho de frente. Só os dois vãos vizinhos mudam.
            </p>
            {f.vaos.some((v) => v.largura.trim()) && (
              <Botao variante="discreto" onClick={() => mudarVaos(f.vaos.map((v) => ({ ...v, largura: "" })))}>
                Dividir todos os vãos por igual
              </Botao>
            )}
          </>
        )}
      </Painel>
    );
  }

  if (alvo.tipo === "prateleira") {
    const faixa = faixaDe(resultado, alvo);
    const livres = livresDaPrateleira(resultado, alvo.vao, alvo.j);
    if (!faixa || !livres) return null;
    const vaoForm = f.vaos[alvo.vao - 1];
    const aplicar = (valor: number) => {
      const m = moverPrateleiraNoFormulario(f.vaos, resultado, alvo.vao, alvo.j, valor);
      if (m.erro !== null) setErro(m.erro);
      else mudarVaos(m.vaos);
    };
    return (
      <Painel titulo="Altura da prateleira" erro={erro}>
        <p className="tabular text-sm text-stone-700">
          Face de baixo a <strong>{formatarMm(faixa.atual)} mm</strong> do fundo interno · livre abaixo {formatarMm(livres.abaixo)} mm · acima{" "}
          {formatarMm(livres.acima)} mm
        </p>
        {!somenteLeitura && (
          <>
            <CampoMedida rotulo="Altura (mm, do fundo interno)" atual={faixa.atual} faixa={faixa} aoAplicar={aplicar} aoErro={setErro} />
            <Setas
              faixa={faixa}
              aoMudar={aplicar}
              rotulos={{ menos: "Descer", mais: "Subir" }}
              simbolos={{ menos: "↓", mais: "↑" }}
            />
            <p className="text-xs text-stone-500">
              {faixa.linhas
                ? "Prateleira regulável: anda de furo em furo (32 mm), onde ficam os pinos. "
                : "Prateleira fixa: a furação da junção acompanha a altura. "}
              Também dá para arrastar no desenho de frente. As outras prateleiras do vão ficam onde estão.
            </p>
            {vaoForm && (vaoForm.alturas ?? []).some((a) => a.trim()) && (
              <Botao variante="discreto" onClick={() => mudarVao(alvo.vao, { alturas: [] })}>
                Voltar ao espaçamento igual neste vão
              </Botao>
            )}
            {vaoForm && <ControlesDoVao indice={alvo.vao} vao={vaoForm} aoMudar={(p) => mudarVao(alvo.vao, p)} />}
          </>
        )}
      </Painel>
    );
  }

  // Área livre do vão.
  const v = resultado.vaos[alvo.vao - 1];
  const vaoForm = f.vaos[alvo.vao - 1];
  if (!v || !vaoForm) return null;
  return (
    <Painel titulo={`Vão ${v.indice}`} erro={erro}>
      <p className="tabular text-sm text-stone-700">
        Largura: <strong>{formatarMm(v.largura)} mm</strong>
        {v.fixo ? " (informada)" : " (automática)"}
      </p>
      {!somenteLeitura && (
        <>
          {resultado.vaos.length > 1 && (
            <div className="flex flex-wrap items-end gap-2">
              <CampoMedida
                rotulo="Largura deste vão (mm)"
                atual={v.largura}
                faixa={null}
                aoAplicar={(valor) => mudarVao(alvo.vao, { largura: formatarMm(valor as Dmm) })}
                aoErro={setErro}
              />
              {v.fixo && (
                <Botao variante="discreto" onClick={() => mudarVao(alvo.vao, { largura: "" })}>
                  Automática
                </Botao>
              )}
            </div>
          )}
          <ControlesDoVao indice={alvo.vao} vao={vaoForm} aoMudar={(p) => mudarVao(alvo.vao, p)} comFrente />
        </>
      )}
    </Painel>
  );
}

function Painel({ titulo, erro, children }: { titulo: string; erro: string | null; children: React.ReactNode }) {
  return (
    <div className="mt-3 space-y-3 rounded-lg bg-white p-4 ring-1 ring-stone-200">
      <p className="text-sm font-semibold text-stone-900">{titulo}</p>
      {children}
      <p aria-live="polite" className="text-sm text-red-700">
        {erro}
      </p>
    </div>
  );
}

/** Campo de medida em mm com Aplicar (ou Enter). */
function CampoMedida({
  rotulo,
  atual,
  faixa,
  aoAplicar,
  aoErro,
}: {
  rotulo: string;
  atual: Dmm;
  faixa: Faixa | null;
  aoAplicar: (valor: number) => void;
  aoErro: (erro: string) => void;
}) {
  const [texto, setTexto] = useState(formatarMm(atual));
  useEffect(() => setTexto(formatarMm(atual)), [atual]);
  const aplicar = () => {
    try {
      aoAplicar(lerMm(texto));
    } catch (e) {
      aoErro(e instanceof Error ? e.message : "Medida inválida.");
    }
  };
  const aoTeclar = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      aplicar();
    }
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block text-sm">
        <span className="mb-1 block text-stone-600">{rotulo}</span>
        <input
          inputMode="decimal"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={aoTeclar}
          className="tabular w-32 rounded-lg border-0 bg-white px-3 py-2 text-sm text-stone-900 ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-amber-500"
        />
      </label>
      <Botao variante="secundario" onClick={aplicar} disabled={texto.trim() === formatarMm(atual)}>
        Aplicar
      </Botao>
      {faixa && (
        <span className="tabular pb-2 text-xs text-stone-500">
          de {formatarMm(faixa.min)} a {formatarMm(faixa.max)} mm
        </span>
      )}
    </div>
  );
}

/** Botões de passo: 1 mm e 10 mm (ou de furo em furo, na prateleira regulável). */
function Setas({
  faixa,
  aoMudar,
  rotulos,
  simbolos,
}: {
  faixa: Faixa;
  aoMudar: (valor: number) => void;
  rotulos: { menos: string; mais: string };
  simbolos: { menos: string; mais: string };
}) {
  const botoes: Array<{ sentido: 1 | -1; grande: boolean }> = faixa.linhas
    ? [
        { sentido: -1, grande: false },
        { sentido: 1, grande: false },
      ]
    : [
        { sentido: -1, grande: true },
        { sentido: -1, grande: false },
        { sentido: 1, grande: false },
        { sentido: 1, grande: true },
      ];
  return (
    <div className="flex flex-wrap gap-2">
      {botoes.map(({ sentido, grande }) => {
        const destino = passo(faixa, sentido, grande);
        const quanto = faixa.linhas ? "1 furo" : grande ? "10 mm" : "1 mm";
        return (
          <button
            key={`${sentido}${grande}`}
            type="button"
            disabled={destino === null}
            onClick={() => destino !== null && aoMudar(destino)}
            aria-label={`${sentido < 0 ? rotulos.menos : rotulos.mais} ${quanto}`}
            className="tabular min-h-10 rounded-lg px-3 text-sm font-medium text-stone-800 ring-1 ring-inset ring-stone-300 hover:bg-stone-50 disabled:opacity-40"
          >
            {sentido < 0 ? `${simbolos.menos} ${quanto}` : `${quanto} ${simbolos.mais}`}
          </button>
        );
      })}
    </div>
  );
}

/** Prateleiras do vão (quantidade e tipo) e, na área do vão, a frente. */
function ControlesDoVao({
  indice,
  vao,
  aoMudar,
  comFrente = false,
}: {
  indice: number;
  vao: VaoForm;
  aoMudar: (parcial: Partial<VaoForm>) => void;
  comFrente?: boolean;
}) {
  const quantidade = /^\d{1,2}$/.test(vao.prateleiras.trim()) ? Number(vao.prateleiras) : 0;
  // Mudou a quantidade: as alturas voltam ao espaçamento igual (as antigas não valem mais).
  const mudarQuantidade = (n: number) => aoMudar({ prateleiras: String(n), alturas: [] });
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-stone-100 pt-3">
      {vao.frente !== "gavetas" && (
        <div className="text-sm">
          <span className="mb-1 block text-stone-600">Prateleiras no vão {indice}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Uma prateleira a menos"
              disabled={quantidade <= 0}
              onClick={() => mudarQuantidade(quantidade - 1)}
              className="min-h-10 min-w-10 rounded-lg ring-1 ring-inset ring-stone-300 hover:bg-stone-50 disabled:opacity-40"
            >
              −
            </button>
            <span className="tabular w-6 text-center font-medium">{quantidade}</span>
            <button
              type="button"
              aria-label="Uma prateleira a mais"
              disabled={quantidade >= 20}
              onClick={() => mudarQuantidade(quantidade + 1)}
              className="min-h-10 min-w-10 rounded-lg ring-1 ring-inset ring-stone-300 hover:bg-stone-50 disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>
      )}
      {vao.frente !== "gavetas" && (
        <label className="block text-sm">
          <span className="mb-1 block text-stone-600">Tipo</span>
          <select
            value={vao.tipo}
            onChange={(e) => aoMudar({ tipo: e.target.value === "regulavel" ? "regulavel" : "fixa", alturas: [] })}
            className="rounded-lg border-0 bg-white py-2 pr-8 pl-3 text-sm ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-amber-500"
          >
            <option value="fixa">Fixa</option>
            <option value="regulavel">Regulável</option>
          </select>
        </label>
      )}
      {comFrente && (
        <label className="block text-sm">
          <span className="mb-1 block text-stone-600">Frente</span>
          <select
            value={vao.frente}
            onChange={(e) => aoMudar({ frente: e.target.value as VaoForm["frente"] })}
            className="rounded-lg border-0 bg-white py-2 pr-8 pl-3 text-sm ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-amber-500"
          >
            <option value="aberto">Aberto</option>
            <option value="porta">Porta</option>
            <option value="gavetas">Gavetas</option>
          </select>
        </label>
      )}
    </div>
  );
}
