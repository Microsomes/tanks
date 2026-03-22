import * as THREE from 'three';
import type { GameConfig, Wall } from './types';

export function createArena(scene: THREE.Scene, config: GameConfig): Wall[] {
    const { arenaWidth: W, arenaHeight: H } = config;
    const halfW = W / 2;
    const halfH = H / 2;
    const wallThickness = 1;
    const wallHeight = 2;

    // Floor
    const floorGeo = new THREE.PlaneGeometry(W, H);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x2a2a3e });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Grid lines on floor
    const gridHelper = new THREE.GridHelper(Math.max(W, H), Math.max(W, H) / 2, 0x3a3a5e, 0x3a3a5e);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    const wallMat = new THREE.MeshLambertMaterial({ color: 0x5a5a8a, flatShading: true });
    const walls: Wall[] = [];

    function addWall(x: number, z: number, w: number, d: number, h: number = wallHeight) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, wallMat);
        mesh.position.set(x, h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        walls.push({ x, z, width: w, depth: d, height: h });
    }

    // Outer walls
    addWall(0, -halfH - wallThickness / 2, W + wallThickness * 2, wallThickness, wallHeight); // top
    addWall(0, halfH + wallThickness / 2, W + wallThickness * 2, wallThickness, wallHeight);  // bottom
    addWall(-halfW - wallThickness / 2, 0, wallThickness, H, wallHeight); // left
    addWall(halfW + wallThickness / 2, 0, wallThickness, H, wallHeight);  // right

    // Interior walls — symmetrical layout for fair gameplay
    const blockW = 4;
    const blockD = 1;

    // Center cross
    addWall(0, 0, blockW * 1.5, blockD);
    addWall(0, 0, blockD, blockW * 1.5);

    // Four corner blocks
    const cx = W * 0.28;
    const cz = H * 0.3;
    addWall(-cx, -cz, blockW, blockD);
    addWall(cx, -cz, blockW, blockD);
    addWall(-cx, cz, blockW, blockD);
    addWall(cx, cz, blockW, blockD);

    // Side blocks
    addWall(-cx, 0, blockD, blockW);
    addWall(cx, 0, blockD, blockW);
    addWall(0, -cz, blockD, blockW);
    addWall(0, cz, blockD, blockW);

    // Diagonal corner blocks
    const dx = W * 0.15;
    const dz = H * 0.15;
    addWall(-dx, -dz, blockW * 0.7, blockD);
    addWall(dx, -dz, blockW * 0.7, blockD);
    addWall(-dx, dz, blockW * 0.7, blockD);
    addWall(dx, dz, blockW * 0.7, blockD);

    return walls;
}

export function createLighting(scene: THREE.Scene) {
    const ambient = new THREE.AmbientLight(0x6060a0, 0.6);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(20, 30, 10);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 2048;
    directional.shadow.mapSize.height = 2048;
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 100;
    directional.shadow.camera.left = -30;
    directional.shadow.camera.right = 30;
    directional.shadow.camera.top = 30;
    directional.shadow.camera.bottom = -30;
    scene.add(directional);

    const hemi = new THREE.HemisphereLight(0x8080c0, 0x404060, 0.3);
    scene.add(hemi);
}

export function createCamera(config: GameConfig): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 40, 30);
    camera.lookAt(0, 0, 0);
    return camera;
}

export function getSpawnPoints(config: GameConfig) {
    const { arenaWidth: W, arenaHeight: H } = config;
    const mx = W * 0.38;
    const mz = H * 0.38;
    return [
        { x: -mx, z: -mz, rotation: Math.PI / 4 },
        { x: mx, z: -mz, rotation: (3 * Math.PI) / 4 },
        { x: -mx, z: mz, rotation: -Math.PI / 4 },
        { x: mx, z: mz, rotation: (-3 * Math.PI) / 4 },
        { x: 0, z: -mz, rotation: Math.PI / 2 },
        { x: 0, z: mz, rotation: -Math.PI / 2 },
        { x: -mx, z: 0, rotation: 0 },
        { x: mx, z: 0, rotation: Math.PI },
    ];
}
