/**
 * Óculos de realidade virtual e mista pelo navegador (WebXR): Meta Quest,
 * Samsung Galaxy XR, Apple Vision Pro (só realidade virtual) e outros.
 *
 * - "ar" (realidade mista): a sala de verdade aparece pelas câmeras dos óculos;
 *   o cliente aponta para o chão ou a parede e aperta o gatilho (ou faz a pinça
 *   com os dedos) para colocar o móvel em tamanho real.
 * - "vr" (realidade virtual): o cliente entra no cômodo medido, com o móvel no
 *   lugar onde vai ficar.
 *
 * Nos dois: apontar para uma porta ou gaveta e apertar abre e fecha; o menu ao
 * lado do móvel abre tudo, troca as cores e sai.
 */
import { Matrix4, PerspectiveCamera, Quaternion, Raycaster, Scene, Vector3, WebGLRenderer, BufferGeometry, Line, LineBasicMaterial, type Object3D, type XRTargetRaySpace } from 'three';
import type { CenaImersiva } from '@marcenaria/core';
import { anelDeMira, CenaOculos, COR_CEU, placaDeTexto } from './cena';
import { giroAoColocar } from './geometria';

export type ModoXR = 'ar' | 'vr';

export async function suporteXR(): Promise<{ ar: boolean; vr: boolean }> {
  const xr = typeof navigator !== 'undefined' ? navigator.xr : undefined;
  if (!xr) return { ar: false, vr: false };
  const [ar, vr] = await Promise.all([xr.isSessionSupported('immersive-ar').catch(() => false), xr.isSessionSupported('immersive-vr').catch(() => false)]);
  return { ar, vr };
}

/** Distância (m) entre quem entra no cômodo e a frente do móvel. */
const DISTANCIA_INICIAL = 1.6;

/**
 * Abre a sessão nos óculos. Precisa ser chamada direto no clique (o navegador
 * só abre a sessão imersiva a partir de um gesto da pessoa).
 */
export function entrarNosOculos(modo: ModoXR, cena: CenaImersiva, aoSair: (erro?: string) => void): void {
  const xr = navigator.xr;
  if (!xr) {
    aoSair('Este navegador não abre óculos de realidade virtual.');
    return;
  }
  // Realidade mista: o chão vem da detecção de superfície; celular Android pode não ter "local-floor".
  const pedido = xr.requestSession(modo === 'ar' ? 'immersive-ar' : 'immersive-vr', {
    requiredFeatures: modo === 'vr' ? ['local-floor'] : [],
    optionalFeatures: modo === 'ar' ? ['local-floor', 'hit-test', 'hand-tracking'] : ['hand-tracking'],
  });
  pedido.then(
    (sessao) => iniciar(modo, cena, sessao, aoSair),
    () => aoSair('Os óculos não abriram a experiência. Confira se a página tem permissão para usar a realidade virtual e tente de novo.'),
  );
}

function iniciar(modo: ModoXR, dados: CenaImersiva, sessao: XRSession, aoSair: (erro?: string) => void) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: modo === 'ar' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  const comChao = modo === 'vr' || !sessao.enabledFeatures || sessao.enabledFeatures.includes('local-floor');
  renderer.xr.setReferenceSpaceType(comChao ? 'local-floor' : 'local');
  renderer.domElement.style.display = 'none';
  document.body.appendChild(renderer.domElement);

  const scene = new Scene();
  if (modo === 'vr') scene.background = COR_CEU;
  const camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50);

  let colocado = modo === 'vr';
  const cena = new CenaOculos(dados, {
    ambiente: modo === 'vr',
    botoesExtras: modo === 'ar' ? [{ id: 'mover', texto: () => 'Mover o móvel', acao: () => moverDeNovo() }] : [],
    botoesNoFim: [{ id: 'sair', texto: () => 'Sair', acao: () => void sessao.end() }],
  });
  scene.add(cena.raiz);

  // Realidade virtual: o cômodo inteiro na frente de quem entra.
  if (modo === 'vr') cena.raiz.position.set(0, 0, -(DISTANCIA_INICIAL + dados.dimensoes[2]));
  // Realidade mista: o móvel só aparece depois de colocado.
  cena.movel.visible = colocado;

  // Dica flutuante enquanto o móvel não foi colocado.
  const dica = placaDeTexto('Aponte para o chão ou a parede e confirme (gatilho, pinça ou toque)', { largura: 0.7, fundo: 'rgba(59,36,22,0.88)', cor: '#ffffff', fonte: 30, alturaPx: 96 });
  dica.visible = modo === 'ar';
  scene.add(dica);

  const mira = anelDeMira();
  scene.add(mira);
  const ultimoAcerto = { valido: false, matriz: new Matrix4() };
  // Sem "local-floor", a origem fica na altura da cabeça: o chão é um palpite até a detecção achar o piso.
  let chao = comChao ? 0 : -1.4;

  function moverDeNovo() {
    colocado = false;
    cena.movel.visible = false;
    dica.visible = true;
  }

  function colocar() {
    const pos = new Vector3();
    const rot = new Quaternion();
    const camPos = new Vector3().setFromMatrixPosition(renderer.xr.getCamera().matrixWorld);
    if (ultimoAcerto.valido) {
      ultimoAcerto.matriz.decompose(pos, rot, new Vector3());
      const normal = new Vector3(0, 1, 0).applyQuaternion(rot);
      const giro = giroAoColocar(normal, { x: pos.x, z: pos.z }, { x: camPos.x, z: camPos.z });
      if (!giro) return;
      // Na parede, o móvel desce até o chão (o último chão visto, ou o do sistema dos óculos).
      if (giro.parede) pos.y = chao;
      else chao = pos.y;
      cena.raiz.position.copy(pos);
      cena.raiz.rotation.set(0, giro.giro, 0);
    } else {
      // Sem detecção de superfície: 1,5 m à frente, no chão, de frente para a pessoa.
      const frente = new Vector3(0, 0, -1).applyQuaternion(renderer.xr.getCamera().quaternion);
      frente.y = 0;
      frente.normalize();
      const p = camPos.clone().addScaledVector(frente, 1.5 + dados.dimensoes[2]);
      cena.raiz.position.set(p.x, chao, p.z);
      cena.raiz.rotation.set(0, Math.atan2(camPos.x - p.x, camPos.z - p.z), 0);
    }
    colocado = true;
    cena.movel.visible = true;
    dica.visible = false;
    mira.visible = false;
  }

  // Controles e mãos: raio para apontar, gatilho/pinça para acionar.
  const raycaster = new Raycaster();
  const giroControle = new Matrix4();
  const controles: XRTargetRaySpace[] = [];
  const geometriaRaio = new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), new Vector3(0, 0, -1)]);
  for (let i = 0; i < 2; i++) {
    const c = renderer.xr.getController(i);
    const raio = new Line(geometriaRaio, new LineBasicMaterial({ color: '#db8a35' }));
    raio.scale.z = 3;
    c.add(raio);
    c.addEventListener('select', () => aoApertar(c));
    scene.add(c);
    controles.push(c);
  }

  function apontado(c: Object3D): Object3D | null {
    giroControle.identity().extractRotation(c.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(giroControle);
    const alvos = colocado ? cena.alvos : [];
    const acerto = raycaster.intersectObjects(alvos, false)[0];
    return acerto ? acerto.object : null;
  }

  function aoApertar(c: Object3D) {
    if (!colocado) {
      colocar();
      return;
    }
    cena.acionar(apontado(c));
  }

  // Detecção de superfície pela direção do olhar (funciona com controle, mão ou só a cabeça).
  let fonteAcerto: XRHitTestSource | null = null;
  if (modo === 'ar' && sessao.requestHitTestSource) {
    sessao
      .requestReferenceSpace('viewer')
      .then((espaco) => sessao.requestHitTestSource?.({ space: espaco }))
      .then((f) => {
        fonteAcerto = f ?? null;
      })
      .catch(() => {
        fonteAcerto = null;
      });
  }

  let anterior = performance.now();
  renderer.setAnimationLoop((agora, frame) => {
    const dt = (agora - anterior) / 1000;
    anterior = agora;
    cena.passo(dt);

    const xrCam = renderer.xr.getCamera();
    if (!colocado) {
      // A dica fica 1,2 m à frente, um pouco abaixo dos olhos.
      const frente = new Vector3(0, 0, -1).applyQuaternion(xrCam.quaternion);
      dica.position.copy(xrCam.position).addScaledVector(frente, 1.2);
      dica.position.y -= 0.25;
      dica.quaternion.copy(xrCam.quaternion);
      const ref = renderer.xr.getReferenceSpace();
      const acerto = frame && fonteAcerto && ref ? frame.getHitTestResults(fonteAcerto)[0] : undefined;
      const pose = acerto && ref ? acerto.getPose(ref) : undefined;
      if (pose) {
        ultimoAcerto.valido = true;
        ultimoAcerto.matriz.fromArray(pose.transform.matrix);
        mira.matrix.copy(ultimoAcerto.matriz);
        const y = pose.transform.position.y;
        const ny = new Vector3(0, 1, 0).applyQuaternion(new Quaternion().setFromRotationMatrix(ultimoAcerto.matriz)).y;
        if (ny > 0.9 && (comChao ? Math.abs(y) < 0.4 : y < -0.5)) chao = y;
        mira.visible = true;
      } else {
        ultimoAcerto.valido = false;
        mira.visible = false;
      }
    } else {
      let destacado: Object3D | null = null;
      for (const c of controles) destacado = destacado ?? apontado(c);
      cena.destacar(destacado);
    }
    renderer.render(scene, camera);
  });

  sessao.addEventListener('end', () => {
    renderer.setAnimationLoop(null);
    fonteAcerto?.cancel();
    cena.liberar();
    geometriaRaio.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    aoSair();
  });

  renderer.xr.setSession(sessao).catch(() => {
    void sessao.end();
    aoSair('Não foi possível iniciar a cena nos óculos.');
  });
}
