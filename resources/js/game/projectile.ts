import * as THREE from 'three';
import type { Projectile, Wall, GameConfig } from './types';

const MAX_TRAIL_LENGTH = 20;

export function createProjectile(
    id: string,
    x: number,
    z: number,
    angle: number,
    speed: number,
    maxBounces: number,
    shooterId: string,
    scene: THREE.Scene,
    damage = 1,
    color = '#ffffff',
): Projectile {
    const tankColor = new THREE.Color(color);

    // Projectile sphere
    const geo = new THREE.SphereGeometry(0.2, 6, 4);
    const mat = new THREE.MeshBasicMaterial({ color: tankColor });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.5, z);
    scene.add(mesh);

    // Glow
    const glowGeo = new THREE.SphereGeometry(0.35, 6, 4);
    const glowMat = new THREE.MeshBasicMaterial({
        color: tankColor,
        transparent: true,
        opacity: 0.4,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    mesh.add(glow);

    // Trail
    const trailPoints = [new THREE.Vector3(x, 0.5, z)];
    const trailGeo = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(MAX_TRAIL_LENGTH * 3);
    trailPositions[0] = x; trailPositions[1] = 0.5; trailPositions[2] = z;
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeo.setDrawRange(0, 1);
    const trailMat = new THREE.LineBasicMaterial({
        color: tankColor,
        transparent: true,
        opacity: 0.6,
    });
    const trail = new THREE.Line(trailGeo, trailMat);
    scene.add(trail);

    // Barrel points in direction (-sin(angle), -cos(angle)) in world space
    const vx = -Math.sin(angle) * speed;
    const vz = -Math.cos(angle) * speed;

    return {
        id,
        mesh,
        trail,
        trailPoints,
        vx,
        vz,
        bounceCount: 0,
        shooterId,
        alive: true,
        damage,
    };
}

/** Returns 'alive', 'bounced', or 'dead' */
export function updateProjectile(
    projectile: Projectile,
    dt: number,
    walls: Wall[],
    config: GameConfig,
): 'alive' | 'bounced' | 'dead' {
    if (!projectile.alive) return 'dead';

    let bounced = false;
    const { mesh } = projectile;
    let nx = mesh.position.x + projectile.vx * dt;
    let nz = mesh.position.z + projectile.vz * dt;
    const radius = 0.2;

    // Check wall collisions
    for (const wall of walls) {
        const halfW = wall.width / 2;
        const halfD = wall.depth / 2;
        const left = wall.x - halfW;
        const right = wall.x + halfW;
        const top = wall.z - halfD;
        const bottom = wall.z + halfD;

        // Expand wall by projectile radius
        if (
            nx + radius > left &&
            nx - radius < right &&
            nz + radius > top &&
            nz - radius < bottom
        ) {
            // Determine which face we're hitting based on previous position
            const ox = mesh.position.x;
            const oz = mesh.position.z;

            const wasLeft = ox <= left - radius;
            const wasRight = ox >= right + radius;
            const wasTop = oz <= top - radius;
            const wasBottom = oz >= bottom + radius;

            if (wasLeft || wasRight) {
                projectile.vx *= -1;
                nx = wasLeft ? left - radius : right + radius;
            } else if (wasTop || wasBottom) {
                projectile.vz *= -1;
                nz = wasTop ? top - radius : bottom + radius;
            } else {
                // Corner case — reverse both
                projectile.vx *= -1;
                projectile.vz *= -1;
                nx = mesh.position.x;
                nz = mesh.position.z;
            }

            projectile.bounceCount++;
            if (projectile.bounceCount >= 10) {
                projectile.alive = false;
                return 'dead';
            }
            bounced = true;
            break;
        }
    }

    // Clamp to arena bounds — kill if escaped
    const halfW = config.arenaWidth / 2;
    const halfH = config.arenaHeight / 2;
    if (nx < -halfW || nx > halfW || nz < -halfH || nz > halfH) {
        // Bounced out — push back in and reverse
        nx = Math.max(-halfW + 0.5, Math.min(halfW - 0.5, nx));
        nz = Math.max(-halfH + 0.5, Math.min(halfH - 0.5, nz));
        if (nx <= -halfW + 0.5 || nx >= halfW - 0.5) projectile.vx *= -1;
        if (nz <= -halfH + 0.5 || nz >= halfH - 0.5) projectile.vz *= -1;
    }

    mesh.position.x = nx;
    mesh.position.z = nz;
    mesh.position.y = 0.5; // Lock height

    // Update trail
    projectile.trailPoints.push(new THREE.Vector3(nx, 0.5, nz));
    if (projectile.trailPoints.length > MAX_TRAIL_LENGTH) {
        projectile.trailPoints.shift();
    }
    const positions = new Float32Array(projectile.trailPoints.length * 3);
    for (let j = 0; j < projectile.trailPoints.length; j++) {
        positions[j * 3] = projectile.trailPoints[j].x;
        positions[j * 3 + 1] = projectile.trailPoints[j].y;
        positions[j * 3 + 2] = projectile.trailPoints[j].z;
    }
    projectile.trail.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    projectile.trail.geometry.setDrawRange(0, projectile.trailPoints.length);

    return bounced ? 'bounced' : 'alive';
}

export function checkTankHit(
    projectile: Projectile,
    tankX: number,
    tankZ: number,
    tankId: string,
): boolean {
    if (!projectile.alive) return false;
    // Skip self-hit if no bounces yet (grace period in engine handles the rest)
    if (projectile.shooterId === tankId && projectile.bounceCount === 0) return false;

    const dx = projectile.mesh.position.x - tankX;
    const dz = projectile.mesh.position.z - tankZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    return dist < 1.5; // tank hit radius
}

export function removeProjectile(projectile: Projectile, scene: THREE.Scene) {
    scene.remove(projectile.mesh);
    scene.remove(projectile.trail);
    projectile.mesh.geometry.dispose();
    (projectile.mesh.material as THREE.Material).dispose();
    projectile.trail.geometry.dispose();
    (projectile.trail.material as THREE.Material).dispose();
    projectile.alive = false;
}

export function createMuzzleFlash(scene: THREE.Scene, x: number, z: number) {
    const geo = new THREE.SphereGeometry(0.5, 6, 4);
    const mat = new THREE.MeshBasicMaterial({
        color: 0xffdd44,
        transparent: true,
        opacity: 0.8,
    });
    const flash = new THREE.Mesh(geo, mat);
    flash.position.set(x, 0.5, z);
    scene.add(flash);

    let frame = 0;
    const animate = () => {
        frame++;
        flash.scale.multiplyScalar(1.15);
        mat.opacity -= 0.15;
        if (frame < 6) {
            requestAnimationFrame(animate);
        } else {
            scene.remove(flash);
            geo.dispose();
            mat.dispose();
        }
    };
    requestAnimationFrame(animate);
}

export function createExplosion(scene: THREE.Scene, x: number, z: number, color: string) {
    const particleCount = 12;
    const particles: THREE.Mesh[] = [];
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < particleCount; i++) {
        const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const mat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(color),
            transparent: true,
        });
        const particle = new THREE.Mesh(geo, mat);
        particle.position.set(x, 0.5, z);
        scene.add(particle);
        particles.push(particle);

        const angle = (Math.PI * 2 * i) / particleCount;
        const speed = 3 + Math.random() * 5;
        velocities.push(new THREE.Vector3(
            Math.cos(angle) * speed,
            2 + Math.random() * 4,
            Math.sin(angle) * speed,
        ));
    }

    let elapsed = 0;
    const animate = () => {
        elapsed += 0.016;
        for (let i = 0; i < particles.length; i++) {
            particles[i].position.add(velocities[i].clone().multiplyScalar(0.016));
            velocities[i].y -= 9.8 * 0.016;
            (particles[i].material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - elapsed * 2);
        }
        if (elapsed < 0.8) {
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
