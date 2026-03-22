import * as THREE from 'three';
import type { GameConfig, Wall } from './types';

export type MapName = 'classic' | 'corridors' | 'bunkers' | 'open' | 'maze';
export const MAP_NAMES: MapName[] = ['classic', 'corridors', 'bunkers', 'open', 'maze'];

export function createArena(scene: THREE.Scene, config: GameConfig, mapName: MapName = 'classic'): Wall[] {
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

    // Interior walls — selected by map name
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

// ─── Map Builders ────────────────────────────────────────────────────

type AddWallFn = (x: number, z: number, w: number, d: number, h?: number) => void;

/**
 * Classic — center cross, corner blocks, side blocks, diagonal blocks.
 * The original layout.
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
 * Creates intense corridor firefights.
 */
function buildCorridorWalls(addWall: AddWallFn, W: number, _H: number) {
    const laneZ = [-8, 0, 8];
    const segmentLength = W * 0.35; // each segment spans ~35% of arena width
    const gapHalf = 2.5;            // half-width of the center gap
    const wallD = 1;

    // Three horizontal lanes, each split into two segments with a center gap
    for (const z of laneZ) {
        // Left segment: from center-gap to the left
        addWall(-(segmentLength / 2 + gapHalf), z, segmentLength, wallD);
        // Right segment: from center-gap to the right
        addWall(segmentLength / 2 + gapHalf, z, segmentLength, wallD);
    }

    // Short vertical connecting walls between the lanes at x = ±12
    const connectX = 12;
    const connectLength = 5; // vertical span between lanes
    addWall(-connectX, -4, wallD, connectLength);
    addWall(connectX, -4, wallD, connectLength);
    addWall(-connectX, 4, wallD, connectLength);
    addWall(connectX, 4, wallD, connectLength);
}

/**
 * Bunkers — four L-shaped corner bunkers with a small center pillar.
 * Players can hunker in corners or fight in the open middle.
 */
function buildBunkerWalls(addWall: AddWallFn, W: number, H: number) {
    const wallD = 1;
    const armLength = 6;   // length of each L arm
    const insetX = W * 0.25; // how far from center the corner is
    const insetZ = H * 0.28;

    // L-shaped bunker in each corner (horizontal arm + vertical arm)
    const corners = [
        { sx: -1, sz: -1 }, // top-left
        { sx: 1, sz: -1 },  // top-right
        { sx: -1, sz: 1 },  // bottom-left
        { sx: 1, sz: 1 },   // bottom-right
    ];

    for (const { sx, sz } of corners) {
        const cx = sx * insetX;
        const cz = sz * insetZ;

        // Horizontal arm: extends inward from the corner
        addWall(cx - sx * (armLength / 2), cz, armLength, wallD);
        // Vertical arm: extends inward from the corner
        addWall(cx, cz - sz * (armLength / 2), wallD, armLength);
    }

    // Small center pillar (2x2 block)
    addWall(0, 0, 2, 2);
}

/**
 * Open — minimal cover, just 4 small pillars symmetrically placed.
 * High risk, high reward.
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
 * Many small 3-wide walls placed in a grid pattern with gaps.
 */
function buildMazeWalls(addWall: AddWallFn, W: number, H: number) {
    const wallD = 1;
    const segLen = 3; // short wall segments

    // Grid spacing — walls placed at regular intervals
    const xSpacing = 6;
    const zSpacing = 5;

    // Number of grid positions in each direction (symmetric around center)
    const xSteps = Math.floor((W * 0.4) / xSpacing);
    const zSteps = Math.floor((H * 0.4) / zSpacing);

    // Build a checkerboard-like pattern of horizontal and vertical short walls
    for (let ix = -xSteps; ix <= xSteps; ix++) {
        for (let iz = -zSteps; iz <= zSteps; iz++) {
            const x = ix * xSpacing;
            const z = iz * zSpacing;

            // Alternate between horizontal and vertical walls in a checkerboard
            // Skip the very center to leave a small clearing
            if (Math.abs(ix) === 0 && Math.abs(iz) === 0) continue;

            if ((ix + iz) % 2 === 0) {
                // Horizontal wall segment
                addWall(x, z, segLen, wallD);
            } else {
                // Vertical wall segment
                addWall(x, z, wallD, segLen);
            }
        }
    }
}

// ─── Lighting, Camera, Spawn Points (unchanged) ─────────────────────

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

export function createCamera(_config: GameConfig): THREE.PerspectiveCamera {
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
