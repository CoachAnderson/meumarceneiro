import type { CSSProperties } from 'react';
import { CodigoQR } from '../editor/VerNoAmbiente';
import { linkDaPeca, type PecaOrdem } from '../lib/oficina';
import { numeroOrdem, type Ordem } from '../lib/producao';

/** Tamanhos comuns de etiqueta de impressora térmica (largura × altura, mm). */
export const TAMANHOS = {
  '50x25': { largura: 50, altura: 25, rotulo: '50 × 25 mm' },
  '60x40': { largura: 60, altura: 40, rotulo: '60 × 40 mm' },
  '100x50': { largura: 100, altura: 50, rotulo: '100 × 50 mm' },
} as const;
export type TamanhoEtiqueta = keyof typeof TAMANHOS;

const linha: CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

/** Uma etiqueta: QR com o link da peça, código grande, nome, medida de corte, material e fita. */
export function Etiqueta({ peca, ordem, tamanho }: { peca: PecaOrdem; ordem: Ordem; tamanho: TamanhoEtiqueta }) {
  const t = TAMANHOS[tamanho];
  const item = ordem.dados.itens.find((i) => i.codigo === peca.codigo);
  const pequena = tamanho === '50x25';
  const grande = tamanho === '100x50';
  const margem = pequena ? 1.2 : 2;
  const qr = t.altura - 2 * margem - (pequena ? 0 : 3.5);
  const varios = ordem.dados.quantidadeModulos > 1;
  const rodape = `${numeroOrdem(ordem.numero)} · nº ${peca.seq}${varios ? ` · mód. ${peca.unidade}/${ordem.dados.quantidadeModulos}` : ''}`;
  const pt = (n: number) => `${n}pt`;

  return (
    <div
      className="etiqueta"
      style={{
        width: `${t.largura}mm`,
        height: `${t.altura}mm`,
        padding: `${margem}mm`,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        color: '#000',
        fontFamily: 'system-ui, sans-serif',
        overflow: 'hidden',
        lineHeight: 1.15,
      }}
    >
      <div style={{ display: 'flex', gap: `${margem}mm`, flex: 1, minHeight: 0 }}>
        <div style={{ width: `${qr}mm`, height: `${qr}mm`, flexShrink: 0 }} className="etiqueta-qr">
          <CodigoQR texto={linkDaPeca(peca.id)} tamanho="100%" />
        </div>
        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: pequena ? '0.3mm' : '0.6mm' }}>
          <div style={{ fontSize: pt(pequena ? 13 : grande ? 24 : 17), fontWeight: 800, letterSpacing: '0.02em' }}>{peca.codigo}</div>
          <div style={{ ...linha, fontSize: pt(pequena ? 6.5 : grande ? 10 : 7.5), fontWeight: 600, whiteSpace: pequena ? 'nowrap' : 'normal', maxHeight: pequena ? undefined : '2.3em' }}>{peca.nome}</div>
          {item && <div style={{ fontSize: pt(pequena ? 7 : grande ? 11 : 8.5), fontWeight: 700 }}>{item.corte}</div>}
          {item && !pequena && <div style={{ ...linha, fontSize: pt(grande ? 8.5 : 6.5) }}>{item.material}</div>}
          {item && !pequena && item.fita !== '–' && item.fita && <div style={{ ...linha, fontSize: pt(grande ? 8 : 6) }}>Fita: {item.fita}</div>}
          {grande && <div style={{ ...linha, fontSize: pt(8) }}>{ordem.projeto_nome}{ordem.cliente_nome ? ` · ${ordem.cliente_nome}` : ''}</div>}
          {pequena && <div style={{ ...linha, fontSize: pt(5.5) }}>{rodape}</div>}
        </div>
      </div>
      {!pequena && <div style={{ ...linha, fontSize: pt(grande ? 7.5 : 6), marginTop: '0.8mm', borderTop: '0.2mm solid #000', paddingTop: '0.6mm' }}>{rodape}{!grande ? ` · ${ordem.projeto_nome}` : ''}</div>}
    </div>
  );
}

/** Folhas para imprimir: uma etiqueta por página, no tamanho exato da etiqueta. */
export function EtiquetasParaImprimir({ pecas, ordem, tamanho }: { pecas: readonly PecaOrdem[]; ordem: Ordem; tamanho: TamanhoEtiqueta }) {
  const t = TAMANHOS[tamanho];
  return (
    <>
      <style>{`
        @media print {
          @page { size: ${t.largura}mm ${t.altura}mm; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .area-impressao .etiqueta { break-after: page; page-break-after: always; }
          .area-impressao .etiqueta:last-child { break-after: auto; page-break-after: auto; }
          .area-impressao .etiqueta-qr svg { width: 100% !important; height: 100% !important; max-height: none !important; margin: 0 !important; }
        }
      `}</style>
      {pecas.map((p) => (
        <Etiqueta key={p.id} peca={p} ordem={ordem} tamanho={tamanho} />
      ))}
    </>
  );
}
