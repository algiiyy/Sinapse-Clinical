import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RotateCcw } from 'lucide-react';

interface Hand3DVisualizerProps {
  flexAngle: number;
  targetRom: number;
  emgMv: number;
  isSpasticityAlert?: boolean;
  heightClassName?: string;
}

interface FingerRig {
  mcp: THREE.Group;
  pip: THREE.Group;
  dip: THREE.Group;
  curlScale: number;
  baseSplayZ: number;
}

interface ThumbRig {
  cmc: THREE.Group;
  mcp: THREE.Group;
  ip: THREE.Group;
}

function createSkinTextures(): {
  albedoMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 256;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const aCtx = albedoCanvas.getContext('2d')!;

  const grad = aCtx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#eac4ae');
  grad.addColorStop(0.5, '#e2b79e');
  grad.addColorStop(1, '#d7a78d');
  aCtx.fillStyle = grad;
  aCtx.fillRect(0, 0, size, size);

  // Subtle organic skin micro-variation and palmar crease texture
  for (let i = 0; i < 1600; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const y = (Math.sin(i * 78.233) * 19341.123) % 1;
    const px = Math.abs(x) * size;
    const py = Math.abs(y) * size;
    aCtx.fillStyle = i % 2 === 0 ? 'rgba(180,115,88,0.045)' : 'rgba(255,236,224,0.05)';
    aCtx.fillRect(px, py, 2, 2);
  }

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;
  rCtx.fillStyle = '#8d8d8d';
  rCtx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1200; i++) {
    const x = Math.abs((Math.sin(i * 41.13) * 29311.7) % 1) * size;
    const y = Math.abs((Math.sin(i * 93.71) * 14123.3) % 1) * size;
    rCtx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    rCtx.fillRect(x, y, 2, 2);
  }

  const albedoMap = new THREE.CanvasTexture(albedoCanvas);
  albedoMap.colorSpace = THREE.SRGBColorSpace;
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.RepeatWrapping;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;

  return { albedoMap, roughnessMap };
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(15, 41, 66, 0.24)');
  g.addColorStop(0.5, 'rgba(15, 41, 66, 0.08)');
  g.addColorStop(1, 'rgba(15, 41, 66, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPhalanxGeometry(
  baseRadius: number,
  tipRadius: number,
  length: number,
  isDistal = false
): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = t * length;
    let r = THREE.MathUtils.lerp(baseRadius, tipRadius, t);

    // Anatomical knuckle flare at base & slight waist in mid-shaft
    const baseFlare = Math.exp(-Math.pow(t * 5.2, 2)) * baseRadius * 0.09;
    const midTaper = Math.sin(t * Math.PI) * baseRadius * -0.05;
    r += baseFlare + midTaper;

    if (isDistal && t > 0.72) {
      const capT = (t - 0.72) / 0.28;
      r *= Math.sqrt(Math.max(0.02, 1 - capT * capT * 0.92));
    }
    pts.push(new THREE.Vector2(Math.max(0.008, r), y));
  }
  const geo = new THREE.LatheGeometry(pts, 24);
  geo.computeVertexNormals();
  return geo;
}

function createSculptedPalmGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  // Anatomical right-hand palm outline (wider across MCP knuckles, narrower at wrist)
  shape.moveTo(-0.37, -0.54);
  shape.bezierCurveTo(-0.46, -0.24, -0.49, 0.16, -0.45, 0.43);
  shape.bezierCurveTo(-0.34, 0.56, -0.1, 0.61, 0.15, 0.60);
  shape.bezierCurveTo(0.39, 0.59, 0.50, 0.45, 0.51, 0.22);
  shape.bezierCurveTo(0.52, -0.06, 0.46, -0.34, 0.34, -0.54);
  shape.bezierCurveTo(0.14, -0.60, -0.16, -0.60, -0.37, -0.54);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.18,
    bevelEnabled: true,
    bevelThickness: 0.075,
    bevelSize: 0.055,
    bevelSegments: 6,
    curveSegments: 24,
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

export const Hand3DVisualizer: React.FC<Hand3DVisualizerProps> = ({
  flexAngle,
  targetRom,
  emgMv,
  isSpasticityAlert = false,
  heightClassName = 'h-72 sm:h-80',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const flexTargetRef = useRef<number>(flexAngle);
  const spasticRef = useRef<boolean>(isSpasticityAlert);
  const resetCameraFnRef = useRef<(() => void) | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    flexTargetRef.current = Math.max(0, Math.min(180, flexAngle));
  }, [flexAngle]);

  useEffect(() => {
    spasticRef.current = isSpasticityAlert;
  }, [isSpasticityAlert]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = Math.max(240, container.clientWidth);
    const height = Math.max(240, container.clientHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#F3F7FC');
    scene.fog = new THREE.Fog('#F3F7FC', 7, 15);

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 30);
    const defaultCamPos = new THREE.Vector3(1.15, 0.65, 3.85);
    const defaultTarget = new THREE.Vector3(0.02, 0.12, 0.05);
    camera.position.copy(defaultCamPos);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTex = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    scene.environment = envTex;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(defaultTarget);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 2.4;
    controls.maxDistance = 6.2;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = Math.PI * 0.72;
    controls.update();

    let isResettingCamera = false;
    const onControlStart = () => {
      isResettingCamera = false;
      setHasInteracted(true);
    };
    controls.addEventListener('start', onControlStart);

    resetCameraFnRef.current = () => {
      isResettingCamera = true;
      setHasInteracted(false);
    };

    // Three-point clinical studio lighting
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x94a3b8, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff5eb, 1.55);
    keyLight.position.set(2.8, 4.2, 3.6);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 12;
      keyLight.shadow.camera.left = -2.2;
      keyLight.shadow.camera.right = 2.2;
      keyLight.shadow.camera.top = 2.4;
      keyLight.shadow.camera.bottom = -2.4;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xbfdbfe, 0.85);
    rimLight.position.set(-2.6, 2.1, -3.2);
    scene.add(rimLight);

    // Procedural skin & clinical glove materials
    const { albedoMap, roughnessMap } = createSkinTextures();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    albedoMap.anisotropy = maxAniso;
    roughnessMap.anisotropy = maxAniso;

    const skinMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: albedoMap,
      roughnessMap,
      roughness: 0.54,
      metalness: 0.0,
      clearcoat: 0.08,
      clearcoatRoughness: 0.65,
      sheen: 0.28,
      sheenRoughness: 0.75,
      sheenColor: new THREE.Color(0xfde8dc),
    });

    const nailMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf7eae3,
      roughness: 0.22,
      metalness: 0.0,
      clearcoat: 0.75,
      clearcoatRoughness: 0.14,
    });

    const cuffMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f2942,
      roughness: 0.34,
      metalness: 0.72,
    });

    const sensorStripMaterial = new THREE.MeshStandardMaterial({
      color: 0x0066cc,
      emissive: 0x003377,
      emissiveIntensity: 0.35,
      roughness: 0.24,
      metalness: 0.45,
    });

    const gloveRingMaterial = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.28,
      metalness: 0.65,
    });

    const disposables: Array<{ dispose: () => void }> = [
      albedoMap,
      roughnessMap,
      skinMaterial,
      nailMaterial,
      cuffMaterial,
      sensorStripMaterial,
      gloveRingMaterial,
    ];

    // Grounded contact shadow disc
    const shadowTex = createContactShadowTexture();
    const shadowGeo = new THREE.PlaneGeometry(2.6, 2.6);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.set(0, -1.65, 0);
    scene.add(shadowPlane);
    disposables.push(shadowTex, shadowGeo, shadowMat);

    // Master hand root assembly
    const handRoot = new THREE.Group();
    handRoot.position.set(0, -0.22, 0);
    scene.add(handRoot);

    // 1. Anatomical Forearm & Smart Wrist Cuff
    const forearmPts = [
      new THREE.Vector2(0.32, -0.58),
      new THREE.Vector2(0.30, -0.35),
      new THREE.Vector2(0.27, -0.05),
      new THREE.Vector2(0.25, 0.15),
    ];
    const forearmGeo = new THREE.LatheGeometry(forearmPts, 28);
    forearmGeo.scale(1.16, 1, 0.72);
    forearmGeo.computeVertexNormals();
    const forearmMesh = new THREE.Mesh(forearmGeo, skinMaterial);
    forearmMesh.position.set(0, -0.82, 0);
    forearmMesh.castShadow = !isSoftwareGl;
    forearmMesh.receiveShadow = !isSoftwareGl;
    handRoot.add(forearmMesh);
    disposables.push(forearmGeo);

    const cuffGeo = new THREE.CylinderGeometry(0.31, 0.33, 0.28, 32);
    cuffGeo.scale(1.18, 1, 0.75);
    const cuffMesh = new THREE.Mesh(cuffGeo, cuffMaterial);
    cuffMesh.position.set(0, -0.92, 0);
    cuffMesh.castShadow = !isSoftwareGl;
    handRoot.add(cuffMesh);
    disposables.push(cuffGeo);

    const ledRingGeo = new THREE.TorusGeometry(0.322, 0.015, 12, 36);
    ledRingGeo.rotateX(Math.PI / 2);
    ledRingGeo.scale(1.18, 1, 0.76);
    const ledRingMesh = new THREE.Mesh(ledRingGeo, sensorStripMaterial);
    ledRingMesh.position.set(0, -0.84, 0);
    handRoot.add(ledRingMesh);
    disposables.push(ledRingGeo);

    // 2. Sculpted Anatomical Palm + Thenar / Hypothenar Muscle Mounds
    const palmGeo = createSculptedPalmGeometry();
    const palmMesh = new THREE.Mesh(palmGeo, skinMaterial);
    palmMesh.position.set(0.02, -0.1, 0);
    palmMesh.castShadow = !isSoftwareGl;
    palmMesh.receiveShadow = !isSoftwareGl;
    handRoot.add(palmMesh);
    disposables.push(palmGeo);

    // Thenar (thumb base) muscular pad on palmar +X side
    const thenarGeo = new THREE.SphereGeometry(0.24, 24, 20);
    thenarGeo.scale(0.85, 1.35, 0.62);
    const thenarMesh = new THREE.Mesh(thenarGeo, skinMaterial);
    thenarMesh.position.set(0.28, -0.28, 0.085);
    thenarMesh.rotation.z = -0.35;
    thenarMesh.castShadow = !isSoftwareGl;
    handRoot.add(thenarMesh);
    disposables.push(thenarGeo);

    // Hypothenar (pinky side) muscular pad on palmar -X side
    const hypoGeo = new THREE.SphereGeometry(0.20, 22, 18);
    hypoGeo.scale(0.68, 1.55, 0.56);
    const hypoMesh = new THREE.Mesh(hypoGeo, skinMaterial);
    hypoMesh.position.set(-0.31, -0.18, 0.065);
    hypoMesh.rotation.z = 0.12;
    hypoMesh.castShadow = !isSoftwareGl;
    handRoot.add(hypoMesh);
    disposables.push(hypoGeo);

    // Dorsal NeuroHand sensor hub
    const hubGeo = new THREE.BoxGeometry(0.42, 0.34, 0.05);
    const hubMesh = new THREE.Mesh(hubGeo, cuffMaterial);
    hubMesh.position.set(0.01, -0.14, -0.165);
    hubMesh.castShadow = !isSoftwareGl;
    handRoot.add(hubMesh);
    disposables.push(hubGeo);

    const hubAccentGeo = new THREE.BoxGeometry(0.32, 0.035, 0.018);
    const hubAccentMesh = new THREE.Mesh(hubAccentGeo, sensorStripMaterial);
    hubAccentMesh.position.set(0.01, -0.02, -0.19);
    handRoot.add(hubAccentMesh);
    disposables.push(hubAccentGeo);

    // 3. Articulated Fingers (Index, Middle, Ring, Little)
    const fingerSpecs = [
      { name: 'index', x: 0.36, y: 0.46, baseR: 0.105, l1: 0.44, l2: 0.28, l3: 0.22, splayZ: -0.07, curlScale: 0.96 },
      { name: 'middle', x: 0.12, y: 0.51, baseR: 0.108, l1: 0.49, l2: 0.31, l3: 0.24, splayZ: -0.01, curlScale: 1.0 },
      { name: 'ring', x: -0.13, y: 0.48, baseR: 0.100, l1: 0.45, l2: 0.29, l3: 0.22, splayZ: 0.04, curlScale: 1.04 },
      { name: 'little', x: -0.36, y: 0.40, baseR: 0.088, l1: 0.35, l2: 0.23, l3: 0.19, splayZ: 0.11, curlScale: 1.08 },
    ];

    const fingerRigs: FingerRig[] = [];
    const jointSphereGeo = new THREE.SphereGeometry(1, 18, 14);
    const sensorRingGeo = new THREE.TorusGeometry(1, 0.085, 10, 24);
    const nailGeo = new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    disposables.push(jointSphereGeo, sensorRingGeo, nailGeo);

    fingerSpecs.forEach((spec) => {
      const mcp = new THREE.Group();
      mcp.position.set(spec.x, spec.y, 0.01);
      mcp.rotation.z = spec.splayZ;
      handRoot.add(mcp);

      // MCP knuckle sphere
      const mcpJoint = new THREE.Mesh(jointSphereGeo, skinMaterial);
      mcpJoint.scale.setScalar(spec.baseR * 1.04);
      mcp.add(mcpJoint);

      // Proximal phalanx
      const p1Geo = createPhalanxGeometry(spec.baseR, spec.baseR * 0.86, spec.l1);
      const p1Mesh = new THREE.Mesh(p1Geo, skinMaterial);
      p1Mesh.castShadow = !isSoftwareGl;
      p1Mesh.receiveShadow = !isSoftwareGl;
      mcp.add(p1Mesh);
      disposables.push(p1Geo);

      // NeuroHand smart band on proximal phalanx
      const bandMesh = new THREE.Mesh(sensorRingGeo, gloveRingMaterial);
      bandMesh.rotation.x = Math.PI / 2;
      bandMesh.position.set(0, spec.l1 * 0.48, 0);
      bandMesh.scale.setScalar(spec.baseR * 0.95);
      mcp.add(bandMesh);

      // Dorsal tendon sensor strip
      const stripGeo = new THREE.BoxGeometry(spec.baseR * 0.32, spec.l1 * 0.65, 0.016);
      const stripMesh = new THREE.Mesh(stripGeo, sensorStripMaterial);
      stripMesh.position.set(0, spec.l1 * 0.5, -spec.baseR * 0.88);
      mcp.add(stripMesh);
      disposables.push(stripGeo);

      // PIP joint
      const pip = new THREE.Group();
      pip.position.set(0, spec.l1, 0);
      mcp.add(pip);

      const pipJoint = new THREE.Mesh(jointSphereGeo, skinMaterial);
      pipJoint.scale.setScalar(spec.baseR * 0.88);
      pip.add(pipJoint);

      const p2Geo = createPhalanxGeometry(spec.baseR * 0.85, spec.baseR * 0.74, spec.l2);
      const p2Mesh = new THREE.Mesh(p2Geo, skinMaterial);
      p2Mesh.castShadow = !isSoftwareGl;
      p2Mesh.receiveShadow = !isSoftwareGl;
      pip.add(p2Mesh);
      disposables.push(p2Geo);

      // DIP joint
      const dip = new THREE.Group();
      dip.position.set(0, spec.l2, 0);
      pip.add(dip);

      const dipJoint = new THREE.Mesh(jointSphereGeo, skinMaterial);
      dipJoint.scale.setScalar(spec.baseR * 0.76);
      dip.add(dipJoint);

      const p3Geo = createPhalanxGeometry(spec.baseR * 0.74, spec.baseR * 0.62, spec.l3, true);
      const p3Mesh = new THREE.Mesh(p3Geo, skinMaterial);
      p3Mesh.castShadow = !isSoftwareGl;
      p3Mesh.receiveShadow = !isSoftwareGl;
      dip.add(p3Mesh);
      disposables.push(p3Geo);

      // Realistic Fingernail on dorsal side (-Z)
      const nailMesh = new THREE.Mesh(nailGeo, nailMaterial);
      nailMesh.scale.set(spec.baseR * 0.52, spec.l3 * 0.42, 0.018);
      nailMesh.rotation.x = -Math.PI / 2;
      nailMesh.position.set(0, spec.l3 * 0.62, -spec.baseR * 0.56);
      dip.add(nailMesh);

      fingerRigs.push({
        mcp,
        pip,
        dip,
        curlScale: spec.curlScale,
        baseSplayZ: spec.splayZ,
      });
    });

    // 4. Anatomical Opposable Thumb (+X side of right palm)
    const cmc = new THREE.Group();
    cmc.position.set(0.42, -0.34, 0.08);
    handRoot.add(cmc);

    const cmcJoint = new THREE.Mesh(jointSphereGeo, skinMaterial);
    cmcJoint.scale.setScalar(0.13);
    cmc.add(cmcJoint);

    const thumbM1Geo = createPhalanxGeometry(0.125, 0.105, 0.34);
    const thumbM1 = new THREE.Mesh(thumbM1Geo, skinMaterial);
    thumbM1.castShadow = !isSoftwareGl;
    cmc.add(thumbM1);
    disposables.push(thumbM1Geo);

    const thumbMcp = new THREE.Group();
    thumbMcp.position.set(0, 0.34, 0);
    cmc.add(thumbMcp);

    const thumbMcpJoint = new THREE.Mesh(jointSphereGeo, skinMaterial);
    thumbMcpJoint.scale.setScalar(0.108);
    thumbMcp.add(thumbMcpJoint);

    const thumbP1Geo = createPhalanxGeometry(0.105, 0.092, 0.28);
    const thumbP1 = new THREE.Mesh(thumbP1Geo, skinMaterial);
    thumbP1.castShadow = !isSoftwareGl;
    thumbMcp.add(thumbP1);
    disposables.push(thumbP1Geo);

    const thumbBand = new THREE.Mesh(sensorRingGeo, gloveRingMaterial);
    thumbBand.rotation.x = Math.PI / 2;
    thumbBand.position.set(0, 0.14, 0);
    thumbBand.scale.setScalar(0.102);
    thumbMcp.add(thumbBand);

    const thumbIp = new THREE.Group();
    thumbIp.position.set(0, 0.28, 0);
    thumbMcp.add(thumbIp);

    const thumbIpJoint = new THREE.Mesh(jointSphereGeo, skinMaterial);
    thumbIpJoint.scale.setScalar(0.094);
    thumbIp.add(thumbIpJoint);

    const thumbP2Geo = createPhalanxGeometry(0.092, 0.075, 0.24, true);
    const thumbP2 = new THREE.Mesh(thumbP2Geo, skinMaterial);
    thumbP2.castShadow = !isSoftwareGl;
    thumbIp.add(thumbP2);
    disposables.push(thumbP2Geo);

    const thumbNail = new THREE.Mesh(nailGeo, nailMaterial);
    thumbNail.scale.set(0.06, 0.105, 0.018);
    thumbNail.rotation.x = -Math.PI / 2;
    thumbNail.position.set(0, 0.145, -0.07);
    thumbIp.add(thumbNail);

    const thumbRig: ThumbRig = { cmc, mcp: thumbMcp, ip: thumbIp };

    // Resize observer
    const handleResize = () => {
      if (!container) return;
      const w = Math.max(240, container.clientWidth);
      const h = Math.max(240, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObs = new ResizeObserver(handleResize);
    resizeObs.observe(container);

    // Pre-allocated animation state & vectors (Zero GC inside render loop)
    let smoothedFlex = Math.max(0, Math.min(180, flexTargetRef.current));
    let elapsedTime = 0;
    let lastTime = performance.now();
    let frameId = 0;
    let disposed = false;

    const normalStripColor = new THREE.Color(0x0066cc);
    const normalEmissive = new THREE.Color(0x003377);
    const alertStripColor = new THREE.Color(0xdc2626);
    const alertEmissive = new THREE.Color(0x991b1b);

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (sync && state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick(now = performance.now()) {
      if (disposed) return;
      const delta = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      elapsedTime += delta;

      // Exponentially damp live finger flexion angle (0..180 deg)
      smoothedFlex = THREE.MathUtils.damp(smoothedFlex, flexTargetRef.current, 9.5, delta);
      const t = Math.max(0, Math.min(1, smoothedFlex / 180));
      const isSpastic = spasticRef.current;

      // Gentle physiological micro-tremor during spasticity alert
      const tremor = isSpastic ? Math.sin(elapsedTime * 34) * 0.018 : 0;

      // Subtle resting hand float
      handRoot.position.y = -0.22 + Math.sin(elapsedTime * 1.4) * 0.012;

      // Apply biomechanical joint curl ratios (MCP, PIP, DIP)
      fingerRigs.forEach((finger, idx) => {
        const cascade = 1 + idx * 0.04;
        const mcpCurl = (0.04 + t * 1.32 * finger.curlScale * cascade) + tremor;
        const pipCurl = (0.06 + t * 1.68 * finger.curlScale) + tremor * 1.1;
        const dipCurl = 0.03 + t * 1.05 * finger.curlScale;

        finger.mcp.rotation.x = Math.min(1.48, mcpCurl);
        finger.pip.rotation.x = Math.min(1.78, pipCurl);
        finger.dip.rotation.x = Math.min(1.18, dipCurl);
        // Natural slight convergence of fingers as hand closes into grasp
        finger.mcp.rotation.z = THREE.MathUtils.lerp(finger.baseSplayZ, finger.baseSplayZ * 0.25, t);
      });

      // Apply realistic Thumb opposition + flexion
      thumbRig.cmc.rotation.z = THREE.MathUtils.lerp(-0.56, -0.26, t);
      thumbRig.cmc.rotation.y = THREE.MathUtils.lerp(-0.38, -1.12, t);
      thumbRig.cmc.rotation.x = THREE.MathUtils.lerp(0.10, 0.56, t) + tremor;
      thumbRig.mcp.rotation.x = THREE.MathUtils.lerp(0.05, 0.72, t);
      thumbRig.ip.rotation.x = THREE.MathUtils.lerp(0.04, 0.92, t);

      // Update sensor LED color based on spasticity state
      const targetColor = isSpastic ? alertStripColor : normalStripColor;
      const targetEmissive = isSpastic ? alertEmissive : normalEmissive;
      sensorStripMaterial.color.lerp(targetColor, Math.min(1, delta * 10));
      sensorStripMaterial.emissive.lerp(targetEmissive, Math.min(1, delta * 10));

      if (isResettingCamera) {
        camera.position.lerp(defaultCamPos, Math.min(1, delta * 7));
        controls.target.lerp(defaultTarget, Math.min(1, delta * 7));
        if (camera.position.distanceTo(defaultCamPos) < 0.015) {
          camera.position.copy(defaultCamPos);
          controls.target.copy(defaultTarget);
          isResettingCamera = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(() => tick());
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObs.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.dispose();
      envTex.dispose();
      disposables.forEach((item) => item.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const gripPercent = Math.min(100, Math.round((flexAngle / 180) * 100));

  return (
    <section className="rounded-2xl bg-white border border-slate-200/80 overflow-hidden">
      <div className="px-4 sm:px-5 pt-4 pb-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-[#0F2942]">
            Visualisasi Tangan 3D Real-Time
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Geser untuk memutar sudut pandang · Genggaman mengikuti sudut fleksi
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasInteracted && (
            <button
              type="button"
              onClick={() => resetCameraFnRef.current?.()}
              className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-medium text-slate-600 inline-flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>Reset</span>
            </button>
          )}
          <div className="text-right">
            <span
              className={`tabular-nums-mono text-base font-bold ${
                isSpasticityAlert ? 'text-red-600' : 'text-[#0066CC]'
              }`}
            >
              {flexAngle.toFixed(1)}°
            </span>
          </div>
        </div>
      </div>

      {/* Isolated WebGL Canvas Container */}
      <div className={`relative w-full ${heightClassName} bg-[#F3F7FC]`}>
        <div
          ref={mountRef}
          className="w-full h-full touch-none cursor-grab active:cursor-grabbing"
          aria-label="Model tangan 3D real-time"
        />

        {/* Quiet Corner Metrics (solid translucent, no backdrop-filter over WebGL) */}
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
          <div className="rounded-xl bg-white/95 border border-slate-200/80 px-3 py-1.5 text-[11px] text-slate-600">
            Genggaman{' '}
            <strong className="tabular-nums-mono text-[#0F2942]">{gripPercent}%</strong>
            <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
            Target <strong className="tabular-nums-mono text-[#0F2942]">{targetRom}°</strong>
          </div>

          <div className="rounded-xl bg-white/95 border border-slate-200/80 px-3 py-1.5 text-[11px] tabular-nums-mono font-medium text-[#0F2942]">
            {Math.round(emgMv)} mV
          </div>
        </div>
      </div>
    </section>
  );
};
