"""Gera os arquivos da marca Meu Marceneiro (SVG com texto em curvas)."""
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import json, os, sys

SAIDA = sys.argv[1]
os.makedirs(SAIDA, exist_ok=True)

COR = {
    'nogueira': '#3B2416',
    'nogueira_escura': '#2A1A10',
    'freijo': '#DB8A35',
    'freijo_escuro': '#C2702A',
    'creme': '#F6EFE6',
    'pinho': '#2F6B57',
}

def texto(caminho_fonte, s, tamanho, x, y_base, cor):
    f = TTFont(caminho_fonte)
    gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f['head'].unitsPerEm
    esc = tamanho / upm
    # Kerning simples via tabela GPOS não é trivial; usa avanço + kern par a par se houver 'kern'.
    caminhos = []
    cx = x
    for ch in s:
        nome = cmap.get(ord(ch))
        g = gs[nome]
        pen = SVGPathPen(gs)
        tp = TransformPen(pen, (esc, 0, 0, -esc, cx, y_base))
        g.draw(tp)
        d = pen.getCommands()
        if d: caminhos.append(d)
        cx += g.width * esc
    return f'<path fill="{cor}" d="{" ".join(caminhos)}"/>', cx

def simbolo(fundo, perna, peca, x=0, y=0, s=64, rx=14):
    # M de marceneiro: duas laterais (pernas) e três peças descendo em V, com folga de serra entre elas.
    cols = [(8, 0, 1), (5.2, 0.0, .38), (5.2, .26, .64), (5.2, 0.0, .38), (8, 0, 1)]
    gap = 2.2; top = 14; H = 36
    tot = sum(c[0] for c in cols) + gap * 4
    cx = (s - tot) / 2
    k = s / 64
    r = []
    if fundo:
        r.append(f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="{rx*k:.2f}" fill="{fundo}"/>')
    for i, (w, a, b) in enumerate(cols):
        cor = perna if i in (0, 4) else peca
        r.append(f'<rect x="{x + cx*k:.2f}" y="{y + (top + a*H)*k:.2f}" width="{w*k:.2f}" height="{(b-a)*H*k:.2f}" rx="{1.1*k:.2f}" fill="{cor}"/>')
        cx += w + gap
    return ''.join(r)

def svg(w, h, corpo, titulo):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" role="img" aria-label="{titulo}"><title>{titulo}</title>{corpo}</svg>\n'

MED = '/usr/share/fonts/opentype/inter/InterDisplay-Medium.otf'
BOLD = '/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf'

def horizontal(fundo_simb, perna, peca, cor_meu, cor_nome):
    corpo = simbolo(fundo_simb, perna, peca, 0, 0, 64)
    t1, x1 = texto(MED, 'Meu', 30, 80, 43, cor_meu)
    t2, x2 = texto(BOLD, 'Marceneiro', 30, x1 + 8, 43, cor_nome)
    return svg(x2 + 2, 64, corpo + t1 + t2, 'Meu Marceneiro')

arquivos = {
    'simbolo.svg': svg(64, 64, simbolo(COR['nogueira'], COR['creme'], COR['freijo']), 'Meu Marceneiro'),
    'simbolo-claro.svg': svg(64, 64, simbolo(COR['creme'], COR['nogueira'], COR['freijo']), 'Meu Marceneiro'),
    'simbolo-sem-fundo.svg': svg(64, 64, simbolo(None, COR['nogueira'], COR['freijo']), 'Meu Marceneiro'),
    'logo-horizontal.svg': horizontal(COR['nogueira'], COR['creme'], COR['freijo'], COR['freijo_escuro'], COR['nogueira']),
    'logo-horizontal-fundo-escuro.svg': horizontal(COR['creme'], COR['nogueira'], COR['freijo'], COR['freijo'], COR['creme']),
}
for nome, conteudo in arquivos.items():
    open(os.path.join(SAIDA, nome), 'w').write(conteudo)
json.dump(COR, open(os.path.join(SAIDA, 'cores.json'), 'w'), indent=2)
print('ok', list(arquivos))
