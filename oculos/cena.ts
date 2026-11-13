/**
 * A cena dos óculos em three.js: o móvel (com portas e gavetas que abrem), o
 * cômodo da medição e um menu flutuante. Usada pelos dois modos: óculos de
 * realidade virtual/mista (WebXR) e óculos de encaixar o celular.
 */
import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Group,
  HemisphereLight,
  AmbientLight,
  DirectionalLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  type Material,
  type Object3D,
} from 'three';
import type { CenaImersiva, ComodoImersivo, MaterialComponente, TipoPonto } from '@marcenaria/core';
import { NOME_PONTO } from '@marcenaria/core';
import { ESTILO } from '../editor/estilo';
import { plantaDoComodo } from './geometria';

// ---------------------------------------------------------------------------
// Acabamentos (cores ilustrativas)
// ---------------------------------------------------------------------------

export interface Acabamento {
  nome: string;
  /** null = cores do projeto (as mesmas do editor). */
  caixa: string | null;
  frente: string | null;
}

export const ACABAMENTOS: readonly Acabamento[] = [
  { nome: 'Cores do projeto', caixa: null, frente: null },
  { nome: 'Branco', caixa: '#f1efeb', frente: '#f7f6f3' },
  { nome: 'Branco e madeirado', caixa: '#f1efeb', frente: '#b98552' },
  { nome: 'Madeirado', caixa: '#c29a6b', frente: '#a8764b' },
  { nome: 'Grafite e madeirado', caixa: '#4b4a48', frente: '#b98552' },
  { nome: 'Grafite', caixa: '#4b4a48', frente: '#5b5a57' },
];

const COR_FUNDO = '#ece6dc';
const COR_GAVETA = '#efe3d3';

// ---------------------------------------------------------------------------
// Texto em placas (CanvasTexture)
// ---------------------------------------------------------------------------

export function placaDeTexto(texto: string, opcoes: { largura?: number; fundo?: string; cor?: string; fonte?: number; alturaPx?: number } = {}): Mesh {
  const larguraPx = 512;
  const alturaPx = opcoes.alturaPx ?? 128;
  const canvas = document.createElement('canvas');
  canvas.width = larguraPx;
  canvas.height = alturaPx;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    if (opcoes.fundo) {
      ctx.fillStyle = opcoes.fundo;
      const r = 28;
      ctx.beginPath();
      ctx.roundRect(4, 4, larguraPx - 8, alturaPx - 8, r);
      ctx.fill();
    }
    ctx.fillStyle = opcoes.cor ?? '#2a1a10';
    let tamanho = opcoes.fonte ?? 44;
    ctx.font = `600 ${tamanho}px Inter, system-ui, sans-serif`;
    // Diminui até caber.
    while (ctx.measureText(texto).width > larguraPx - 48 && tamanho > 18) {
      tamanho -= 2;
      ctx.font = `600 ${tamanho}px Inter, system-ui, sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, larguraPx / 2, alturaPx / 2 + 2);
  }
  const textura = new CanvasTexture(canvas);
  textura.colorSpace = SRGBColorSpace;
  const largura = opcoes.largura ?? 0.36;
  const placa = new Mesh(new PlaneGeometry(largura, (largura * alturaPx) / larguraPx), new MeshBasicMaterial({ map: textura, transparent: true, depthWrite: false }));
  placa.name = texto;
  return placa;
}

// ---------------------------------------------------------------------------
// Móvel
// ---------------------------------------------------------------------------

interface Movel {
  grupo: Group;
  /** Para cada peça que mexe: índice do movimento. */
  movimentoDa: Map<Object3D, number>;
  movimentos: Array<{ alvo: number; t: number; aplicar: (t: number) => void }>;
  materiais: { caixa: MeshStandardMaterial[]; frente: MeshStandardMaterial[] };
  coresOriginais: Map<MeshStandardMaterial, string>;
  largura: number;
  altura: number;
  profundidade: number;
}

const BORDA = new LineBasicMaterial({ color: '#3b2416', transparent: true, opacity: 0.35 });
const BORDA_DESTAQUE = new LineBasicMaterial({ color: '#eb6834' });

function montarMovel(cena: CenaImersiva): Movel {
  const grupo = new Group();
  grupo.name = 'movel';
  const materiais = { caixa: [] as MeshStandardMaterial[], frente: [] as MeshStandardMaterial[] };
  const coresOriginais = new Map<MeshStandardMaterial, string>();
  const porCor = new Map<string, MeshStandardMaterial>();
  const material = (papelCor: string, tipo: MaterialComponente) => {
    const chave = `${tipo}:${papelCor}`;
    let m = porCor.get(chave);
    if (!m) {
      m = new MeshStandardMaterial({ color: papelCor, roughness: 0.7, metalness: 0 });
      porCor.set(chave, m);
      coresOriginais.set(m, papelCor);
      if (tipo === 'estrutura') materiais.caixa.push(m);
      if (tipo === 'frente') materiais.frente.push(m);
    }
    return m;
  };

  const malhas = new Map<string, Mesh>();
  for (const p of cena.pecas) {
    const cor = p.material === 'fundo' ? COR_FUNDO : p.material === 'gaveta' ? COR_GAVETA : ESTILO[p.papel].fill;
    const geo = new BoxGeometry(...p.tamanho);
    const malha = new Mesh(geo, material(cor, p.material));
    malha.name = p.id;
    malha.position.set(...p.centro);
    malha.add(new LineSegments(new EdgesGeometry(geo), BORDA));
    grupo.add(malha);
    malhas.set(p.id, malha);
  }

  const movimentoDa = new Map<Object3D, number>();
  const movimentos: Movel['movimentos'] = [];
  cena.movimentos.forEach((v, i) => {
    const pecas = v.pecas.map((id) => malhas.get(id)).filter((m): m is Mesh => !!m);
    if (pecas.length === 0) return;
    const eixo = new Group();
    if (v.tipo === 'porta') eixo.position.set(v.pivo[0], 0, v.pivo[1]);
    grupo.add(eixo);
    for (const m of pecas) {
      // Passa a peça para dentro do eixo sem tirá-la do lugar.
      m.position.set(m.position.x - eixo.position.x, m.position.y, m.position.z - eixo.position.z);
      eixo.add(m);
      movimentoDa.set(m, i);
    }
    const aplicar =
      v.tipo === 'porta'
        ? (t: number) => {
            eixo.rotation.y = (v.sentido * v.angulo * Math.PI * t) / 180;
          }
        : (t: number) => {
            eixo.position.z = v.curso * t;
          };
    movimentos[i] = { alvo: 0, t: 0, aplicar };
  });

  // Sombra suave no chão, para o móvel não parecer flutuando.
  const [L, A, P] = cena.dimensoes;
  grupo.add(sombra(L, P));
  return { grupo, movimentoDa, movimentos, materiais, coresOriginais, largura: L, altura: A, profundidade: P };
}

function sombra(L: number, P: number): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const m = new Mesh(new PlaneGeometry(L * 1.35, P * 1.6), new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 0.002, P / 2);
  m.name = 'sombra';
  m.renderOrder = -1;
  return m;
}

// ---------------------------------------------------------------------------
// Cômodo
// ---------------------------------------------------------------------------

const COR_PONTO: Partial<Record<TipoPonto, string>> = {
  tomada: '#ffffff',
  interruptor: '#ffffff',
  agua: '#3a7bd5',
  esgoto: '#7a7a7a',
  gas: '#e0b100',
  janela: '#a9d4f2',
  porta: '#8a6a4a',
  ar_condicionado: '#f4f4f4',
  viga: '#d8d2c8',
  pilar: '#d8d2c8',
  rodape: '#efeae2',
  outro: '#eb6834',
};

/** Parede da linha `de`→`ate`, com a face interna na linha medida e a espessura para o lado oposto a `dentro`. */
function parede(de: { x: number; z: number }, ate: { x: number; z: number }, altura: number, material: Material, dentro: { x: number; z: number }): Mesh {
  const dx = ate.x - de.x;
  const dz = ate.z - de.z;
  const comprimento = Math.hypot(dx, dz);
  const espessura = 0.1;
  const m = new Mesh(new BoxGeometry(comprimento, altura, espessura), material);
  const meio = { x: (de.x + ate.x) / 2, z: (de.z + ate.z) / 2 };
  let nx = -dz / comprimento;
  let nz = dx / comprimento;
  // Normal apontando para fora do cômodo.
  if (nx * (dentro.x - meio.x) + nz * (dentro.z - meio.z) > 0) {
    nx = -nx;
    nz = -nz;
  }
  m.position.set(meio.x + (nx * espessura) / 2, altura / 2, meio.z + (nz * espessura) / 2);
  m.rotation.y = -Math.atan2(dz, dx);
  return m;
}

function montarComodo(c: ComodoImersivo, movel: Movel): { grupo: Group; ilustrativo: string | null } {
  const grupo = new Group();
  grupo.name = 'comodo';
  const pl = plantaDoComodo(c, movel.largura, movel.altura);
  const materialParede = new MeshStandardMaterial({ color: '#f3efe8', roughness: 0.95 });
  const materialLateral = new MeshStandardMaterial({ color: '#ebe5db', roughness: 0.95 });

  // Piso: o quadrilátero entre a parede do móvel e o fim das laterais.
  const forma = new Shape();
  forma.moveTo(pl.esquerdo.x, pl.esquerdo.z);
  forma.lineTo(pl.direito.x, pl.direito.z);
  forma.lineTo(pl.fimDireito.x, pl.fimDireito.z);
  forma.lineTo(pl.fimEsquerdo.x, pl.fimEsquerdo.z);
  forma.closePath();
  const piso = new Mesh(new ShapeGeometry(forma), new MeshStandardMaterial({ color: '#cdbfae', roughness: 0.9, side: DoubleSide }));
  // A forma está em x/y; deitando (+90° em x) o y vira z.
  piso.rotation.x = Math.PI / 2;
  piso.name = 'piso';
  grupo.add(piso);

  const dentro = { x: (pl.esquerdo.x + pl.direito.x + pl.fimEsquerdo.x + pl.fimDireito.x) / 4, z: (pl.fimEsquerdo.z + pl.fimDireito.z) / 4 };
  grupo.add(parede(pl.direito, pl.esquerdo, pl.altura, materialParede, dentro));
  grupo.add(parede(pl.esquerdo, pl.fimEsquerdo, pl.altura, materialLateral, dentro));
  grupo.add(parede(pl.fimDireito, pl.direito, pl.altura, materialLateral, dentro));
  if (!pl.ilustrativo.altura) {
    const teto = piso.clone();
    teto.material = new MeshStandardMaterial({ color: '#faf8f4', roughness: 1, side: DoubleSide });
    teto.position.y = pl.altura;
    grupo.add(teto);
  }

  // Pontos marcados na parede.
  for (const q of c.pontos) {
    const x = pl.esquerdo.x + q.x;
    const cor = COR_PONTO[q.tipo] ?? '#eb6834';
    const material = new MeshStandardMaterial({ color: cor, roughness: 0.6, transparent: q.tipo === 'janela', opacity: q.tipo === 'janela' ? 0.75 : 1 });
    let malha: Mesh;
    if (q.largura === 0 && q.altura === 0) {
      // Pontual: plaquinha de tomada ou cano.
      const tomada = q.tipo === 'tomada' || q.tipo === 'interruptor';
      malha = tomada ? new Mesh(new BoxGeometry(0.08, 0.12, 0.012), material) : new Mesh(new CircleGeometry(q.tipo === 'esgoto' ? 0.05 : 0.025, 24), material);
      malha.position.set(x, q.y, tomada ? 0.006 : 0.004);
    } else {
      const fundo = q.saliencia > 0 ? q.saliencia : ['viga', 'pilar', 'ar_condicionado', 'rodape'].includes(q.tipo) ? 0.02 : 0.01;
      const largura = Math.max(q.largura, 0.02);
      const altura = Math.max(q.altura, 0.02);
      malha = new Mesh(new BoxGeometry(largura, altura, fundo), material);
      malha.position.set(x + largura / 2, q.y + altura / 2, fundo / 2);
    }
    malha.name = `ponto:${q.tipo}`;
    grupo.add(malha);
    if (q.tipo !== 'rodape') {
      const rotulo = placaDeTexto(NOME_PONTO[q.tipo], { largura: 0.22, fundo: 'rgba(255,255,255,0.85)', fonte: 40, alturaPx: 96 });
      const topo = q.largura === 0 && q.altura === 0 ? q.y + 0.1 : q.y + q.altura + 0.06;
      rotulo.position.set(x + (q.largura || 0) / 2, Math.min(topo, pl.altura - 0.08), 0.03);
      grupo.add(rotulo);
    }
  }

  const faltou = [pl.ilustrativo.profundidade && 'profundidade', pl.ilustrativo.altura && 'altura', pl.ilustrativo.cantos && 'esquadro dos cantos'].filter(Boolean) as string[];
  const ilustrativo = faltou.length ? `Sem medida de ${faltou.join(', ')}: essa parte do cômodo é ilustrativa.` : null;
  if (ilustrativo) {
    const aviso = placaDeTexto(ilustrativo, { largura: 1.4, fundo: 'rgba(255,255,255,0.9)', fonte: 30, alturaPx: 80 });
    aviso.rotation.x = -Math.PI / 2;
    aviso.position.set((pl.fimEsquerdo.x + pl.fimDireito.x) / 2, 0.01, Math.min(pl.fimEsquerdo.z, pl.fimDireito.z) - 0.4);
    grupo.add(aviso);
  }
  return { grupo, ilustrativo };
}

/** Sem medição: um piso e uma parede neutros atrás do móvel. */
function montarShowroom(movel: Movel): Group {
  const grupo = new Group();
  grupo.name = 'showroom';
  const largura = Math.max(4, movel.largura + 2);
  const piso = new Mesh(new CircleGeometry(Math.max(4, largura / 1.5), 64), new MeshStandardMaterial({ color: '#d6cabb', roughness: 0.95 }));
  piso.rotation.x = -Math.PI / 2;
  piso.position.z = 1;
  piso.name = 'piso';
  grupo.add(piso);
  grupo.add(parede({ x: largura / 2, z: 0 }, { x: -largura / 2, z: 0 }, Math.max(2.7, movel.altura + 0.3), new MeshStandardMaterial({ color: '#f3efe8', roughness: 0.95 }), { x: 0, z: 1 }));
  return grupo;
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

export interface BotaoMenu {
  id: string;
  texto: () => string;
  acao: () => void;
}

class Menu {
  readonly grupo = new Group();
  private readonly botoes: Array<{ b: BotaoMenu; malha: Mesh; textoAtual: string }> = [];
  constructor(botoes: BotaoMenu[]) {
    this.grupo.name = 'menu';
    botoes.forEach((b, i) => {
      const texto = b.texto();
      const malha = placaDeTexto(texto, { largura: 0.34, fundo: '#3b2416', cor: '#ffffff', fonte: 46 });
      malha.position.y = -i * 0.1;
      malha.userData.botao = b.id;
      this.grupo.add(malha);
      this.botoes.push({ b, malha, textoAtual: texto });
    });
  }
  get malhas(): Mesh[] {
    return this.botoes.map((x) => x.malha);
  }
  acionar(malha: Object3D): boolean {
    const item = this.botoes.find((x) => x.malha === malha);
    if (!item) return false;
    item.b.acao();
    this.atualizar();
    return true;
  }
  atualizar() {
    for (const item of this.botoes) {
      const novo = item.b.texto();
      if (novo === item.textoAtual) continue;
      const nova = placaDeTexto(novo, { largura: 0.34, fundo: '#3b2416', cor: '#ffffff', fonte: 46 });
      const antigo = item.malha.material as MeshBasicMaterial;
      item.malha.material = nova.material;
      antigo.map?.dispose();
      antigo.dispose();
      item.textoAtual = novo;
    }
  }
  destacar(malha: Object3D | null) {
    for (const item of this.botoes) item.malha.scale.setScalar(item.malha === malha ? 1.08 : 1);
  }
}

// ---------------------------------------------------------------------------
// Cena completa
// ---------------------------------------------------------------------------

export interface OpcoesCena {
  /** Mostrar o cômodo da medição (ou o showroom). Na realidade mista fica de fora: a sala é a de verdade. */
  ambiente: boolean;
  /** Botões extras no começo do menu (mover…). */
  botoesExtras?: BotaoMenu[];
  /** Botões no fim do menu (sair). */
  botoesNoFim?: BotaoMenu[];
}

export class CenaOculos {
  /** Tudo: luz, cômodo e móvel. */
  readonly raiz = new Group();
  /** O móvel (é ele que se move na realidade mista). */
  readonly movel: Group;
  readonly menu: Menu;
  readonly avisoIlustrativo: string | null;
  readonly dimensoes: [number, number, number];
  private readonly m: Movel;
  private acabamento = 0;
  private destaque: Mesh | null = null;

  constructor(cena: CenaImersiva, opcoes: OpcoesCena) {
    this.m = montarMovel(cena);
    this.movel = this.m.grupo;
    this.dimensoes = cena.dimensoes;
    this.raiz.add(new AmbientLight('#ffffff', 1.1));
    this.raiz.add(new HemisphereLight('#ffffff', '#b8a894', 1.4));
    const sol = new DirectionalLight('#ffffff', 2.2);
    sol.position.set(1.5, 3, 4);
    this.raiz.add(sol);
    let aviso: string | null = null;
    if (opcoes.ambiente) {
      if (cena.comodo) {
        const c = montarComodo(cena.comodo, this.m);
        aviso = c.ilustrativo;
        this.raiz.add(c.grupo);
      } else {
        this.raiz.add(montarShowroom(this.m));
      }
    }
    this.avisoIlustrativo = aviso;
    this.raiz.add(this.movel);

    const temMovimento = this.m.movimentos.some(Boolean);
    const botoes: BotaoMenu[] = [
      ...(opcoes.botoesExtras ?? []),
      ...(temMovimento ? [{ id: 'abrir', texto: () => (this.algumAberto() ? 'Fechar tudo' : 'Abrir portas e gavetas'), acao: () => this.abrirTudo(!this.algumAberto()) }] : []),
      { id: 'acabamento', texto: () => `Cor: ${ACABAMENTOS[this.acabamento]!.nome}`, acao: () => this.trocarAcabamento() },
      ...(opcoes.botoesNoFim ?? []),
    ];
    this.menu = new Menu(botoes);
    // Menu ao lado direito do móvel, na altura da mão.
    this.menu.grupo.position.set(this.m.largura / 2 + 0.3, 1.25, this.m.profundidade + 0.15);
    this.menu.grupo.rotation.y = -0.35;
    this.movel.add(this.menu.grupo);
  }

  /** O que pode ser apontado: peças que abrem e botões do menu. */
  get alvos(): Object3D[] {
    return [...this.m.movimentoDa.keys(), ...this.menu.malhas];
  }

  /** Aperto do gatilho (ou toque) sobre um alvo. */
  acionar(alvo: Object3D | null): boolean {
    if (!alvo) return false;
    if (this.menu.acionar(alvo)) return true;
    const i = this.m.movimentoDa.get(alvo);
    if (i === undefined) return false;
    const mov = this.m.movimentos[i]!;
    mov.alvo = mov.alvo > 0.5 ? 0 : 1;
    this.menu.atualizar();
    return true;
  }

  destacar(alvo: Object3D | null) {
    const malha = alvo && this.m.movimentoDa.has(alvo) ? (alvo as Mesh) : null;
    if (malha !== this.destaque) {
      // Destaque pelo contorno da peça (o material é dividido entre peças da mesma cor).
      const contorno = (m: Mesh | null, material: LineBasicMaterial) => {
        const linha = m?.children.find((c) => c instanceof LineSegments) as LineSegments | undefined;
        if (linha) linha.material = material;
      };
      contorno(this.destaque, BORDA);
      contorno(malha, BORDA_DESTAQUE);
      this.destaque = malha;
    }
    this.menu.destacar(alvo);
  }

  algumAberto(): boolean {
    return this.m.movimentos.some((v) => v && v.alvo > 0.5);
  }

  abrirTudo(abrir: boolean) {
    for (const v of this.m.movimentos) if (v) v.alvo = abrir ? 1 : 0;
    this.menu.atualizar();
  }

  trocarAcabamento() {
    this.acabamento = (this.acabamento + 1) % ACABAMENTOS.length;
    this.pintar();
  }

  get nomeAcabamento(): string {
    return ACABAMENTOS[this.acabamento]!.nome;
  }

  private pintar() {
    const a = ACABAMENTOS[this.acabamento]!;
    const pintar = (lista: MeshStandardMaterial[], cor: string | null) => {
      for (const m of lista) m.color.set(cor ?? this.m.coresOriginais.get(m) ?? '#cccccc');
    };
    pintar(this.m.materiais.caixa, a.caixa);
    pintar(this.m.materiais.frente, a.frente);
  }

  /** Anima portas e gavetas (dt em segundos). */
  passo(dt: number) {
    const v = Math.min(dt, 0.1) / 0.6;
    for (const mov of this.m.movimentos) {
      if (!mov || mov.t === mov.alvo) continue;
      mov.t = mov.alvo > mov.t ? Math.min(mov.alvo, mov.t + v) : Math.max(mov.alvo, mov.t - v);
      // Suaviza no começo e no fim.
      const s = mov.t * mov.t * (3 - 2 * mov.t);
      mov.aplicar(s);
    }
  }

  liberar() {
    this.raiz.traverse((o) => {
      const malha = o as Mesh;
      malha.geometry?.dispose();
      const mats = Array.isArray(malha.material) ? malha.material : malha.material ? [malha.material] : [];
      for (const m of mats) {
        (m as MeshBasicMaterial).map?.dispose();
        m.dispose();
      }
    });
  }
}

/** Fundo da cena de realidade virtual. */
export const COR_CEU = new Color('#e9e4dc');

/** Anel que mostra onde o móvel vai ser colocado. */
export function anelDeMira(): Mesh {
  const m = new Mesh(new RingGeometry(0.08, 0.11, 40).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: '#db8a35' }));
  m.matrixAutoUpdate = false;
  m.visible = false;
  return m;
}
