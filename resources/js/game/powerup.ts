import * as THREE from 'three';
import type { PowerupType, Wall, GameConfig } from './types';

export interface PowerupObject {
    id: string;
    type: PowerupType;
    group: THREE.Group;
    glowMesh: THREE.Mesh;
    spawnTime: number;
    x: number;
    z: number;
}

const POWERUP_COLORS: Record<PowerupType, number> = {
    health: 0xff4444,
    triple_shot: 0xffaa00,
    speed_boost: 0x44aaff,
    shield: 0x44ffaa,
    rapid_fire: 0xffff44,
    rain_bullets: 0xff4400,
    mega_bounce: 0x8844ff,
    ghost: 0xaaaacc,
    magnet: 0xff44ff,
    freeze: 0x44ddff,
    big_shot: 0xff2266,
    landmine: 0x886644,
};

export function createPowerupMesh(
    id: string,
    type: PowerupType,
    x: number,
    z: number,
    scene: THREE.Scene,
): PowerupObject {
    const group = new THREE.Group();
    group.position.set(x, 1.0, z);

    const color = POWERUP_COLORS[type];
    const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });

    // Inner shape per type
    switch (type) {
        case 'health': {
            const h = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.2), mat);
            const v = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.8), mat);
            group.add(h, v);
            break;
        }
        case 'triple_shot': {
            for (const offset of [-0.3, 0, 0.3]) {
                const s = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), mat);
                s.position.x = offset;
                group.add(s);
            }
            break;
        }
        case 'speed_boost': {
            const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 4), mat);
            arrow.rotation.x = -Math.PI / 2;
            group.add(arrow);
            break;
        }
        case 'shield': {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.1, 8, 12), mat);
            group.add(ring);
            break;
        }
        case 'rapid_fire': {
            const bolt1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.15), mat);
            bolt1.rotation.z = 0.3;
            bolt1.position.set(-0.1, 0, 0);
            const bolt2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.15), mat);
            bolt2.rotation.z = -0.3;
            bolt2.position.set(0.1, 0, 0);
            group.add(bolt1, bolt2);
            break;
        }
        case 'rain_bullets': {
            const fireMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.9 });
            const core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4), fireMat);
            group.add(core);
            const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.7 });
            for (let i = 0; i < 5; i++) {
                const flame = new THREE.Mesh(new THREE.SphereGeometry(0.15, 4, 3), flameMat);
                const a = (Math.PI * 2 * i) / 5;
                flame.position.set(Math.cos(a) * 0.25, Math.sin(a) * 0.15 + 0.1, Math.sin(a) * 0.25);
                group.add(flame);
            }
            break;
        }
        case 'mega_bounce': {
            // Bouncing ball with arrows
            const ball = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 4), mat);
            group.add(ball);
            for (let i = 0; i < 4; i++) {
                const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 3), mat);
                const a = (Math.PI * 2 * i) / 4;
                arrow.position.set(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);
                arrow.rotation.z = -a + Math.PI / 2;
                group.add(arrow);
            }
            break;
        }
        case 'ghost': {
            // Ghost silhouette — transparent layered spheres
            const ghostMat = new THREE.MeshBasicMaterial({ color: 0xaaaacc, transparent: true, opacity: 0.5 });
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4), ghostMat);
            body.position.y = 0.1;
            group.add(body);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), ghostMat);
            head.position.y = 0.35;
            group.add(head);
            // Eyes
            const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
            for (const side of [-0.08, 0.08]) {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 3), eyeMat);
                eye.position.set(side, 0.38, -0.15);
                group.add(eye);
            }
            break;
        }
        case 'magnet': {
            // U-shaped magnet
            const armMat = new THREE.MeshLambertMaterial({ color: 0xff4444, flatShading: true });
            const basePart = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.2), mat);
            basePart.position.y = 0.3;
            group.add(basePart);
            const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.2), armMat);
            leftArm.position.set(-0.22, 0.08, 0);
            group.add(leftArm);
            const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.2), armMat);
            rightArm.position.set(0.22, 0.08, 0);
            group.add(rightArm);
            break;
        }
        case 'freeze': {
            // Snowflake / ice crystal
            const iceMat = new THREE.MeshBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 0.8 });
            for (let i = 0; i < 3; i++) {
                const shard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), iceMat);
                shard.rotation.z = (Math.PI * i) / 3;
                group.add(shard);
            }
            const center = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), iceMat);
            group.add(center);
            break;
        }
        case 'big_shot': {
            // Oversized bullet
            const bulletMat = new THREE.MeshLambertMaterial({ color: 0xff2266, flatShading: true });
            const bullet = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 4), bulletMat);
            group.add(bullet);
            const trail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 4), mat);
            trail.rotation.x = Math.PI / 2;
            trail.position.z = 0.35;
            group.add(trail);
            break;
        }
        case 'landmine': {
            // Flat disc with spikes
            const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 8), mat);
            group.add(disc);
            for (let i = 0; i < 6; i++) {
                const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 3), mat);
                const a = (Math.PI * 2 * i) / 6;
                spike.position.set(Math.cos(a) * 0.2, 0.15, Math.sin(a) * 0.2);
                group.add(spike);
            }
            break;
        }
    }

    // Glow sphere
    const glowGeo = new THREE.SphereGeometry(0.7, 8, 6);
    const glowMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    group.add(glowMesh);

    // Point light for ground glow
    const light = new THREE.PointLight(color, 0.6, 5);
    light.position.y = 0.3;
    group.add(light);

    scene.add(group);

    return {
        id,
        type,
        group,
        glowMesh,
        spawnTime: performance.now(),
        x,
        z,
    };
}

export function updatePowerups(powerups: PowerupObject[], dt: number) {
    const now = performance.now();
    for (const p of powerups) {
        const elapsed = (now - p.spawnTime) / 1000;
        // Rotate
        p.group.rotation.y += dt * 2;
        // Bob up and down
        p.group.position.y = 1.0 + Math.sin(elapsed * 3) * 0.2;
        // Pulse glow
        const mat = p.glowMesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.2 + Math.sin(elapsed * 4) * 0.1;
    }
}

export function checkPowerupPickup(
    powerup: PowerupObject,
    tankX: number,
    tankZ: number,
    radius: number,
): boolean {
    const dx = powerup.x - tankX;
    const dz = powerup.z - tankZ;
    return Math.sqrt(dx * dx + dz * dz) < radius;
}

export function removePowerup(powerup: PowerupObject, scene: THREE.Scene) {
    scene.remove(powerup.group);
    powerup.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            } else {
                child.material.dispose();
            }
        }
        if (child instanceof THREE.PointLight) {
            child.dispose();
        }
    });
}

export function createPickupEffect(scene: THREE.Scene, x: number, z: number, type: PowerupType) {
    const color = POWERUP_COLORS[type];
    const count = 8;
    const particles: THREE.Mesh[] = [];
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < count; i++) {
        const geo = new THREE.SphereGeometry(0.1, 4, 3);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
        const p = new THREE.Mesh(geo, mat);
        p.position.set(x, 1.0, z);
        scene.add(p);
        particles.push(p);

        const angle = (Math.PI * 2 * i) / count;
        velocities.push(new THREE.Vector3(
            Math.cos(angle) * 3,
            3 + Math.random() * 2,
            Math.sin(angle) * 3,
        ));
    }

    let elapsed = 0;
    const animate = () => {
        elapsed += 0.016;
        for (let i = 0; i < particles.length; i++) {
            particles[i].position.add(velocities[i].clone().multiplyScalar(0.016));
            velocities[i].y -= 9.8 * 0.016;
            (particles[i].material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - elapsed * 3);
        }
        if (elapsed < 0.5) {
            requestAnimationFrame(animate);
        } else {
            for (const p of particles) {
                scene.remove(p);
                p.geometry.dispose();
                (p.material as THREE.Material).dispose();
            }
        }
    };
    requestAnimationFrame(animate);
}

export function findValidSpawnPosition(walls: Wall[], config: GameConfig): { x: number; z: number } {
    const margin = 3;
    const halfW = config.arenaWidth / 2 - margin;
    const halfH = config.arenaHeight / 2 - margin;
    const clearance = 2.0;

    for (let attempt = 0; attempt < 20; attempt++) {
        const x = (Math.random() * 2 - 1) * halfW;
        const z = (Math.random() * 2 - 1) * halfH;

        let valid = true;
        for (const wall of walls) {
            if (
                x + clearance > wall.x - wall.width / 2 &&
                x - clearance < wall.x + wall.width / 2 &&
                z + clearance > wall.z - wall.depth / 2 &&
                z - clearance < wall.z + wall.depth / 2
            ) {
                valid = false;
                break;
            }
        }
        if (valid) return { x, z };
    }

    return { x: 0, z: config.arenaHeight * 0.2 };
}

export function createRainBulletEffect(
    scene: THREE.Scene,
    config: GameConfig,
): () => void {
    const drops: { group: THREE.Group; vy: number }[] = [];
    // Rain only covers center 60% of the arena
    const halfW = config.arenaWidth * 0.3;
    const halfH = config.arenaHeight * 0.3;
    let stopped = false;

    const fireColors = [0xff4400, 0xff6600, 0xff8800, 0xffaa00, 0xff2200];

    const spawnDrop = () => {
        const group = new THREE.Group();
        const color = fireColors[Math.floor(Math.random() * fireColors.length)];

        // Fire streak (elongated cylinder)
        const streakGeo = new THREE.CylinderGeometry(0.08, 0.12, 1.2, 4);
        const streakMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
        const streak = new THREE.Mesh(streakGeo, streakMat);
        group.add(streak);

        // Glow around the streak
        const glowGeo = new THREE.SphereGeometry(0.25, 4, 3);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.y = -0.3;
        group.add(glow);

        const x = (Math.random() * 2 - 1) * halfW;
        const z = (Math.random() * 2 - 1) * halfH;
        group.position.set(x, 18 + Math.random() * 6, z);

        // Slight angle for visual variety
        group.rotation.x = (Math.random() - 0.5) * 0.3;
        group.rotation.z = (Math.random() - 0.5) * 0.3;

        scene.add(group);
        drops.push({ group, vy: 0.5 + Math.random() * 0.3 });
    };

    const createImpact = (x: number, z: number) => {
        const impactGeo = new THREE.RingGeometry(0.1, 0.6, 6);
        const impactMat = new THREE.MeshBasicMaterial({
            color: 0xff4400,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const impact = new THREE.Mesh(impactGeo, impactMat);
        impact.rotation.x = -Math.PI / 2;
        impact.position.set(x, 0.05, z);
        scene.add(impact);

        let frame = 0;
        const animImpact = () => {
            frame++;
            impact.scale.multiplyScalar(1.15);
            impactMat.opacity -= 0.1;
            if (frame < 8) {
                requestAnimationFrame(animImpact);
            } else {
                scene.remove(impact);
                impactGeo.dispose();
                impactMat.dispose();
            }
        };
        requestAnimationFrame(animImpact);
    };

    // Spawn interval: every 80ms, 4 drops per tick
    const spawnInterval = setInterval(() => {
        if (stopped) return;
        for (let i = 0; i < 4; i++) {
            spawnDrop();
        }
    }, 80);

    // Animate drops falling
    const animateFalling = () => {
        if (stopped && drops.length === 0) return;
        for (let i = drops.length - 1; i >= 0; i--) {
            const d = drops[i];
            d.group.position.y -= d.vy;
            if (d.group.position.y <= 0) {
                createImpact(d.group.position.x, d.group.position.z);
                scene.remove(d.group);
                d.group.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.geometry.dispose();
                        (child.material as THREE.Material).dispose();
                    }
                });
                drops.splice(i, 1);
            }
        }
        requestAnimationFrame(animateFalling);
    };
    requestAnimationFrame(animateFalling);

    // Return cleanup function
    return () => {
        stopped = true;
        clearInterval(spawnInterval);
        for (const d of drops) {
            scene.remove(d.group);
            d.group.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    (child.material as THREE.Material).dispose();
                }
            });
        }
        drops.length = 0;
    };
}
