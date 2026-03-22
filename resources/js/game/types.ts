import type * as THREE from 'three';

export interface PlayerInfo {
    id: string;
    name: string;
    color: string;
    isAdmin: boolean;
}

export interface TankState {
    id: string;
    x: number;
    z: number;
    bodyRotation: number;
    turretRotation: number;
    hp: number;
    alive: boolean;
}

export interface FireEvent {
    id: string;
    shooterId: string;
    x: number;
    z: number;
    angle: number;
    speed: number;
    maxBounces: number;
}

export interface HitEvent {
    shooterId: string;
    targetId: string;
    projectileId: string;
}

export interface GameConfig {
    maxHp: number;
    maxBounces: number;
    projectileSpeed: number;
    fireCooldown: number;
    tankSpeed: number;
    tankRotationSpeed: number;
    arenaWidth: number;
    arenaHeight: number;
}

export const DEFAULT_CONFIG: GameConfig = {
    maxHp: 3,
    maxBounces: 3,
    projectileSpeed: 25,
    fireCooldown: 800,
    tankSpeed: 8,
    tankRotationSpeed: 3,
    arenaWidth: 50,
    arenaHeight: 36,
};

export const TANK_COLORS = [
    '#4ade80', // green
    '#f87171', // red
    '#60a5fa', // blue
    '#facc15', // yellow
    '#c084fc', // purple
    '#fb923c', // orange
    '#2dd4bf', // teal
    '#f472b6', // pink
];

export interface Wall {
    x: number;
    z: number;
    width: number;
    depth: number;
    height: number;
}

export interface SpawnPoint {
    x: number;
    z: number;
    rotation: number;
}

export interface TankMesh {
    group: THREE.Group;
    body: THREE.Mesh;
    turret: THREE.Group;
    barrel: THREE.Mesh;
    hpBar: THREE.Group;
    nameSprite: THREE.Sprite;
}

export interface Projectile {
    id: string;
    mesh: THREE.Mesh;
    trail: THREE.Line;
    trailPoints: THREE.Vector3[];
    vx: number;
    vz: number;
    bounceCount: number;
    shooterId: string;
    alive: boolean;
}

export type GamePhase = 'lobby' | 'countdown' | 'playing' | 'gameover';
