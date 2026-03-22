import * as THREE from 'three';

export interface InputState {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    mouseX: number;
    mouseY: number;
    fire: boolean;
    firePressed: boolean;
}

export function createInputHandler(canvas: HTMLCanvasElement, camera: THREE.PerspectiveCamera) {
    const state: InputState = {
        up: false,
        down: false,
        left: false,
        right: false,
        mouseX: 0,
        mouseY: 0,
        fire: false,
        firePressed: false,
    };

    const raycaster = new THREE.Raycaster();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const mouse = new THREE.Vector2();
    const intersection = new THREE.Vector3();

    // Touch state tracking for multi-touch (left thumb moves, right thumb aims/fires)
    let leftTouchId: number | null = null;
    let leftTouchStart = { x: 0, y: 0 };
    let rightTouchId: number | null = null;
    let rightTouchStart = { x: 0, y: 0 };
    let rightTouchTime = 0;

    function onKeyDown(e: KeyboardEvent) {
        if (e.repeat) return;
        switch (e.code) {
            case 'KeyW': case 'ArrowUp': state.up = true; break;
            case 'KeyS': case 'ArrowDown': state.down = true; break;
            case 'KeyA': case 'ArrowLeft': state.left = true; break;
            case 'KeyD': case 'ArrowRight': state.right = true; break;
        }
    }

    function onKeyUp(e: KeyboardEvent) {
        switch (e.code) {
            case 'KeyW': case 'ArrowUp': state.up = false; break;
            case 'KeyS': case 'ArrowDown': state.down = false; break;
            case 'KeyA': case 'ArrowLeft': state.left = false; break;
            case 'KeyD': case 'ArrowRight': state.right = false; break;
        }
    }

    function onMouseMove(e: MouseEvent) {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        raycaster.ray.intersectPlane(groundPlane, intersection);

        state.mouseX = intersection.x;
        state.mouseY = intersection.z;
    }

    function onMouseDown(e: MouseEvent) {
        if (e.button === 0) {
            state.fire = true;
            state.firePressed = true;
        }
    }

    function onMouseUp(e: MouseEvent) {
        if (e.button === 0) {
            state.fire = false;
        }
    }

    function onContextMenu(e: Event) {
        e.preventDefault();
    }

    // Convert touch screen position to world coordinates (reuses raycaster logic from onMouseMove)
    const updateMouseFromTouch = (clientX: number, clientY: number) => {
        const rect = canvas.getBoundingClientRect();
        const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
        const touchIntersection = new THREE.Vector3();
        raycaster.ray.intersectPlane(groundPlane, touchIntersection);
        if (touchIntersection) {
            state.mouseX = touchIntersection.x;
            state.mouseY = touchIntersection.z;
        }
    };

    const onTouchStart = (e: TouchEvent) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            const halfW = window.innerWidth / 2;
            if (t.clientX < halfW && leftTouchId === null) {
                leftTouchId = t.identifier;
                leftTouchStart = { x: t.clientX, y: t.clientY };
            } else if (t.clientX >= halfW && rightTouchId === null) {
                rightTouchId = t.identifier;
                rightTouchStart = { x: t.clientX, y: t.clientY };
                rightTouchTime = performance.now();
                // Aim at touch position
                updateMouseFromTouch(t.clientX, t.clientY);
            }
        }
    };

    const onTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === leftTouchId) {
                const dx = t.clientX - leftTouchStart.x;
                const dy = t.clientY - leftTouchStart.y;
                const deadzone = 20;
                state.left = dx < -deadzone;
                state.right = dx > deadzone;
                state.up = dy < -deadzone;
                state.down = dy > deadzone;
            } else if (t.identifier === rightTouchId) {
                updateMouseFromTouch(t.clientX, t.clientY);
            }
        }
    };

    const onTouchEnd = (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === leftTouchId) {
                leftTouchId = null;
                state.up = false;
                state.down = false;
                state.left = false;
                state.right = false;
            } else if (t.identifier === rightTouchId) {
                // Tap to fire (short touch)
                if (performance.now() - rightTouchTime < 300) {
                    state.fire = true;
                    state.firePressed = true;
                }
                rightTouchId = null;
            }
        }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });

    const onBlur = () => {
        state.up = false;
        state.down = false;
        state.left = false;
        state.right = false;
        state.fire = false;
    };
    window.addEventListener('blur', onBlur);

    function destroy() {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('mousedown', onMouseDown);
        canvas.removeEventListener('mouseup', onMouseUp);
        canvas.removeEventListener('contextmenu', onContextMenu);
        canvas.removeEventListener('touchstart', onTouchStart);
        canvas.removeEventListener('touchmove', onTouchMove);
        canvas.removeEventListener('touchend', onTouchEnd);
        window.removeEventListener('blur', onBlur);
    }

    function consumeFire(): boolean {
        if (state.firePressed) {
            state.firePressed = false;
            return true;
        }
        return false;
    }

    return { state, destroy, consumeFire };
}
