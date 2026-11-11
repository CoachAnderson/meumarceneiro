/**
 * Regras de montagem e de fundo que vêm com o sistema.
 * Tudo em décimos de milímetro. Convenção de peça: comprimento acompanha o veio.
 *
 * Posição (caixa): x da esquerda para a direita, y do chão para cima, z da
 * frente para trás; origem no canto inferior esquerdo da face da frente da caixa.
 * O fundo sobreposto supõe que FLe e FAe começam na origem.
 */
import type { DefinicaoRegra } from './regra';

const minimoVao = [
  { condicao: 'Li >= 500', mensagem: 'A largura interna ficou em {Li}; o mínimo é 50 mm. Aumente a largura ou use material mais fino.' },
  { condicao: 'Hi >= 500', mensagem: 'A altura interna ficou em {Hi}; o mínimo é 50 mm. Aumente a altura ou use material mais fino.' },
];

export const MONTAGEM_TAMPO_BASE_ENTRE_LATERAIS: DefinicaoRegra = {
  codigo: 'tampo_base_entre_laterais',
  versao: 1,
  tipo: 'montagem',
  nome: 'Tampo e base entre laterais',
  descricao: 'Laterais inteiras, da base ao topo. Tampo e base entram entre elas.',
  parametros: [],
  derivados: {
    Li: 'L - 2*e',
    Hi: 'A - 2*e',
    xi: 'e',
    yi: 'e',
    FLe: 'L',
    FAe: 'A',
  },
  componentes: [
    { id: 'lateral_esquerda', papel: 'lateral', nome: 'Lateral esquerda', comprimento: 'A', largura: 'Pc', material: 'estrutura', caixa: { x: '0', y: '0', z: '0', dx: 'e', dy: 'A', dz: 'Pc' } },
    { id: 'lateral_direita', papel: 'lateral', nome: 'Lateral direita', comprimento: 'A', largura: 'Pc', material: 'estrutura', caixa: { x: 'L - e', y: '0', z: '0', dx: 'e', dy: 'A', dz: 'Pc' } },
    { id: 'tampo', papel: 'tampo', nome: 'Tampo', comprimento: 'Li', largura: 'Pc', material: 'estrutura', caixa: { x: 'e', y: 'A - e', z: '0', dx: 'Li', dy: 'e', dz: 'Pc' } },
    { id: 'base', papel: 'base', nome: 'Base', comprimento: 'Li', largura: 'Pc', material: 'estrutura', caixa: { x: 'e', y: '0', z: '0', dx: 'Li', dy: 'e', dz: 'Pc' } },
  ],
  validacoes: minimoVao,
};

export const MONTAGEM_TAMPO_SOBRE_LATERAIS: DefinicaoRegra = {
  codigo: 'tampo_sobre_laterais',
  versao: 1,
  tipo: 'montagem',
  nome: 'Tampo sobre laterais',
  descricao:
    'O tampo apoia sobre as laterais e cobre a largura toda; a base entra entre as laterais. ' +
    'L e P são da caixa; os avanços do tampo somam além delas.',
  parametros: [
    { nome: 'af', rotulo: 'Avanço frontal do tampo', padrao: 0, min: 0, max: 1000, ajuda: 'Quanto o tampo passa da frente da caixa.' },
    { nome: 'al', rotulo: 'Avanço lateral do tampo (por lado)', padrao: 0, min: 0, max: 1000, ajuda: 'Quanto o tampo passa de cada lateral.' },
  ],
  derivados: {
    Li: 'L - 2*e',
    Hi: 'A - 2*e',
    xi: 'e',
    yi: 'e',
    FLe: 'L',
    FAe: 'A - e',
  },
  componentes: [
    { id: 'lateral_esquerda', papel: 'lateral', nome: 'Lateral esquerda', comprimento: 'A - e', largura: 'Pc', material: 'estrutura', caixa: { x: '0', y: '0', z: '0', dx: 'e', dy: 'A - e', dz: 'Pc' } },
    { id: 'lateral_direita', papel: 'lateral', nome: 'Lateral direita', comprimento: 'A - e', largura: 'Pc', material: 'estrutura', caixa: { x: 'L - e', y: '0', z: '0', dx: 'e', dy: 'A - e', dz: 'Pc' } },
    { id: 'tampo', papel: 'tampo', nome: 'Tampo', comprimento: 'L + 2*al', largura: 'P + af', material: 'estrutura', caixa: { x: '-al', y: 'A - e', z: '-af', dx: 'L + 2*al', dy: 'e', dz: 'P + af' } },
    { id: 'base', papel: 'base', nome: 'Base', comprimento: 'Li', largura: 'Pc', material: 'estrutura', caixa: { x: 'e', y: '0', z: '0', dx: 'Li', dy: 'e', dz: 'Pc' } },
  ],
  validacoes: minimoVao,
};

export const MONTAGEM_BASE_ENTRE_LATERAIS_TRAVESSAS: DefinicaoRegra = {
  codigo: 'base_entre_laterais_travessas',
  versao: 1,
  tipo: 'montagem',
  nome: 'Base entre laterais, com travessas',
  descricao:
    'Gabinete de cozinha: laterais inteiras, base entre elas e, no lugar do tampo, ' +
    'duas travessas deitadas (frente e fundo) para fixar a pedra.',
  parametros: [{ nome: 't', rotulo: 'Largura das travessas', padrao: 1000, min: 300, max: 3000, ajuda: 'Cada travessa, medida de frente para trás.' }],
  derivados: {
    Li: 'L - 2*e',
    Hi: 'A - 2*e',
    xi: 'e',
    yi: 'e',
    FLe: 'L',
    FAe: 'A',
  },
  componentes: [
    { id: 'lateral_esquerda', papel: 'lateral', nome: 'Lateral esquerda', comprimento: 'A', largura: 'Pc', material: 'estrutura', caixa: { x: '0', y: '0', z: '0', dx: 'e', dy: 'A', dz: 'Pc' } },
    { id: 'lateral_direita', papel: 'lateral', nome: 'Lateral direita', comprimento: 'A', largura: 'Pc', material: 'estrutura', caixa: { x: 'L - e', y: '0', z: '0', dx: 'e', dy: 'A', dz: 'Pc' } },
    { id: 'base', papel: 'base', nome: 'Base', comprimento: 'Li', largura: 'Pc', material: 'estrutura', caixa: { x: 'e', y: '0', z: '0', dx: 'Li', dy: 'e', dz: 'Pc' } },
    { id: 'travessa_frontal', papel: 'travessa', nome: 'Travessa frontal', comprimento: 'Li', largura: 't', material: 'estrutura', caixa: { x: 'e', y: 'A - e', z: '0', dx: 'Li', dy: 'e', dz: 't' } },
    { id: 'travessa_traseira', papel: 'travessa', nome: 'Travessa traseira', comprimento: 'Li', largura: 't', material: 'estrutura', caixa: { x: 'e', y: 'A - e', z: 'Pc - t', dx: 'Li', dy: 'e', dz: 't' } },
  ],
  validacoes: [
    ...minimoVao,
    { condicao: '2*t <= Pc', mensagem: 'As duas travessas ({t} cada) não cabem na profundidade da caixa ({Pc}).' },
  ],
};

export const FUNDO_SOBREPOSTO: DefinicaoRegra = {
  codigo: 'fundo_sobreposto',
  versao: 1,
  tipo: 'fundo',
  nome: 'Fundo sobreposto',
  descricao: 'Fundo parafusado atrás da caixa, cobrindo laterais, tampo e base. A caixa fica mais rasa na espessura do fundo.',
  parametros: [
    { nome: 'gs', rotulo: 'Folga de acabamento do fundo (por lado)', padrao: 0, min: 0, max: 50, ajuda: 'Quanto o fundo fica para dentro de cada borda.' },
  ],
  derivados: {
    Pc: 'P - ef',
    Pint: 'P - ef',
  },
  componentes: [{ id: 'fundo', papel: 'fundo', nome: 'Fundo', comprimento: 'FAe - 2*gs', largura: 'FLe - 2*gs', material: 'fundo', caixa: { x: 'gs', y: 'gs', z: 'Pc', dx: 'FLe - 2*gs', dy: 'FAe - 2*gs', dz: 'ef' } }],
  validacoes: [{ condicao: 'Pc >= 500', mensagem: 'A profundidade da caixa ficou em {Pc}; o mínimo é 50 mm.' }],
};

export const FUNDO_CANAL: DefinicaoRegra = {
  codigo: 'fundo_canal',
  versao: 1,
  tipo: 'fundo',
  nome: 'Fundo encaixado em canal',
  descricao: 'Canal usinado nas laterais, no tampo e na base; o fundo entra nele. A caixa mantém a profundidade total.',
  parametros: [
    { nome: 'c', rotulo: 'Profundidade do canal', padrao: 80, min: 30, max: 150 },
    { nome: 'g', rotulo: 'Folga do fundo no canal (por lado)', padrao: 10, min: 0, max: 30 },
    { nome: 'r', rotulo: 'Distância do canal à face traseira', padrao: 100, min: 0, max: 500 },
  ],
  derivados: {
    Pc: 'P',
    Pint: 'P - r - ef',
  },
  componentes: [{ id: 'fundo', papel: 'fundo', nome: 'Fundo', comprimento: 'Hi + 2*(c - g)', largura: 'Li + 2*(c - g)', material: 'fundo', caixa: { x: 'xi - (c - g)', y: 'yi - (c - g)', z: 'P - r - ef', dx: 'Li + 2*(c - g)', dy: 'Hi + 2*(c - g)', dz: 'ef' } }],
  validacoes: [
    { condicao: 'g < c', mensagem: 'A folga no canal ({g}) precisa ser menor que a profundidade do canal ({c}).' },
    { condicao: 'c < e', mensagem: 'O canal ({c}) não pode ser tão fundo quanto a espessura da chapa ({e}).' },
    { condicao: 'Pint >= 500', mensagem: 'Sobrou {Pint} de profundidade livre na frente do fundo; o mínimo é 50 mm.' },
  ],
};

export const FUNDO_EMBUTIDO: DefinicaoRegra = {
  codigo: 'fundo_embutido',
  versao: 1,
  tipo: 'fundo',
  nome: 'Fundo embutido',
  descricao: 'Fundo entre laterais, tampo e base, apoiado em sarrafos ou rebaixo. A caixa mantém a profundidade total.',
  parametros: [
    { nome: 'g', rotulo: 'Folga do fundo (por lado)', padrao: 10, min: 0, max: 50 },
    { nome: 'r', rotulo: 'Recuo do fundo em relação à face traseira', padrao: 0, min: 0, max: 500 },
  ],
  derivados: {
    Pc: 'P',
    Pint: 'P - r - ef',
  },
  componentes: [{ id: 'fundo', papel: 'fundo', nome: 'Fundo', comprimento: 'Hi - 2*g', largura: 'Li - 2*g', material: 'fundo', caixa: { x: 'xi + g', y: 'yi + g', z: 'P - r - ef', dx: 'Li - 2*g', dy: 'Hi - 2*g', dz: 'ef' } }],
  validacoes: [{ condicao: 'Pint >= 500', mensagem: 'Sobrou {Pint} de profundidade livre na frente do fundo; o mínimo é 50 mm.' }],
};

export const MONTAGENS_PADRAO: readonly DefinicaoRegra[] = [
  MONTAGEM_TAMPO_BASE_ENTRE_LATERAIS,
  MONTAGEM_TAMPO_SOBRE_LATERAIS,
  MONTAGEM_BASE_ENTRE_LATERAIS_TRAVESSAS,
];

export const FUNDOS_PADRAO: readonly DefinicaoRegra[] = [FUNDO_SOBREPOSTO, FUNDO_CANAL, FUNDO_EMBUTIDO];
