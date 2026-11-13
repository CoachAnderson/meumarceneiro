/**
 * Arquivos 3D do "ver no ambiente". Carregado só quando alguém clica no
 * botão (import dinâmico), para não pesar no resto do sistema.
 *
 * .glb  → Android (Scene Viewer) e download
 * .usdz → iPhone e iPad (AR Quick Look)
 */
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { modeloParaAmbiente, type Componente } from '@marcenaria/core';
import { ESTILO } from './estilo';

/** Cena em metros, em tamanho real, com uma caixa por peça. */
function montarCena(componentes: Componente[], nome: string): Scene {
  const cena = new Scene();
  const movel = new Group();
  movel.name = nome;
  const materiais = new Map<string, MeshStandardMaterial>();
  for (const c of modeloParaAmbiente(componentes).caixas) {
    const cor = ESTILO[c.papel].fill;
    let material = materiais.get(cor);
    if (!material) {
      material = new MeshStandardMaterial({ color: cor, roughness: 0.75, metalness: 0 });
      materiais.set(cor, material);
    }
    const peca = new Mesh(new BoxGeometry(...c.tamanho), material);
    peca.name = c.id;
    peca.position.set(...c.centro);
    movel.add(peca);
  }
  cena.add(movel);
  cena.updateMatrixWorld(true);
  return cena;
}

export async function gerarGlb(componentes: Componente[], nome: string): Promise<Blob> {
  const dados = await new GLTFExporter().parseAsync(montarCena(componentes, nome), { binary: true });
  if (!(dados instanceof ArrayBuffer)) throw new Error('Não foi possível gerar o arquivo 3D.');
  return new Blob([dados], { type: 'model/gltf-binary' });
}

export async function gerarUsdz(componentes: Componente[], nome: string): Promise<Blob> {
  const dados = await new USDZExporter().parseAsync(montarCena(componentes, nome), { quickLookCompatible: true, includeAnchoringProperties: true, ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'horizontal' } } });
  return new Blob([dados as BlobPart], { type: 'model/vnd.usdz+zip' });
}
