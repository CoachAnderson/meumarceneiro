/**
 * Óculos de encaixar o celular (VR Box, papelão): a tela se divide em duas, uma
 * para cada olho, e a cena acompanha o giro da cabeça pelos sensores do
 * celular. Funciona em qualquer celular com giroscópio, sem depender do
 * suporte do navegador a óculos.
 *
 * Sem mãos nem controle: o que se aciona é o que está no centro da vista.
 * Olhar fixo por 1,5 s (ou tocar na tela, ou apertar o botão do óculos)
 * abre a porta, a gaveta ou o botão do menu. Os círculos no chão levam a
 * pessoa para outro ponto do cômodo.
 */
import { Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Quaternion, Raycaster, RingGeometry, Scene, StereoCamera, Vector2, Vector3, WebGLRenderer, CircleGeometry, type Object3D } from 'three';
import type { CenaImersiva } from '@marcenaria/core';
import { CenaOculos, COR_CEU, placaDeTexto } from './cena';
import { quaternionDoCelular, rumo } from './geometria';

const OLHOS = 1.6;
const OLHAR_FIXO_MS = 1500;

/** Abre a tela dividida dentro de `alvo` (que ocupa a tela inteira). Devolve a função para fechar. */
export function abrirTelaDividida(alvo: HTMLElement, dados: CenaImersiva, aoSair: () => void): () => void {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setScissorTest(true);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';
  alvo.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = COR_CEU;
  const camera = new PerspectiveCamera(80, 1, 0.02, 60);
  const estereo = new StereoCamera();
  estereo.eyeSep = 0.064;

  let fechado = false;
  const fechar = () => {
    if (fechado) return;
    fechado = true;
    window.removeEventListener('deviceorientation', aoGirar);
    window.removeEventListener('resize', ajustar);
    renderer.domElement.removeEventListener('pointerdown', aoTocar);
    renderer.domElement.removeEventListener('pointermove', aoArrastar);
    renderer.domElement.removeEventListener('pointerup', aoSoltar);
    renderer.setAnimationLoop(null);
    cena.liberar();
    renderer.dispose();
    renderer.domElement.remove();
    aoSair();
  };

  const cena = new CenaOculos(dados, { ambiente: true, botoesNoFim: [{ id: 'sair', texto: () => 'Sair', acao: () => setTimeout(fechar, 0) }] });
  scene.add(cena.raiz);
  // Quem olha fica na origem; o cômodo vai para a frente (−z).
  const [L, , P] = dados.dimensoes;
  const frenteDoMovel = -(1.6 + P);
  cena.raiz.position.set(0, 0, frenteDoMovel);

  // Pontos de vista no chão (coordenadas do cômodo): longe, perto, e de lado.
  const pontos: Array<{ x: number; z: number }> = [
    { x: 0, z: P + 1.6 },
    { x: 0, z: P + 0.9 },
    { x: -(L / 2 + 0.4), z: P + 1.1 },
    { x: L / 2 + 0.4, z: P + 1.1 },
  ];
  const marcadores = new Group();
  const materialMarcador = new MeshBasicMaterial({ color: '#db8a35', transparent: true, opacity: 0.55 });
  for (const p of pontos) {
    const m = new Mesh(new CircleGeometry(0.18, 32).rotateX(-Math.PI / 2), materialMarcador);
    m.position.set(p.x, 0.01, p.z);
    m.userData.ponto = p;
    marcadores.add(m);
  }
  cena.raiz.add(marcadores);
  const usuario = new Group(); // posição de quem olha, em coordenadas do mundo
  usuario.position.set(0, OLHOS, 0);
  usuario.add(camera);
  scene.add(usuario);

  // Mira no centro da vista: anel que se completa enquanto se olha fixo.
  const mira = new Mesh(new RingGeometry(0.012, 0.018, 32), new MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true }));
  mira.position.z = -1;
  mira.renderOrder = 10;
  camera.add(mira);
  const progresso = new Mesh(new RingGeometry(0.02, 0.026, 32, 1, Math.PI / 2, 0), new MeshBasicMaterial({ color: '#db8a35', depthTest: false, transparent: true }));
  progresso.position.z = -1;
  progresso.renderOrder = 10;
  camera.add(progresso);

  const ajuda = placaDeTexto('Olhe fixo para uma porta, gaveta ou botão', { largura: 0.9, fundo: 'rgba(59,36,22,0.85)', cor: '#ffffff', fonte: 30, alturaPx: 96 });
  ajuda.position.set(0, OLHOS - 0.35, -1.3);
  scene.add(ajuda);
  setTimeout(() => (ajuda.visible = false), 6000);

  // Menu: perto de quem olha, um pouco abaixo da linha dos olhos (olhar para baixo para usar).
  cena.menu.grupo.removeFromParent();
  const menu = cena.menu.grupo;
  menu.rotation.set(-0.9, 0, 0);
  scene.add(menu);
  const posicionarMenu = () => menu.position.set(usuario.position.x, OLHOS - 0.85, usuario.position.z - 0.6);
  posicionarMenu();

  // Orientação: sensores do celular; sem eles (computador), arrastar com o dedo ou o mouse.
  let temSensor = false;
  let correcao: number | null = null;
  const q = new Quaternion();
  const ajusteRumo = new Quaternion();
  const aoGirar = (e: DeviceOrientationEvent) => {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    temSensor = true;
    const angulo = (screen.orientation?.angle ?? (window as { orientation?: number }).orientation ?? 0) as number;
    const qq = quaternionDoCelular(e.alpha, e.beta, e.gamma, angulo);
    // Na primeira leitura, alinha o rumo para começar olhando o móvel.
    if (correcao === null) correcao = -rumo(qq);
    ajusteRumo.setFromAxisAngle(new Vector3(0, 1, 0), correcao);
    q.set(...qq);
    camera.quaternion.copy(ajusteRumo).multiply(q);
  };
  window.addEventListener('deviceorientation', aoGirar);

  let arrastando: { x: number; y: number; t: number; moveu: boolean } | null = null;
  let guinada = 0;
  let arfagem = 0;
  const aoArrastar = (e: PointerEvent) => {
    if (!arrastando || temSensor) return;
    const dx = e.clientX - arrastando.x;
    const dy = e.clientY - arrastando.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) arrastando.moveu = true;
    guinada += dx * 0.005;
    arfagem = Math.max(-1.2, Math.min(1.2, arfagem + dy * 0.005));
    arrastando.x = e.clientX;
    arrastando.y = e.clientY;
    camera.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), guinada).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), arfagem));
  };
  const aoTocar = (e: PointerEvent) => {
    arrastando = { x: e.clientX, y: e.clientY, t: performance.now(), moveu: false };
  };
  const aoSoltar = () => {
    // Toque rápido (ou o botão do óculos, que toca a tela): aciona o que está na mira.
    if (arrastando && !arrastando.moveu) acionar(olhando);
    arrastando = null;
  };
  renderer.domElement.addEventListener('pointerdown', aoTocar);
  renderer.domElement.addEventListener('pointermove', aoArrastar);
  renderer.domElement.addEventListener('pointerup', aoSoltar);

  const raycaster = new Raycaster();
  const centro = new Vector2(0, 0);
  let olhando: Object3D | null = null;
  let desde = 0;

  function acionar(alvo: Object3D | null) {
    if (!alvo) return;
    const p = alvo.userData.ponto as { x: number; z: number } | undefined;
    if (p) {
      // Vai até o ponto (coordenadas do cômodo → mundo).
      usuario.position.set(p.x, OLHOS, frenteDoMovel + p.z);
      posicionarMenu();
      return;
    }
    cena.acionar(alvo);
  }

  const ajustar = () => {
    const w = alvo.clientWidth || window.innerWidth;
    const h = alvo.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / 2 / h;
    camera.updateProjectionMatrix();
  };
  ajustar();
  window.addEventListener('resize', ajustar);

  let anterior = performance.now();
  renderer.setAnimationLoop((agora) => {
    const dt = (agora - anterior) / 1000;
    anterior = agora;
    cena.passo(dt);

    scene.updateMatrixWorld();
    raycaster.setFromCamera(centro, camera);
    const acerto = raycaster.intersectObjects([...cena.alvos, ...marcadores.children], false)[0]?.object ?? null;
    if (acerto !== olhando) {
      olhando = acerto;
      desde = agora;
    }
    cena.destacar(olhando);
    const fracao = olhando ? Math.min(1, (agora - desde) / OLHAR_FIXO_MS) : 0;
    progresso.geometry.dispose();
    progresso.geometry = new RingGeometry(0.02, 0.026, 32, 1, Math.PI / 2, -fracao * Math.PI * 2);
    if (olhando && fracao >= 1) {
      acionar(olhando);
      desde = agora + 800; // espera antes de acionar de novo o mesmo alvo
    }

    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    estereo.update(camera);
    renderer.setScissor(0, 0, w / 2, h);
    renderer.setViewport(0, 0, w / 2, h);
    renderer.render(scene, estereo.cameraL);
    renderer.setScissor(w / 2, 0, w / 2, h);
    renderer.setViewport(w / 2, 0, w / 2, h);
    renderer.render(scene, estereo.cameraR);
  });

  return fechar;
}
