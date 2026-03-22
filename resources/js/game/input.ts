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

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', onContextMenu);

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
