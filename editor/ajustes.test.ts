import { describe, expect, it } from "vitest";
import { calcularModulo, dmm, mm, modeloPadrao, type EntradaModulo } from "@marcenaria/core";
import { ajustarValor, alvoDe, faixaDe, livresDaPrateleira, moverDivisoriaNoFormulario, moverPrateleiraNoFormulario, passo } from "./ajustes";
import type { VaoForm } from "./formulario";

/**
 * Armário 600 × 700 × 550, MDF 18: largura interna 564 mm, altura interna 664 mm.
 * Duas prateleiras automáticas: 664 − 2 × 18 = 628 → 209,4 + 209,3 + 209,3 →
 * alturas 209,4 e 209,4 + 18 + 209,3 = 436,7 mm.
 */
const REF: EntradaModulo = { L: mm(600), A: mm(700), P: mm(550), espessuraEstrutura: mm(18), espessuraFundo: mm(6) };
const modelo = modeloPadrao("tampo_base_entre_laterais", "fundo_canal");
const vao = (extra: Partial<VaoForm> = {}): VaoForm => ({ largura: "", prateleiras: "2", tipo: "fixa", frente: "aberto", portas: "1", lado: "esquerda", gavetas: "3", ...extra });
const comPrateleiras = (tipo: "fixa" | "regulavel") => calcularModulo(modelo, { ...REF, interior: { divisorias: 0, prateleiras: { quantidade: 2, tipo } } });

describe("alvoDe", () => {
  it("reconhece divisória, prateleira (j a partir de 0) e área do vão", () => {
    expect(alvoDe("divisoria_2")).toEqual({ tipo: "divisoria", k: 2 });
    expect(alvoDe("prateleira_v3_2")).toEqual({ tipo: "prateleira", vao: 3, j: 1 });
    expect(alvoDe("vao_1")).toEqual({ tipo: "vao", vao: 1 });
    expect(alvoDe("lateral_esquerda")).toBeNull();
    expect(alvoDe(null)).toBeNull();
  });
});

describe("prateleira", () => {
  it("fixa: vai para a altura digitada, a outra fica onde estava", () => {
    const r = comPrateleiras("fixa");
    expect(faixaDe(r, { tipo: "prateleira", vao: 1, j: 1 })).toEqual({ atual: dmm(4367), min: dmm(2774), max: dmm(5960), linhas: null });
    const m = moverPrateleiraNoFormulario([vao()], r, 1, 1, 5000);
    expect(m.erro).toBeNull();
    expect(m.vaos![0]!.alturas).toEqual(["209,4", "500"]);
    expect(livresDaPrateleira(r, 1, 0)).toEqual({ abaixo: dmm(2094), acima: dmm(2093) });
  });

  it("fixa: fora da faixa avisa com os limites", () => {
    const m = moverPrateleiraNoFormulario([vao()], comPrateleiras("fixa"), 1, 1, 6200);
    expect(m.erro).toBe("A prateleira precisa ficar entre 277,4 e 596 mm.");
  });

  it("regulável: anda de furo em furo (margem 96 mm, passo 32 mm)", () => {
    const r = comPrateleiras("regulavel");
    const faixa = faixaDe(r, { tipo: "prateleira", vao: 1, j: 0 })!;
    // 300 mm: entre os furos de 288 e 320 mm, o mais perto é 288.
    expect(ajustarValor(faixa, 3000)).toBe(dmm(2880));
    expect(moverPrateleiraNoFormulario([vao({ tipo: "regulavel" })], r, 1, 0, 3000).vaos![0]!.alturas).toEqual(["288", "436,7"]);
    // Subir a partir de 209,4: o próximo furo é 224 (96 + 4 × 32).
    expect(passo(faixa, 1, false)).toBe(dmm(2240));
    expect(passo(faixa, -1, false)).toBe(dmm(1920));
  });

  it("fixa: os botões andam 1 mm (ou 10 mm) a partir do mm inteiro", () => {
    const faixa = faixaDe(comPrateleiras("fixa"), { tipo: "prateleira", vao: 1, j: 0 })!;
    expect(passo(faixa, 1, false)).toBe(dmm(2100));
    expect(passo(faixa, -1, false)).toBe(dmm(2090));
    expect(passo(faixa, 1, true)).toBe(dmm(2190));
  });
});

describe("divisória", () => {
  it("o vão da esquerda fica com a largura pedida; o da direita continua automático", () => {
    const r = calcularModulo(modelo, { ...REF, interior: { divisorias: 1 } });
    const m = moverDivisoriaNoFormulario([vao(), vao()], r, 1, 2000);
    expect(m.vaos!.map((v) => v.largura)).toEqual(["200", ""]);
    // E o motor confirma: 200 + 346 mm.
    const depois = calcularModulo(modelo, { ...REF, interior: { divisorias: 1, largurasVaos: [dmm(2000), null] } });
    expect(depois.vaos.map((v) => v.largura)).toEqual([dmm(2000), dmm(3460)]);
  });

  it("vão menor que 50 mm não passa", () => {
    const r = calcularModulo(modelo, { ...REF, interior: { divisorias: 1 } });
    expect(moverDivisoriaNoFormulario([vao(), vao()], r, 1, 400).erro).toBe("O vão 1 precisa ficar entre 50 e 496 mm.");
  });
});
