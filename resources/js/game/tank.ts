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

const BAR_WIDTH = 2.2;
const BAR_HEIGHT = 0.15;

function createHpBar(): THREE.Group {
    const hpBar = new THREE.Group();

    // Background (dark)
    const bgGeo = new THREE.PlaneGeometry(BAR_WIDTH, BAR_HEIGHT);
    const bgMat = new THREE.MeshBasicMaterial({
        color: 0x333333,
        side: THREE.DoubleSide,
        depthTest: false,
        transparent: true,
        opacity: 0.5,
    });
    const bg = new THREE.Mesh(bgGeo, bgMat);
    bg.name = 'hp-bg';
    hpBar.add(bg);

    // Foreground (colored fill)
    const fgGeo = new THREE.PlaneGeometry(BAR_WIDTH, BAR_HEIGHT);
    const fgMat = new THREE.MeshBasicMaterial({
        color: 0x4ade80,
        side: THREE.DoubleSide,
        depthTest: false,
    });
    const fg = new THREE.Mesh(fgGeo, fgMat);
    fg.name = 'hp-fg';
    fg.position.z = -0.001; // slightly in front
    hpBar.add(fg);

    return hpBar;
}

export function updateHpBar(hpBar: THREE.Group, hp: number, maxHp = 5) {
    const fg = hpBar.getObjectByName('hp-fg') as THREE.Mesh;
    if (!fg) return;

    const ratio = Math.max(0, hp) / maxHp;
    const mat = fg.material as THREE.MeshBasicMaterial;

    // Scale width and shift left so bar drains from right
    fg.scale.x = ratio;
    fg.position.x = -(BAR_WIDTH * (1 - ratio)) / 2;

    // Color based on ratio
    if (ratio > 0.6) {
        mat.color.setHex(0x4ade80); // green
    } else if (ratio > 0.3) {
        mat.color.setHex(0xfacc15); // yellow
    } else {
        mat.color.setHex(0xf87171); // red
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
    // Dark outline for readability
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeText(name.substring(0, 12), 128, 32);
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
    sprite.userData.name = name;
    return sprite;
}

export function recolorTankMesh(tankMesh: TankMesh, newColor: string) {
    const colorHex = new THREE.Color(newColor);

    // Body
    (tankMesh.body.material as THREE.MeshLambertMaterial).color.copy(colorHex);

    // Turret base (first mesh child of turret group)
    tankMesh.turret.children.forEach(child => {
        if (child instanceof THREE.Mesh && child !== tankMesh.barrel) {
            (child.material as THREE.MeshLambertMaterial).color.copy(colorHex.clone().multiplyScalar(0.8));
        }
    });

    // Name sprite — redraw with new color
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const name = tankMesh.nameSprite.userData.name || '';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeText(name.substring(0, 12), 128, 32);
    ctx.fillStyle = newColor;
    ctx.fillText(name.substring(0, 12), 128, 32);
    const oldTexture = (tankMesh.nameSprite.material as THREE.SpriteMaterial).map;
    oldTexture?.dispose();
    (tankMesh.nameSprite.material as THREE.SpriteMaterial).map = new THREE.CanvasTexture(canvas);
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
