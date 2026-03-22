import * as THREE from 'three';
import { createArena, createLighting, createCamera, getSpawnPoints } from './arena';
import { createTankMesh, updateHpBar, getBarrelTip } from './tank';
import {
    createProjectile,
    updateProjectile,
    checkTankHit,
    removeProjectile,
    createMuzzleFlash,
    createExplosion,
} from './projectile';
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
} from './types';
import { DEFAULT_CONFIG, TANK_COLORS } from './types';

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

    constructor(
        private canvas: HTMLCanvasElement,
        localId: string,
        localInfo: PlayerInfo,
        callbacks: GameEngineCallbacks,
        config?: Partial<GameConfig>,
    ) {
        this.localId = localId;
        this.localInfo = localInfo;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.localHp = this.config.maxHp;
        this.callbacks = callbacks;
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
        this.walls = createArena(this.scene, this.config);

        // Local tank
        this.localTank = createTankMesh(this.localInfo.color, this.localInfo.name);
        this.scene.add(this.localTank.group);

        // Input
        this.input = createInputHandler(this.canvas, this.camera);

        // Audio
        this.audio.load();

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

    addRemoteTank(id: string, info: PlayerInfo, spawnIndex: number) {
        if (this.remoteTanks.has(id)) return;

        const mesh = createTankMesh(info.color, info.name);
        const spawns = getSpawnPoints(this.config);
        const spawn = spawns[spawnIndex % spawns.length];
        mesh.group.position.set(spawn.x, 0, spawn.z);
        mesh.group.rotation.y = spawn.rotation;
        this.scene.add(mesh.group);

        this.remoteTanks.set(id, {
            mesh,
            targetX: spawn.x,
            targetZ: spawn.z,
            targetBodyRot: spawn.rotation,
            targetTurretRot: 0,
            hp: this.config.maxHp,
            alive: true,
            info,
        });
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
        const proj = createProjectile(
            event.id,
            event.x,
            event.z,
            event.angle,
            event.speed,
            event.maxBounces,
            event.shooterId,
            this.scene,
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

    private animate = () => {
        if (!this.running) return;
        this.animFrameId = requestAnimationFrame(this.animate);

        const dt = Math.min(this.clock.getDelta(), 0.05); // Cap delta time

        if (this.localAlive) {
            this.updateLocalTank(dt);
            this.handleFiring();
        }

        this.updateRemoteTanks(dt);
        this.updateProjectiles(dt);
        this.checkLocalHits();

        // Make HP bars and names face camera
        this.faceBillboards();

        // Send state
        this.callbacks.onTankState({
            id: this.localId,
            x: this.localX,
            z: this.localZ,
            bodyRotation: this.localBodyRot,
            turretRotation: this.localTurretRot,
            hp: this.localHp,
            alive: this.localAlive,
        });

        this.renderer.render(this.scene, this.camera);
    };

    private updateLocalTank(dt: number) {
        const { state } = this.input;
        const speed = this.config.tankSpeed;

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

    private handleFiring() {
        const now = performance.now();
        if (this.input.consumeFire() && now - this.lastFireTime > this.config.fireCooldown) {
            this.lastFireTime = now;

            // localTurretRot is already the world-space angle
            const turretWorldAngle = this.localTurretRot;
            const tip = getBarrelTip(this.localTank.group, this.localTank.turret, this.localBodyRot);

            const projId = `${this.localId}-${this.projectileIdCounter++}`;
            const fireEvent: FireEvent = {
                id: projId,
                shooterId: this.localId,
                x: tip.x,
                z: tip.z,
                angle: turretWorldAngle,
                speed: this.config.projectileSpeed,
                maxBounces: this.config.maxBounces,
            };

            // Create local projectile
            const proj = createProjectile(
                projId,
                tip.x,
                tip.z,
                turretWorldAngle,
                this.config.projectileSpeed,
                this.config.maxBounces,
                this.localId,
                this.scene,
            );
            this.projectiles.push(proj);
            this.projectileSpawnTimes.set(projId, this.clock.getElapsedTime());

            createMuzzleFlash(this.scene, tip.x, tip.z);
            this.audio.play('fire', 0.4);

            // Broadcast
            this.callbacks.onFire(fireEvent);
        }
    }

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
                this.localHp--;
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
