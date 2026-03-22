import * as THREE from 'three';
import { createArena, createLighting, createCamera, getSpawnPoints } from './arena';
import type { MapName } from './arena';
import { createTankMesh, updateHpBar, getBarrelTip } from './tank';
import {
    createProjectile,
    updateProjectile,
    checkTankHit,
    removeProjectile,
    createMuzzleFlash,
    createExplosion,
} from './projectile';
import {
    createPowerupMesh,
    updatePowerups,
    checkPowerupPickup,
    removePowerup,
    createPickupEffect,
    findValidSpawnPosition,
    createRainBulletEffect,
} from './powerup';
import type { PowerupObject } from './powerup';
import { createInputHandler } from './input';
import type { InputState } from './input';
import { AudioManager } from './audio';
import type {
    GameConfig,
    Wall,
    TankMesh,
    Projectile,
    TankState,
    FireEvent,
    PlayerInfo,
    PowerupType,
    PowerupSpawnEvent,
    PowerupPickupEvent,
    ActiveEffect,
    RainBulletsEvent,
} from './types';
import { DEFAULT_CONFIG, TANK_COLORS, POWERUP_CONFIG, GULAG_CONFIG } from './types';
import type { GulagEvent, GulagResultEvent } from './types';

interface RemoteTank {
    mesh: TankMesh;
    targetX: number;
    targetZ: number;
    targetBodyRot: number;
    targetTurretRot: number;
    hp: number;
    alive: boolean;
    info: PlayerInfo;
}

export interface GameEngineCallbacks {
    onFire: (event: FireEvent) => void;
    onTankState: (state: TankState) => void;
    onHit: (data: { shooterId: string; targetId: string; projectileId: string }) => void;
    onDeath: (data: { id: string; killerId: string }) => void;
    onGameOver: (data: { winnerId: string; winnerName: string }) => void;
    onHpChange: (hp: number) => void;
    onKill: (killerName: string, targetName: string) => void;
    onPowerupSpawn: (event: PowerupSpawnEvent) => void;
    onPowerupPickup: (event: PowerupPickupEvent) => void;
    onEffectsChange: (effects: ActiveEffect[]) => void;
    onRainBullets: (event: RainBulletsEvent) => void;
    onGulag: (event: GulagEvent) => void;
}

export class GameEngine {
    private renderer!: THREE.WebGLRenderer;
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private walls: Wall[] = [];
    private config: GameConfig;
    private input!: ReturnType<typeof createInputHandler>;

    private localTank!: TankMesh;
    private localId: string;
    private localInfo: PlayerInfo;
    private localX = 0;
    private localZ = 0;
    private localBodyRot = 0;
    private localTurretRot = 0;
    private localHp: number;
    private localAlive = true;

    private remoteTanks = new Map<string, RemoteTank>();
    private projectiles: Projectile[] = [];
    private lastFireTime = 0;
    private projectileIdCounter = 0;

    private animFrameId = 0;
    private clock = new THREE.Clock();
    private callbacks: GameEngineCallbacks;
    private running = false;

    // Grace period: projectiles can't hit shooter for first N seconds
    private projectileSpawnTimes = new Map<string, number>();
    private selfHitGracePeriod = 0.4;
    private audio = new AudioManager();

    // Powerups
    private powerups: PowerupObject[] = [];
    private activeEffects: ActiveEffect[] = [];
    private powerupIdCounter = 0;
    private isAdmin: boolean;
    private powerupSpawnTimer = 0;
    private nextSpawnDelay = 0;

    // Map
    private mapName: MapName;

    // Gulag
    private gulagUsed = new Set<string>();

    // Spectate mode
    private spectateMode = false;

    // New effects
    private frozenByEnemy = false;
    private landmines: { x: number; z: number; ownerId: string; mesh: THREE.Mesh }[] = [];

    // Rain bullets
    private rainBulletsActive = false;
    private rainActivatorId = '';
    private rainTimer = 0;
    private rainDamageTick = 0;
    private rainCleanup: (() => void) | null = null;

    constructor(
        private canvas: HTMLCanvasElement,
        localId: string,
        localInfo: PlayerInfo,
        callbacks: GameEngineCallbacks,
        config?: Partial<GameConfig>,
        mapName?: MapName,
    ) {
        this.localId = localId;
        this.localInfo = localInfo;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.localHp = this.config.maxHp;
        this.callbacks = callbacks;
        this.isAdmin = localInfo.isAdmin;
        this.nextSpawnDelay = this.randomSpawnDelay();
        this.mapName = mapName ?? 'classic';
    }

    init() {
        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setClearColor(0x1a1a2e);

        // Scene
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x1a1a2e, 40, 80);

        // Camera
        this.camera = createCamera(this.config);

        // Lighting
        createLighting(this.scene);

        // Arena
        this.walls = createArena(this.scene, this.config, this.mapName);

        // Local tank
        this.localTank = createTankMesh(this.localInfo.color, this.localInfo.name);
        this.scene.add(this.localTank.group);

        // Input
        this.input = createInputHandler(this.canvas, this.camera);

        // Audio
        this.audio.load();
        this.audio.startMusic(this.mapName);

        // Resize
        window.addEventListener('resize', this.onResize);
    }

    spawnLocal(spawnIndex: number) {
        const spawns = getSpawnPoints(this.config);
        const spawn = spawns[spawnIndex % spawns.length];
        this.localX = spawn.x;
        this.localZ = spawn.z;
        this.localBodyRot = spawn.rotation;
        this.localTank.group.position.set(this.localX, 0, this.localZ);
        this.localTank.group.rotation.y = this.localBodyRot;
        this.localHp = this.config.maxHp;
        this.localAlive = true;
        updateHpBar(this.localTank.hpBar, this.localHp);
    }

    setLocalPosition(x: number, z: number, rotation: number, hp?: number) {
        this.localX = x;
        this.localZ = z;
        this.localBodyRot = rotation;
        this.localTank.group.position.set(x, 0, z);
        this.localTank.group.rotation.y = rotation;
        if (hp !== undefined) {
            this.localHp = hp;
            updateHpBar(this.localTank.hpBar, hp);
            this.callbacks.onHpChange(hp);
        }
    }

    addRemoteTank(id: string, info: PlayerInfo, spawnIndex: number, pos?: { x: number; z: number; rotation: number; hp?: number }) {
        if (this.remoteTanks.has(id)) return;

        const mesh = createTankMesh(info.color, info.name);
        const spawns = getSpawnPoints(this.config);
        const spawn = pos || spawns[spawnIndex % spawns.length];
        const hp = pos?.hp ?? this.config.maxHp;
        mesh.group.position.set(spawn.x, 0, spawn.z);
        mesh.group.rotation.y = spawn.rotation;
        this.scene.add(mesh.group);

        this.remoteTanks.set(id, {
            mesh,
            targetX: spawn.x,
            targetZ: spawn.z,
            targetBodyRot: spawn.rotation,
            targetTurretRot: 0,
            hp,
            alive: true,
            info,
        });
        updateHpBar(mesh.hpBar, hp);
    }

    removeRemoteTank(id: string) {
        const remote = this.remoteTanks.get(id);
        if (remote) {
            this.scene.remove(remote.mesh.group);
            this.remoteTanks.delete(id);
        }
    }

    updateRemoteTankState(state: TankState) {
        const remote = this.remoteTanks.get(state.id);
        if (!remote) return;

        remote.targetX = state.x;
        remote.targetZ = state.z;
        remote.targetBodyRot = state.bodyRotation;
        remote.targetTurretRot = state.turretRotation;
        remote.hp = state.hp;
        remote.alive = state.alive;
        updateHpBar(remote.mesh.hpBar, state.hp);

        if (!state.alive) {
            remote.mesh.group.visible = false;
        }
    }

    spawnRemoteProjectile(event: FireEvent) {
        // Look up shooter's color
        const remote = this.remoteTanks.get(event.shooterId);
        const shooterColor = remote?.info.color
            ?? (event.shooterId === this.localId ? this.localInfo.color : '#ffffff');

        const proj = createProjectile(
            event.id,
            event.x,
            event.z,
            event.angle,
            event.speed,
            event.maxBounces,
            event.shooterId,
            this.scene,
            1,
            shooterColor,
        );
        this.projectiles.push(proj);
        this.projectileSpawnTimes.set(event.id, this.clock.getElapsedTime());
        createMuzzleFlash(this.scene, event.x, event.z);
        this.audio.play('fire', 0.2);
    }

    handleRemoteHit(targetId: string, _projectileId: string) {
        if (targetId === this.localId) return; // We handle our own HP
        const remote = this.remoteTanks.get(targetId);
        if (remote) {
            remote.hp = Math.max(0, remote.hp - 1);
            updateHpBar(remote.mesh.hpBar, remote.hp);
        }
    }

    handleRemoteDeath(id: string, killerId: string) {
        const remote = this.remoteTanks.get(id);
        if (remote) {
            remote.alive = false;
            remote.mesh.group.visible = false;
            createExplosion(
                this.scene,
                remote.mesh.group.position.x,
                remote.mesh.group.position.z,
                remote.info.color,
            );
            this.audio.play('explosion', 0.6);

            // Find killer name
            let killerName = 'Unknown';
            if (killerId === this.localId) {
                killerName = this.localInfo.name;
            } else {
                const killer = this.remoteTanks.get(killerId);
                if (killer) killerName = killer.info.name;
            }
            this.callbacks.onKill(killerName, remote.info.name);
        }
    }

    // ─── Powerup public API ─────────────────────────────────────────

    spawnPowerup(event: PowerupSpawnEvent) {
        const obj = createPowerupMesh(event.id, event.type, event.x, event.z, this.scene);
        this.powerups.push(obj);
    }

    handleRemotePowerupPickup(event: PowerupPickupEvent) {
        const idx = this.powerups.findIndex(p => p.id === event.powerupId);
        if (idx === -1) return;
        const powerup = this.powerups[idx];
        createPickupEffect(this.scene, powerup.x, powerup.z, powerup.type);
        removePowerup(powerup, this.scene);
        this.powerups.splice(idx, 1);
    }

    setAdmin(admin: boolean) {
        this.isAdmin = admin;
    }

    setSpectateMode(enabled: boolean) {
        this.spectateMode = enabled;
        this.localAlive = false;
        this.localTank.group.visible = false;
    }

    hasEffect(type: PowerupType): boolean {
        return this.activeEffects.some(e => e.type === type);
    }

    getActiveEffects(): ActiveEffect[] {
        return [...this.activeEffects];
    }

    startRainBullets(activatorId: string) {
        this.rainBulletsActive = true;
        this.rainActivatorId = activatorId;
        this.rainTimer = 5; // 5 seconds
        this.rainDamageTick = 0;
        this.rainCleanup?.();
        this.rainCleanup = createRainBulletEffect(this.scene, this.config);
    }

    // ─── Gulag Respawn ────────────────────────────────────────────

    respawnFromGulag(playerId: string, spawnIndex: number) {
        const spawns = getSpawnPoints(this.config);
        const spawn = spawns[spawnIndex % spawns.length];
        const hp = GULAG_CONFIG.hp;

        if (playerId === this.localId) {
            this.localAlive = true;
            this.localHp = hp;
            this.localX = spawn.x;
            this.localZ = spawn.z;
            this.localBodyRot = spawn.rotation;
            this.localTank.group.position.set(this.localX, 0, this.localZ);
            this.localTank.group.rotation.y = this.localBodyRot;
            this.localTank.group.visible = true;
            updateHpBar(this.localTank.hpBar, this.localHp);
            this.callbacks.onHpChange(this.localHp);
        } else {
            const remote = this.remoteTanks.get(playerId);
            if (remote) {
                remote.alive = true;
                remote.hp = hp;
                remote.targetX = spawn.x;
                remote.targetZ = spawn.z;
                remote.targetBodyRot = spawn.rotation;
                remote.mesh.group.position.set(spawn.x, 0, spawn.z);
                remote.mesh.group.rotation.y = spawn.rotation;
                remote.mesh.group.visible = true;
                updateHpBar(remote.mesh.hpBar, hp);
            }
        }
    }

    // ─── Lifecycle ──────────────────────────────────────────────────

    start() {
        this.running = true;
        this.clock.start();
        this.animate();
    }

    stop() {
        this.running = false;
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
        }
    }

    destroy() {
        this.stop();
        this.input?.destroy();
        this.audio.destroy();
        for (const p of this.powerups) {
            removePowerup(p, this.scene);
        }
        this.powerups = [];
        this.activeEffects = [];
        this.gulagUsed.clear();
        for (const mine of this.landmines) {
            this.scene.remove(mine.mesh);
            mine.mesh.geometry.dispose();
            (mine.mesh.material as THREE.Material).dispose();
        }
        this.landmines = [];
        if (this.rainCleanup) {
            this.rainCleanup();
            this.rainCleanup = null;
            this.rainBulletsActive = false;
        }
        window.removeEventListener('resize', this.onResize);
        this.renderer?.dispose();
    }

    getAlivePlayerCount(): number {
        let count = this.localAlive ? 1 : 0;
        for (const [, remote] of this.remoteTanks) {
            if (remote.alive) count++;
        }
        return count;
    }

    getTotalPlayerCount(): number {
        return 1 + this.remoteTanks.size;
    }

    // ─── Game Loop ──────────────────────────────────────────────────

    private animate = () => {
        if (!this.running) return;
        this.animFrameId = requestAnimationFrame(this.animate);

        const dt = Math.min(this.clock.getDelta(), 0.05); // Cap delta time

        if (!this.spectateMode && this.localAlive) {
            this.updateLocalTank(dt);
            this.handleFiring();
        }

        this.updateRemoteTanks(dt);
        this.updateProjectiles(dt);
        if (!this.spectateMode) this.checkLocalHits();

        // Powerups
        updatePowerups(this.powerups, dt);
        this.checkPowerupPickups();
        this.updateActiveEffects();
        this.despawnOldPowerups();
        if (this.isAdmin) this.adminSpawnPowerups(dt);
        this.updateNewEffects(dt);

        // Rain bullets
        if (this.rainBulletsActive) {
            this.rainTimer -= dt;
            this.rainDamageTick += dt;

            // Every 0.5 seconds, check tanks in the center zone
            if (this.rainDamageTick >= 0.5) {
                this.rainDamageTick = 0;

                // Rain only covers center 60% of the arena — sides are safe
                const safeX = this.config.arenaWidth * 0.3;
                const safeZ = this.config.arenaHeight * 0.3;
                const inRainZone = (x: number, z: number) =>
                    Math.abs(x) < safeX && Math.abs(z) < safeZ;

                // Check local tank
                if (this.localAlive && this.localId !== this.rainActivatorId && inRainZone(this.localX, this.localZ)) {
                    if (Math.random() < 0.2) {
                        // Shield absorbs the hit
                        if (this.hasEffect('shield')) {
                            this.activeEffects = this.activeEffects.filter(e => e.type !== 'shield');
                            this.callbacks.onEffectsChange([...this.activeEffects]);
                            this.audio.play('shield_break', 0.4);
                        } else {
                            this.localHp = Math.max(0, this.localHp - 1);
                            updateHpBar(this.localTank.hpBar, this.localHp);
                            this.callbacks.onHpChange(this.localHp);
                            this.flashTank(this.localTank);
                            this.audio.play('hit', 0.3);

                            if (this.localHp <= 0) {
                                this.localAlive = false;
                                this.localTank.group.visible = false;
                                createExplosion(this.scene, this.localX, this.localZ, this.localInfo.color);
                                this.audio.play('explosion', 0.6);
                                this.callbacks.onDeath({
                                    id: this.localId,
                                    killerId: this.rainActivatorId,
                                });
                                let killerName = 'Unknown';
                                const killer = this.remoteTanks.get(this.rainActivatorId);
                                if (killer) killerName = killer.info.name;
                                if (this.rainActivatorId === this.localId) killerName = this.localInfo.name;
                                this.callbacks.onKill(killerName, this.localInfo.name);
                            }
                        }
                    }
                }

                // Flash remote tanks in rain zone (damage handled on their client)
                for (const [id, remote] of this.remoteTanks) {
                    if (!remote.alive) continue;
                    if (id === this.rainActivatorId) continue;
                    if (!inRainZone(remote.mesh.group.position.x, remote.mesh.group.position.z)) continue;
                    if (Math.random() < 0.2) {
                        this.flashTank(remote.mesh);
                    }
                }
            }

            if (this.rainTimer <= 0) {
                this.rainBulletsActive = false;
                this.rainCleanup?.();
                this.rainCleanup = null;
            }
        }

        // Make HP bars and names face camera
        this.faceBillboards();

        // Send state (skip in spectate mode)
        if (!this.spectateMode) {
            this.callbacks.onTankState({
                id: this.localId,
                x: this.localX,
                z: this.localZ,
                bodyRotation: this.localBodyRot,
                turretRotation: this.localTurretRot,
                hp: this.localHp,
                alive: this.localAlive,
            });
        }

        this.renderer.render(this.scene, this.camera);
    };

    // ─── Movement ───────────────────────────────────────────────────

    private updateLocalTank(dt: number) {
        const { state } = this.input;
        let speed = this.config.tankSpeed;
        if (this.hasEffect('speed_boost')) speed *= 1.6;
        if (this.frozenByEnemy) speed *= 0.5;

        // Direct WASD movement (W=up/-Z, S=down/+Z, A=left/-X, D=right/+X)
        let dx = 0;
        let dz = 0;
        if (state.up) dz -= 1;
        if (state.down) dz += 1;
        if (state.left) dx -= 1;
        if (state.right) dx += 1;

        // Normalize diagonal movement
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len > 0) {
            dx = (dx / len) * speed * dt;
            dz = (dz / len) * speed * dt;

            // Rotate body to face movement direction (same convention as turret)
            const targetRot = Math.atan2(-dx, dz);
            this.localBodyRot = lerpAngle(this.localBodyRot, targetRot, 0.2);
        }

        // Try move with wall collision (each axis independently)
        if (!this.checkWallCollision(this.localX + dx, this.localZ, 1.2)) {
            this.localX += dx;
        }
        if (!this.checkWallCollision(this.localX, this.localZ + dz, 1.2)) {
            this.localZ += dz;
        }

        // Clamp to arena
        const halfW = this.config.arenaWidth / 2 - 1.5;
        const halfH = this.config.arenaHeight / 2 - 1.5;
        this.localX = Math.max(-halfW, Math.min(halfW, this.localX));
        this.localZ = Math.max(-halfH, Math.min(halfH, this.localZ));

        // Update mesh position and body rotation
        this.localTank.group.position.set(this.localX, 0, this.localZ);
        this.localTank.group.rotation.y = this.localBodyRot;

        // Turret aims at mouse (world-space angle, subtract body rotation for local turret)
        // Barrel model points at -Z, so we need atan2(-dirX, -dirZ) to align it toward the mouse
        const turretWorldAngle = Math.atan2(
            -(state.mouseX - this.localX),
            -(state.mouseY - this.localZ),
        );
        this.localTurretRot = turretWorldAngle;
        this.localTank.turret.rotation.y = turretWorldAngle - this.localBodyRot;
    }

    // ─── Firing ─────────────────────────────────────────────────────

    private handleFiring() {
        const now = performance.now();
        const cooldown = this.hasEffect('rapid_fire')
            ? this.config.fireCooldown * 0.3
            : this.config.fireCooldown;

        if (this.input.consumeFire() && now - this.lastFireTime > cooldown) {
            this.lastFireTime = now;

            // localTurretRot is already the world-space angle
            const turretWorldAngle = this.localTurretRot;
            const tip = getBarrelTip(this.localTank.group, this.localTank.turret, this.localBodyRot);

            // Determine angles to fire at
            const angles = [turretWorldAngle];
            if (this.hasEffect('triple_shot')) {
                angles.push(turretWorldAngle - 0.15, turretWorldAngle + 0.15);
            }

            const isBigShot = this.hasEffect('big_shot');
            const bounces = this.hasEffect('mega_bounce') ? 8 : this.config.maxBounces;
            const damage = isBigShot ? 2 : 1;

            for (const angle of angles) {
                const projId = `${this.localId}-${this.projectileIdCounter++}`;
                const fireEvent: FireEvent = {
                    id: projId,
                    shooterId: this.localId,
                    x: tip.x,
                    z: tip.z,
                    angle,
                    speed: this.config.projectileSpeed,
                    maxBounces: bounces,
                };

                const proj = createProjectile(
                    projId,
                    tip.x,
                    tip.z,
                    angle,
                    this.config.projectileSpeed,
                    bounces,
                    this.localId,
                    this.scene,
                    damage,
                    this.localInfo.color,
                );
                if (isBigShot) {
                    proj.mesh.scale.set(2, 2, 2);
                }
                this.projectiles.push(proj);
                this.projectileSpawnTimes.set(projId, this.clock.getElapsedTime());

                this.callbacks.onFire(fireEvent);
            }

            createMuzzleFlash(this.scene, tip.x, tip.z);
            this.audio.play('fire', 0.4);
        }
    }

    // ─── Remote Tanks ───────────────────────────────────────────────

    private updateRemoteTanks(dt: number) {
        const lerpFactor = 1 - Math.pow(0.001, dt); // Smooth interpolation

        for (const [, remote] of this.remoteTanks) {
            if (!remote.alive) continue;

            const pos = remote.mesh.group.position;
            pos.x += (remote.targetX - pos.x) * lerpFactor;
            pos.z += (remote.targetZ - pos.z) * lerpFactor;

            // Interpolate body rotation
            remote.mesh.group.rotation.y = lerpAngle(
                remote.mesh.group.rotation.y,
                remote.targetBodyRot,
                lerpFactor,
            );

            // Turret rotation (convert world-space angle to body-local)
            const localTurretRot = remote.targetTurretRot - remote.targetBodyRot;
            remote.mesh.turret.rotation.y = lerpAngle(
                remote.mesh.turret.rotation.y,
                localTurretRot,
                lerpFactor,
            );
        }
    }

    // ─── Projectiles ────────────────────────────────────────────────

    private updateProjectiles(dt: number) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            const result = updateProjectile(proj, dt, this.walls, this.config);
            if (result === 'bounced') {
                this.audio.play('ricochet', 0.15);
            }
            if (result === 'dead') {
                removeProjectile(proj, this.scene);
                this.projectileSpawnTimes.delete(proj.id);
                this.projectiles.splice(i, 1);
            }
        }
    }

    private checkLocalHits() {
        if (!this.localAlive) return;

        const now = this.clock.getElapsedTime();

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            if (!proj.alive) continue;

            // Grace period for self-shots
            if (proj.shooterId === this.localId) {
                const spawnTime = this.projectileSpawnTimes.get(proj.id);
                if (spawnTime && now - spawnTime < this.selfHitGracePeriod) continue;
            }

            // Check hits on remote tanks — remove projectile on contact (they handle their own HP)
            let hitRemote = false;
            for (const [id, remote] of this.remoteTanks) {
                if (!remote.alive) continue;
                if (checkTankHit(proj, remote.mesh.group.position.x, remote.mesh.group.position.z, id)) {
                    removeProjectile(proj, this.scene);
                    this.projectileSpawnTimes.delete(proj.id);
                    this.projectiles.splice(i, 1);
                    hitRemote = true;
                    break;
                }
            }
            if (hitRemote) continue;

            if (checkTankHit(proj, this.localX, this.localZ, this.localId)) {
                // Shield absorbs the hit
                if (this.hasEffect('shield')) {
                    this.activeEffects = this.activeEffects.filter(e => e.type !== 'shield');
                    this.callbacks.onEffectsChange([...this.activeEffects]);
                    this.audio.play('shield_break', 0.4);
                    removeProjectile(proj, this.scene);
                    this.projectileSpawnTimes.delete(proj.id);
                    this.projectiles.splice(i, 1);
                    continue;
                }

                this.localHp = Math.max(0, this.localHp - (proj.damage || 1));
                updateHpBar(this.localTank.hpBar, this.localHp);
                this.callbacks.onHpChange(this.localHp);

                // Notify hit
                this.callbacks.onHit({
                    shooterId: proj.shooterId,
                    targetId: this.localId,
                    projectileId: proj.id,
                });

                // Remove projectile
                removeProjectile(proj, this.scene);
                this.projectileSpawnTimes.delete(proj.id);
                this.projectiles.splice(i, 1);

                // Flash tank red + sound
                this.flashTank(this.localTank);
                this.audio.play('hit', 0.5);

                if (this.localHp <= 0) {
                    this.localAlive = false;
                    this.localTank.group.visible = false;
                    createExplosion(this.scene, this.localX, this.localZ, this.localInfo.color);
                    this.audio.play('explosion', 0.6);
                    this.callbacks.onDeath({
                        id: this.localId,
                        killerId: proj.shooterId,
                    });

                    // Find killer name
                    let killerName = 'Unknown';
                    const killer = this.remoteTanks.get(proj.shooterId);
                    if (killer) killerName = killer.info.name;
                    if (proj.shooterId === this.localId) killerName = this.localInfo.name;
                    this.callbacks.onKill(killerName, this.localInfo.name);
                }
                break;
            }
        }
    }

    // ─── Powerup Logic ──────────────────────────────────────────────

    private adminSpawnPowerups(dt: number) {
        this.powerupSpawnTimer += dt * 1000;
        if (this.powerupSpawnTimer < this.nextSpawnDelay) return;
        if (this.powerups.length + 2 > POWERUP_CONFIG.maxOnField) {
            this.powerupSpawnTimer = 0;
            return;
        }

        this.powerupSpawnTimer = 0;
        this.nextSpawnDelay = this.randomSpawnDelay();

        const types: PowerupType[] = [
            'health', 'triple_shot', 'speed_boost', 'shield', 'rapid_fire', 'rain_bullets',
            'mega_bounce', 'ghost', 'magnet', 'freeze', 'big_shot', 'landmine',
        ];
        const type = types[Math.floor(Math.random() * types.length)];
        const pos = findValidSpawnPosition(this.walls, this.config);

        // Spawn mirrored pair — one on each side of the map
        const mirrorX = -pos.x;
        const mirrorZ = -pos.z;

        const event1: PowerupSpawnEvent = {
            id: `powerup-${this.powerupIdCounter++}`,
            type,
            x: pos.x,
            z: pos.z,
        };

        const event2: PowerupSpawnEvent = {
            id: `powerup-${this.powerupIdCounter++}`,
            type,
            x: mirrorX,
            z: mirrorZ,
        };

        this.spawnPowerup(event1);
        this.callbacks.onPowerupSpawn(event1);
        this.spawnPowerup(event2);
        this.callbacks.onPowerupSpawn(event2);
    }

    private checkPowerupPickups() {
        if (!this.localAlive) return;

        for (let i = this.powerups.length - 1; i >= 0; i--) {
            const powerup = this.powerups[i];
            if (checkPowerupPickup(powerup, this.localX, this.localZ, POWERUP_CONFIG.pickupRadius)) {
                this.applyPowerupEffect(powerup.type);
                createPickupEffect(this.scene, powerup.x, powerup.z, powerup.type);
                this.audio.play('pickup', 0.4);

                this.callbacks.onPowerupPickup({
                    powerupId: powerup.id,
                    playerId: this.localId,
                    type: powerup.type,
                });

                removePowerup(powerup, this.scene);
                this.powerups.splice(i, 1);
            }
        }
    }

    private applyPowerupEffect(type: PowerupType) {
        if (type === 'health') {
            this.localHp = Math.min(this.localHp + 2, this.config.maxHp);
            updateHpBar(this.localTank.hpBar, this.localHp);
            this.callbacks.onHpChange(this.localHp);
            return;
        }

        if (type === 'rain_bullets') {
            const event: RainBulletsEvent = {
                activatorId: this.localId,
                startTime: performance.now(),
            };
            this.startRainBullets(this.localId);
            this.callbacks.onRainBullets(event);
            return;
        }

        if (type === 'landmine') {
            this.placeLandmine();
            return;
        }

        if (type === 'freeze') {
            // Freeze is a timed effect — enemies see it via network
            // We just apply it as a normal timed effect; the freeze flag
            // for remote players is handled via the TankState broadcast
        }

        const duration = POWERUP_CONFIG.durations[type];
        const expiresAt = performance.now() + duration;

        // Stack duration if already active
        const existing = this.activeEffects.find(e => e.type === type);
        if (existing) {
            existing.expiresAt = Math.max(existing.expiresAt, performance.now()) + duration;
        } else {
            this.activeEffects.push({ type, expiresAt });
        }
        this.callbacks.onEffectsChange([...this.activeEffects]);
    }

    private updateActiveEffects() {
        const now = performance.now();
        const before = this.activeEffects.length;
        this.activeEffects = this.activeEffects.filter(e => e.expiresAt > now);
        if (this.activeEffects.length !== before) {
            this.callbacks.onEffectsChange([...this.activeEffects]);
        }
    }

    private despawnOldPowerups() {
        const now = performance.now();
        for (let i = this.powerups.length - 1; i >= 0; i--) {
            if (now - this.powerups[i].spawnTime > POWERUP_CONFIG.despawnTime) {
                removePowerup(this.powerups[i], this.scene);
                this.powerups.splice(i, 1);
            }
        }
    }

    private randomSpawnDelay(): number {
        return POWERUP_CONFIG.spawnIntervalMin +
            Math.random() * (POWERUP_CONFIG.spawnIntervalMax - POWERUP_CONFIG.spawnIntervalMin);
    }

    // ─── New Effect Logic ────────────────────────────────────────────

    private updateNewEffects(_dt: number) {
        // Ghost — toggle local tank transparency
        const ghostActive = this.hasEffect('ghost');
        const bodyMat = this.localTank.body.material as THREE.MeshLambertMaterial;
        bodyMat.transparent = ghostActive;
        bodyMat.opacity = ghostActive ? 0.3 : 1;

        // Magnet — pull nearby powerups toward local tank
        if (this.hasEffect('magnet') && this.localAlive) {
            for (const p of this.powerups) {
                const dx = this.localX - p.x;
                const dz = this.localZ - p.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < 12 && dist > 0.5) {
                    const pull = 0.15;
                    p.x += (dx / dist) * pull;
                    p.z += (dz / dist) * pull;
                    p.group.position.x = p.x;
                    p.group.position.z = p.z;
                }
            }
        }

        // Freeze — check if any remote player has freeze active (via their tank state)
        // Simple: if I have freeze, remote tanks are slowed (visual only — their own client slows them)
        // If any remote has freeze, I'm slowed (frozenByEnemy flag)
        // We encode freeze in TankState via a convention: handled by broadcasting freeze event
        // For simplicity: freeze slows ALL enemies. We track it via activeEffects on the freezer's side.
        // The frozen state for the local player is set when receiving a freeze event.

        // Landmine collision check
        for (let i = this.landmines.length - 1; i >= 0; i--) {
            const mine = this.landmines[i];
            // Check against local tank
            if (this.localAlive && mine.ownerId !== this.localId) {
                const dx = this.localX - mine.x;
                const dz = this.localZ - mine.z;
                if (Math.sqrt(dx * dx + dz * dz) < 1.8) {
                    this.detonateMine(i, mine);
                    continue;
                }
            }
            // Check against remote tanks
            let detonated = false;
            for (const [id, remote] of this.remoteTanks) {
                if (!remote.alive || id === mine.ownerId) continue;
                const dx = remote.mesh.group.position.x - mine.x;
                const dz = remote.mesh.group.position.z - mine.z;
                if (Math.sqrt(dx * dx + dz * dz) < 1.8) {
                    this.detonateMine(i, mine);
                    detonated = true;
                    break;
                }
            }
            if (detonated) continue;
        }
    }

    private placeLandmine() {
        const geo = new THREE.CylinderGeometry(0.5, 0.5, 0.15, 8);
        const mat = new THREE.MeshLambertMaterial({ color: 0x886644, flatShading: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(this.localX, 0.08, this.localZ);
        this.scene.add(mesh);
        this.landmines.push({ x: this.localX, z: this.localZ, ownerId: this.localId, mesh });
    }

    private detonateMine(index: number, mine: { x: number; z: number; ownerId: string; mesh: THREE.Mesh }) {
        createExplosion(this.scene, mine.x, mine.z, '#ff6644');
        this.audio.play('explosion', 0.5);
        this.scene.remove(mine.mesh);
        mine.mesh.geometry.dispose();
        (mine.mesh.material as THREE.Material).dispose();
        this.landmines.splice(index, 1);

        // Damage local tank if nearby and not owner
        if (this.localAlive && mine.ownerId !== this.localId) {
            const dx = this.localX - mine.x;
            const dz = this.localZ - mine.z;
            if (Math.sqrt(dx * dx + dz * dz) < 3) {
                const dmg = 2;
                this.localHp = Math.max(0, this.localHp - dmg);
                updateHpBar(this.localTank.hpBar, this.localHp);
                this.callbacks.onHpChange(this.localHp);
                this.flashTank(this.localTank);
                this.audio.play('hit', 0.5);

                if (this.localHp <= 0) {
                    this.localAlive = false;
                    this.localTank.group.visible = false;
                    createExplosion(this.scene, this.localX, this.localZ, this.localInfo.color);
                    this.audio.play('explosion', 0.6);
                    this.callbacks.onDeath({ id: this.localId, killerId: mine.ownerId });
                    let killerName = 'Unknown';
                    const killer = this.remoteTanks.get(mine.ownerId);
                    if (killer) killerName = killer.info.name;
                    this.callbacks.onKill(killerName, this.localInfo.name);
                }
            }
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────

    private flashTank(tank: TankMesh) {
        const originalColor = (tank.body.material as THREE.MeshLambertMaterial).color.clone();
        (tank.body.material as THREE.MeshLambertMaterial).color.set(0xff0000);
        setTimeout(() => {
            (tank.body.material as THREE.MeshLambertMaterial).color.copy(originalColor);
        }, 150);
    }

    private checkWallCollision(x: number, z: number, radius: number): boolean {
        for (const wall of this.walls) {
            const halfW = wall.width / 2;
            const halfD = wall.depth / 2;
            if (
                x + radius > wall.x - halfW &&
                x - radius < wall.x + halfW &&
                z + radius > wall.z - halfD &&
                z - radius < wall.z + halfD
            ) {
                return true;
            }
        }
        return false;
    }

    private faceBillboards() {
        const cameraPos = this.camera.position;

        // Local tank
        this.localTank.hpBar.lookAt(cameraPos);
        this.localTank.nameSprite.lookAt(cameraPos);

        // Remote tanks
        for (const [, remote] of this.remoteTanks) {
            remote.mesh.hpBar.lookAt(cameraPos);
            remote.mesh.nameSprite.lookAt(cameraPos);
        }
    }

    private onResize = () => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
}

function lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
}
