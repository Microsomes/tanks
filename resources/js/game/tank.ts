import * as THREE from 'three';
import type { TankMesh } from './types';

export function createTankMesh(color: string, name: string): TankMesh {
    const group = new THREE.Group();
    const colorHex = new THREE.Color(color);

    // Body (hull)
    const bodyGeo = new THREE.BoxGeometry(2.2, 0.8, 3);
    const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex, flatShading: true });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.5;
    body.castShadow = true;
    group.add(body);

    // Tracks (left and right)
    const trackGeo = new THREE.BoxGeometry(0.4, 0.5, 3.2);
    const trackMat = new THREE.MeshLambertMaterial({ color: 0x333333, flatShading: true });
    const leftTrack = new THREE.Mesh(trackGeo, trackMat);
    leftTrack.position.set(-1.3, 0.35, 0);
    leftTrack.castShadow = true;
    group.add(leftTrack);

    const rightTrack = new THREE.Mesh(trackGeo, trackMat);
    rightTrack.position.set(1.3, 0.35, 0);
    rightTrack.castShadow = true;
    group.add(rightTrack);

    // Turret group (rotates independently)
    const turret = new THREE.Group();
    turret.position.y = 1.0;

    // Turret base
    const turretGeo = new THREE.BoxGeometry(1.4, 0.6, 1.6);
    const turretMat = new THREE.MeshLambertMaterial({
        color: colorHex.clone().multiplyScalar(0.8),
        flatShading: true,
    });
    const turretMesh = new THREE.Mesh(turretGeo, turretMat);
    turretMesh.position.y = 0.3;
    turretMesh.castShadow = true;
    turret.add(turretMesh);

    // Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.15, 0.2, 2.5, 6);
    barrelGeo.rotateX(Math.PI / 2);
    const barrelMat = new THREE.MeshLambertMaterial({ color: 0x444444, flatShading: true });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(0, 0.3, -1.8);
    barrel.castShadow = true;
    turret.add(barrel);

    group.add(turret);

    // HP bar (3 segments)
    const hpBar = createHpBar();
    hpBar.position.y = 2.2;
    group.add(hpBar);

    // Name label
    const nameSprite = createNameSprite(name, color);
    nameSprite.position.y = 2.8;
    group.add(nameSprite);

    return { group, body, turret, barrel, hpBar, nameSprite };
}

function createHpBar(): THREE.Group {
    const hpBar = new THREE.Group();
    const segmentWidth = 0.6;
    const gap = 0.1;

    for (let i = 0; i < 3; i++) {
        const geo = new THREE.PlaneGeometry(segmentWidth, 0.15);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x4ade80,
            side: THREE.DoubleSide,
            depthTest: false,
        });
        const segment = new THREE.Mesh(geo, mat);
        segment.position.x = (i - 1) * (segmentWidth + gap);
        segment.name = `hp-${i}`;
        hpBar.add(segment);
    }

    return hpBar;
}

export function updateHpBar(hpBar: THREE.Group, hp: number) {
    for (let i = 0; i < 3; i++) {
        const segment = hpBar.getObjectByName(`hp-${i}`) as THREE.Mesh;
        if (!segment) continue;
        const mat = segment.material as THREE.MeshBasicMaterial;
        if (i < hp) {
            mat.color.setHex(hp === 1 ? 0xf87171 : hp === 2 ? 0xfacc15 : 0x4ade80);
            mat.opacity = 1;
        } else {
            mat.color.setHex(0x333333);
            mat.opacity = 0.3;
        }
        mat.transparent = true;
    }
}

function createNameSprite(name: string, color: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(name.substring(0, 12), 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
        map: texture,
        depthTest: false,
        transparent: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3, 0.75, 1);
    return sprite;
}

export function getBarrelTip(tankGroup: THREE.Group, turret: THREE.Group, bodyRotation: number): THREE.Vector3 {
    // Barrel tip is at (0, 0.3, -3.0) in turret-local space.
    // Turret is a child of the tank group, so we need to apply both
    // the turret's local rotation AND the body rotation to get world space.
    const tip = new THREE.Vector3(0, 0, -3.0);

    // Apply turret local rotation (relative to body)
    tip.applyAxisAngle(new THREE.Vector3(0, 1, 0), turret.rotation.y);

    // Apply body rotation
    tip.applyAxisAngle(new THREE.Vector3(0, 1, 0), bodyRotation);

    // Add tank world position
    tip.add(tankGroup.position);
    tip.y = 0.5;
    return tip;
}
