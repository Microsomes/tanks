import * as THREE from 'three';
import type { GameConfig, Wall } from './types';

export type MapName = 'classic' | 'corridors' | 'bunkers' | 'open' | 'maze';
export const MAP_NAMES: MapName[] = ['classic', 'corridors', 'bunkers', 'open', 'maze'];

export interface WallObject {
    data: Wall;
    mesh: THREE.Mesh;
}

export interface MovingWall {
    wall: WallObject;
    startX: number;
    startZ: number;
    endX: number;
    endZ: number;
    speed: number; // units per second
    progress: number; // 0 to 1
    direction: 1 | -1;
}

export interface ArenaResult {
    boundaryWalls: WallObject[];
    interiorWalls: WallObject[];
    allWallData: Wall[];
}

export function createArena(scene: THREE.Scene, config: GameConfig, mapName: MapName = 'classic'): ArenaResult {
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

    // Boundary walls
    const boundaryWalls = buildBoundaryWalls(scene, halfW, halfH, wallThickness, wallHeight);

    // Interior walls
    const interiorWalls = buildInteriorWallObjects(scene, config, mapName);

    const allWallData = [
        ...boundaryWalls.map(w => w.data),
        ...interiorWalls.map(w => w.data),
    ];

    return { boundaryWalls, interiorWalls, allWallData };
}

function buildBoundaryWalls(scene: THREE.Scene, halfW: number, halfH: number, thickness: number, height: number): WallObject[] {
    const mat = new THREE.MeshLambertMaterial({ color: 0x5a5a8a, flatShading: true });
    const walls: WallObject[] = [];

    function add(x: number, z: number, w: number, d: number, h: number) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        walls.push({ data: { x, z, width: w, depth: d, height: h }, mesh });
    }

    const W = halfW * 2;
    const H = halfH * 2;
    add(0, -halfH - thickness / 2, W + thickness * 2, thickness, height); // top
    add(0, halfH + thickness / 2, W + thickness * 2, thickness, height);  // bottom
    add(-halfW - thickness / 2, 0, thickness, H, height); // left
    add(halfW + thickness / 2, 0, thickness, H, height);  // right

    return walls;
}

export function buildInteriorWallObjects(scene: THREE.Scene, config: GameConfig, mapName: MapName): WallObject[] {
    const { arenaWidth: W, arenaHeight: H } = config;
    const wallHeight = 2;
    const mat = new THREE.MeshLambertMaterial({ color: 0x5a5a8a, flatShading: true });
    const walls: WallObject[] = [];

    function addWall(x: number, z: number, w: number, d: number, h: number = wallHeight) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        walls.push({ data: { x, z, width: w, depth: d, height: h }, mesh });
    }

    switch (mapName) {
        case 'classic':
            buildClassicWalls(addWall, W, H);
            break;
        case 'corridors':
            buildCorridorWalls(addWall, W, H);
            break;
        case 'bunkers':
            buildBunkerWalls(addWall, W, H);
            break;
        case 'open':
            buildOpenWalls(addWall);
            break;
        case 'maze':
            buildMazeWalls(addWall, W, H);
            break;
    }

    return walls;
}

export function removeWallObjects(wallObjects: WallObject[], scene: THREE.Scene) {
    for (const obj of wallObjects) {
        scene.remove(obj.mesh);
        obj.mesh.geometry.dispose();
        (obj.mesh.material as THREE.Material).dispose();
    }
    wallObjects.length = 0;
}

// ─── Map Builders ────────────────────────────────────────────────────

type AddWallFn = (x: number, z: number, w: number, d: number, h?: number) => void;

/**
 * Classic — center cross, corner blocks, side blocks, diagonal blocks.
 */
function buildClassicWalls(addWall: AddWallFn, W: number, H: number) {
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
}

/**
 * Corridors — three horizontal lanes with gaps, connected by short vertical walls.
 */
function buildCorridorWalls(addWall: AddWallFn, W: number, _H: number) {
    const laneZ = [-8, 0, 8];
    const segmentLength = W * 0.35;
    const gapHalf = 2.5;
    const wallD = 1;

    for (const z of laneZ) {
        addWall(-(segmentLength / 2 + gapHalf), z, segmentLength, wallD);
        addWall(segmentLength / 2 + gapHalf, z, segmentLength, wallD);
    }

    const connectX = 12;
    const connectLength = 5;
    addWall(-connectX, -4, wallD, connectLength);
    addWall(connectX, -4, wallD, connectLength);
    addWall(-connectX, 4, wallD, connectLength);
    addWall(connectX, 4, wallD, connectLength);
}

/**
 * Bunkers — four L-shaped corner bunkers with a small center pillar.
 */
function buildBunkerWalls(addWall: AddWallFn, W: number, H: number) {
    const wallD = 1;
    const armLength = 6;
    const insetX = W * 0.25;
    const insetZ = H * 0.28;

    const corners = [
        { sx: -1, sz: -1 },
        { sx: 1, sz: -1 },
        { sx: -1, sz: 1 },
        { sx: 1, sz: 1 },
    ];

    for (const { sx, sz } of corners) {
        const cx = sx * insetX;
        const cz = sz * insetZ;
        addWall(cx - sx * (armLength / 2), cz, armLength, wallD);
        addWall(cx, cz - sz * (armLength / 2), wallD, armLength);
    }

    addWall(0, 0, 2, 2);
}

/**
 * Open — minimal cover, just 4 small pillars symmetrically placed.
 */
function buildOpenWalls(addWall: AddWallFn) {
    const pillarSize = 1.5;
    const px = 10;
    const pz = 7;

    addWall(-px, -pz, pillarSize, pillarSize);
    addWall(px, -pz, pillarSize, pillarSize);
    addWall(-px, pz, pillarSize, pillarSize);
    addWall(px, pz, pillarSize, pillarSize);
}

/**
 * Maze — dense grid of short walls creating winding paths.
 */
function buildMazeWalls(addWall: AddWallFn, W: number, H: number) {
    const wallD = 1;
    const segLen = 3;
    const xSpacing = 6;
    const zSpacing = 5;
    const xSteps = Math.floor((W * 0.4) / xSpacing);
    const zSteps = Math.floor((H * 0.4) / zSpacing);

    for (let ix = -xSteps; ix <= xSteps; ix++) {
        for (let iz = -zSteps; iz <= zSteps; iz++) {
            const x = ix * xSpacing;
            const z = iz * zSpacing;

            if (Math.abs(ix) === 0 && Math.abs(iz) === 0) continue;

            if ((ix + iz) % 2 === 0) {
                addWall(x, z, segLen, wallD);
            } else {
                addWall(x, z, wallD, segLen);
            }
        }
    }
}

// ─── Moving Walls (Deathmatch) ──────────────────────────────────────

export function createMovingWalls(scene: THREE.Scene, config: GameConfig): MovingWall[] {
    const { arenaWidth: W, arenaHeight: H } = config;
    const mat = new THREE.MeshLambertMaterial({ color: 0xff4466, flatShading: true });
    const walls: MovingWall[] = [];

    function addMoving(
        startX: number, startZ: number,
        endX: number, endZ: number,
        w: number, d: number, speed: number,
    ) {
        const h = 2;
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(startX, h / 2, startZ);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        const data: Wall = { x: startX, z: startZ, width: w, depth: d, height: h };
        walls.push({
            wall: { data, mesh },
            startX, startZ,
            endX, endZ,
            speed,
            progress: Math.random(), // stagger start positions
            direction: 1,
        });
    }

    // Horizontal patrollers
    addMoving(-W * 0.3, -H * 0.15, W * 0.3, -H * 0.15, 3, 1, 4);
    addMoving(W * 0.3, H * 0.15, -W * 0.3, H * 0.15, 3, 1, 5);

    // Vertical patrollers
    addMoving(W * 0.15, -H * 0.3, W * 0.15, H * 0.3, 1, 3, 3);
    addMoving(-W * 0.15, H * 0.3, -W * 0.15, -H * 0.3, 1, 3, 4);

    return walls;
}

export function updateMovingWalls(movingWalls: MovingWall[], dt: number) {
    for (const mw of movingWalls) {
        const totalDist = Math.sqrt(
            (mw.endX - mw.startX) ** 2 + (mw.endZ - mw.startZ) ** 2,
        );
        if (totalDist < 0.1) continue;

        const step = (mw.speed * dt) / totalDist;
        mw.progress += step * mw.direction;

        if (mw.progress >= 1) {
            mw.progress = 1;
            mw.direction = -1;
        } else if (mw.progress <= 0) {
            mw.progress = 0;
            mw.direction = 1;
        }

        const x = mw.startX + (mw.endX - mw.startX) * mw.progress;
        const z = mw.startZ + (mw.endZ - mw.startZ) * mw.progress;
        mw.wall.mesh.position.x = x;
        mw.wall.mesh.position.z = z;
        mw.wall.data.x = x;
        mw.wall.data.z = z;
    }
}

export function removeMovingWalls(movingWalls: MovingWall[], scene: THREE.Scene) {
    for (const mw of movingWalls) {
        scene.remove(mw.wall.mesh);
        mw.wall.mesh.geometry.dispose();
        (mw.wall.mesh.material as THREE.Material).dispose();
    }
    movingWalls.length = 0;
}

// ─── Lighting, Camera, Spawn Points ─────────────────────────────────

export function createLighting(scene: THREE.Scene, config?: GameConfig) {
    const ambient = new THREE.AmbientLight(0x6060a0, 0.6);
    scene.add(ambient);

    const shadowSize = config ? Math.max(config.arenaWidth, config.arenaHeight) / 2 + 5 : 30;
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(20, 30, 10);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 2048;
    directional.shadow.mapSize.height = 2048;
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = shadowSize * 4;
    directional.shadow.camera.left = -shadowSize;
    directional.shadow.camera.right = shadowSize;
    directional.shadow.camera.top = shadowSize;
    directional.shadow.camera.bottom = -shadowSize;
    scene.add(directional);

    const hemi = new THREE.HemisphereLight(0x8080c0, 0x404060, 0.3);
    scene.add(hemi);
}

export function createCamera(config: GameConfig): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300);
    // Scale camera height with arena size
    const scale = Math.max(config.arenaWidth / 50, config.arenaHeight / 36);
    camera.position.set(0, 40 * scale, 30 * scale);
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
