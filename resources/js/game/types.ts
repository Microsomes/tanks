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
    maxHp: 5,
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
    damage: number;
}

export type GamePhase = 'lobby' | 'countdown' | 'playing' | 'gameover';

// ─── Powerups ────────────────────────────────────────────────────
export type PowerupType =
    | 'health' | 'triple_shot' | 'speed_boost' | 'shield' | 'rapid_fire' | 'rain_bullets'
    | 'mega_bounce' | 'ghost' | 'magnet' | 'freeze' | 'big_shot' | 'landmine';

export interface PowerupSpawnEvent {
    id: string;
    type: PowerupType;
    x: number;
    z: number;
}

export interface PowerupPickupEvent {
    powerupId: string;
    playerId: string;
    type: PowerupType;
}

export interface ActiveEffect {
    type: PowerupType;
    expiresAt: number;
}

export const POWERUP_CONFIG = {
    spawnIntervalMin: 5000,
    spawnIntervalMax: 8000,
    maxOnField: 6,
    despawnTime: 15000,
    pickupRadius: 2.0,
    durations: {
        health: 0,
        triple_shot: 10000,
        speed_boost: 8000,
        shield: 15000,
        rapid_fire: 8000,
        rain_bullets: 5000,
        mega_bounce: 10000,
        ghost: 8000,
        magnet: 12000,
        freeze: 5000,
        big_shot: 8000,
        landmine: 0,
    } as Record<PowerupType, number>,
} as const;

export interface RainBulletsEvent {
    activatorId: string;  // player who activated it (immune)
    startTime: number;
}

export interface GulagEvent {
    deadPlayerId: string;
    killerPlayerId: string;
}

export interface GulagResultEvent {
    winnerId: string;
    loserId: string;
}

export const GULAG_CONFIG = {
    chance: 0.3,
    hp: 2,              // 25% of max (roughly)
    countdownSec: 3,
} as const;
