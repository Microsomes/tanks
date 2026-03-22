<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { ref, reactive, onMounted, onUnmounted, nextTick, computed } from 'vue';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { GameEngine } from '@/game/engine';
import { GameNetwork } from '@/game/network';
import { DEFAULT_CONFIG, TANK_COLORS } from '@/game/types';
import type { PlayerInfo, GamePhase, TankState, FireEvent, HitEvent } from '@/game/types';

// ─── State ───────────────────────────────────────────────────────
const phase = ref<GamePhase>('lobby');
const nickname = ref('');
const roomCode = ref('');
const roomCodeInput = ref('');
const joiningViaLink = ref(false);
const selectedColor = ref(TANK_COLORS[0]);
const localId = ref('');
const isAdmin = ref(false);
const countdown = ref(0);
const myHp = ref(DEFAULT_CONFIG.maxHp);
const alive = ref(true);
const winner = ref('');
const winnerId = ref('');
const killFeed = reactive<{ killer: string; target: string; time: number }[]>([]);
const canvasRef = ref<HTMLCanvasElement | null>(null);

interface LobbyPlayer {
    id: string;
    name: string;
    color: string;
    isAdmin: boolean;
    ready: boolean;
}

const players = reactive<LobbyPlayer[]>([]);
const localReady = ref(false);
const errorMsg = ref('');

let network: GameNetwork | null = null;
let engine: GameEngine | null = null;
let echo: Echo<'reverb'> | null = null;

const MAX_PLAYERS = 8;

// ─── Computed ────────────────────────────────────────────────────
const alivePlayers = computed(() => {
    if (!engine) return 0;
    return engine.getAlivePlayerCount();
});

const takenColors = computed(() => {
    return new Set(players.filter(p => p.id !== localId.value).map(p => p.color));
});

const roomFull = computed(() => players.length >= MAX_PLAYERS);

const allReady = computed(() => {
    const others = players.filter(p => p.id !== localId.value);
    return others.length === 0 || others.every(p => p.ready);
});

const readyCount = computed(() => {
    return players.filter(p => p.ready || p.isAdmin).length;
});

// ─── Room Management ─────────────────────────────────────────────
function generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function initEcho() {
    if (echo) return;
    echo = new Echo({
        broadcaster: 'reverb',
        key: import.meta.env.VITE_REVERB_APP_KEY,
        wsHost: import.meta.env.VITE_REVERB_HOST,
        wsPort: Number(import.meta.env.VITE_REVERB_PORT),
        wssPort: Number(import.meta.env.VITE_REVERB_PORT),
        forceTLS: import.meta.env.VITE_REVERB_SCHEME === 'https',
        enabledTransports: ['ws', 'wss'],
        authEndpoint: '/game/presence-auth',
        auth: {
            headers: {
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
            },
            params: {
                nickname: nickname.value,
            },
        },
    });
}


async function createRoom() {
    if (!nickname.value.trim()) {
        errorMsg.value = 'Enter a nickname';
        return;
    }
    errorMsg.value = '';
    const code = generateRoomCode();
    roomCode.value = code;
    isAdmin.value = true;
    await joinChannel(code);
}

async function joinRoom() {
    if (!nickname.value.trim()) {
        errorMsg.value = 'Enter a nickname';
        return;
    }
    if (!roomCodeInput.value.trim() || roomCodeInput.value.trim().length !== 4) {
        errorMsg.value = 'Enter a valid 4-letter room code';
        return;
    }
    errorMsg.value = '';
    const code = roomCodeInput.value.trim().toUpperCase();
    roomCode.value = code;
    isAdmin.value = false;
    await joinChannel(code);

    if (players.length > MAX_PLAYERS) {
        errorMsg.value = 'Room is full (max 8 players)';
        network?.leave();
        network = null;
        roomCode.value = '';
        players.splice(0, players.length);
        return;
    }
}

async function joinChannel(code: string) {
    initEcho();

    network = new GameNetwork(echo!, {
        onPlayersUpdate(members, myId) {
            players.splice(0, players.length);
            const usedColors = new Set<string>();
            members.forEach((m, i) => {
                const color = m.id === myId ? selectedColor.value : (m.color || pickAvailableColor(usedColors));
                usedColors.add(color);
                players.push({
                    id: m.id,
                    name: m.name,
                    color,
                    isAdmin: i === 0,
                    ready: m.id === myId ? false : false,
                });
            });
            localId.value = myId;
            if (members.length === 1) {
                isAdmin.value = true;
                players[0].isAdmin = true;
            }
            // Pick first available color if ours is taken
            const otherColors = new Set(players.filter(p => p.id !== myId).map(p => p.color));
            if (otherColors.has(selectedColor.value)) {
                selectedColor.value = pickAvailableColor(otherColors);
            }
            // Set our color in the player list and broadcast
            const me = players.find(p => p.id === myId);
            if (me) me.color = selectedColor.value;
            network?.sendColorChange({ id: myId, color: selectedColor.value });
        },
        onPlayerJoin(member) {
            players.push({
                id: member.id,
                name: member.name,
                color: member.color || TANK_COLORS[0],
                isAdmin: false,
                ready: false,
            });
        },
        onPlayerLeave(member) {
            const idx = players.findIndex(p => p.id === member.id);
            if (idx >= 0) players.splice(idx, 1);
            if (players.length > 0) {
                players[0].isAdmin = true;
                if (players[0].id === localId.value) {
                    isAdmin.value = true;
                }
            }
            if (engine) {
                engine.removeRemoteTank(member.id);
            }
        },
        onColorChange(data) {
            const p = players.find(p => p.id === data.id);
            if (p) p.color = data.color;
        },
        onReadyChange(data) {
            const p = players.find(p => p.id === data.id);
            if (p) p.ready = data.ready;
        },
        onTankState(state: TankState) {
            engine?.updateRemoteTankState(state);
        },
        onFire(event: FireEvent) {
            engine?.spawnRemoteProjectile(event);
        },
        onHit(event: HitEvent) {
            engine?.handleRemoteHit(event.targetId, event.projectileId);
        },
        onDeath(data) {
            engine?.handleRemoteDeath(data.id, data.killerId);
            checkWinCondition();
        },
        onGameStart(data) {
            startGame(data.countdown, data.spawnAssignments);
        },
        onGameOver(data) {
            phase.value = 'gameover';
            winner.value = data.winnerName;
            winnerId.value = data.winnerId;
        },
        onRestart() {
            resetGame();
        },
    });

    try {
        await network.join(code, nickname.value);
    } catch (err) {
        errorMsg.value = 'Failed to join room. Check the code and try again.';
        console.error(err);
    }
}

// ─── Game Start ──────────────────────────────────────────────────
function adminStartGame() {
    if (!isAdmin.value || players.length < 1) return; // Allow 1 for testing, ideally 2+

    // Assign spawn positions
    const assignments: Record<string, number> = {};
    players.forEach((p, i) => {
        assignments[p.id] = i;
    });

    network?.sendGameStart({ countdown: 3, spawnAssignments: assignments });
    startGame(3, assignments);
}

async function startGame(countdownSec: number, spawnAssignments: Record<string, number>) {
    phase.value = 'countdown';
    countdown.value = countdownSec;
    myHp.value = DEFAULT_CONFIG.maxHp;
    alive.value = true;
    winner.value = '';
    killFeed.splice(0, killFeed.length);

    // Countdown
    for (let i = countdownSec; i > 0; i--) {
        countdown.value = i;
        await sleep(1000);
    }
    countdown.value = 0;

    phase.value = 'playing';
    await nextTick();

    if (!canvasRef.value) return;

    // Find local player info
    const localPlayer = players.find(p => p.id === localId.value);
    const localInfo: PlayerInfo = {
        id: localId.value,
        name: localPlayer?.name || nickname.value,
        color: localPlayer?.color || TANK_COLORS[0],
        isAdmin: isAdmin.value,
    };

    engine = new GameEngine(canvasRef.value, localId.value, localInfo, {
        onFire(event) {
            network?.sendFire(event);
        },
        onTankState(state) {
            network?.sendTankState(state);
        },
        onHit(data) {
            network?.sendHit(data);
        },
        onDeath(data) {
            alive.value = false;
            network?.sendDeath(data);
            checkWinCondition();
        },
        onGameOver(data) {
            phase.value = 'gameover';
            winner.value = data.winnerName;
            winnerId.value = data.winnerId;
            network?.sendGameOver(data);
        },
        onHpChange(hp) {
            myHp.value = hp;
        },
        onKill(killerName, targetName) {
            killFeed.push({ killer: killerName, target: targetName, time: Date.now() });
            // Keep only last 5
            if (killFeed.length > 5) killFeed.shift();
        },
    });

    engine.init();
    engine.spawnLocal(spawnAssignments[localId.value] ?? 0);

    // Add remote tanks
    for (const p of players) {
        if (p.id !== localId.value) {
            engine.addRemoteTank(p.id, {
                id: p.id,
                name: p.name,
                color: p.color,
                isAdmin: p.isAdmin,
            }, spawnAssignments[p.id] ?? 0);
        }
    }

    engine.start();
}

function checkWinCondition() {
    if (!engine || phase.value !== 'playing') return;

    const totalPlayers = engine.getTotalPlayerCount();
    if (totalPlayers < 1) return; // Allow solo play

    const aliveCount = engine.getAlivePlayerCount();
    if (aliveCount <= 1) {
        // Find the winner
        let wId = '';
        let wName = '';

        if (alive.value) {
            wId = localId.value;
            wName = nickname.value;
        } else {
            for (const p of players) {
                if (p.id !== localId.value) {
                    wId = p.id;
                    wName = p.name;
                    break;
                }
            }
        }

        phase.value = 'gameover';
        winner.value = wName;
        winnerId.value = wId;
        if (isAdmin.value) {
            network?.sendGameOver({ winnerId: wId, winnerName: wName });
        }
    }
}

function resetGame() {
    engine?.destroy();
    engine = null;
    phase.value = 'lobby';
    myHp.value = DEFAULT_CONFIG.maxHp;
    alive.value = true;
    winner.value = '';
    winnerId.value = '';
    localReady.value = false;
    killFeed.splice(0, killFeed.length);
    // Reset ready state for all players
    players.forEach(p => p.ready = false);
}

function adminRestart() {
    network?.sendRestart();
    resetGame();
}

// ─── Lifecycle ───────────────────────────────────────────────────
onMounted(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code && code.length === 4) {
        roomCodeInput.value = code.toUpperCase();
        joiningViaLink.value = true;
    }
});

onUnmounted(() => {
    engine?.destroy();
    network?.leave();
});

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function copyRoomCode() {
    navigator.clipboard.writeText(roomCode.value);
}

function copyJoinLink() {
    const url = `${window.location.origin}/game?code=${roomCode.value}`;
    navigator.clipboard.writeText(url);
}

function pickAvailableColor(used: Set<string>): string {
    return TANK_COLORS.find(c => !used.has(c)) ?? TANK_COLORS[0];
}

function pickColor(color: string) {
    if (takenColors.value.has(color)) return;
    selectedColor.value = color;
    // Update our local player entry
    const me = players.find(p => p.id === localId.value);
    if (me) me.color = color;
    // Broadcast to others
    network?.sendColorChange({ id: localId.value, color });
}

function toggleReady() {
    localReady.value = !localReady.value;
    const me = players.find(p => p.id === localId.value);
    if (me) me.ready = localReady.value;
    network?.sendReadyChange({ id: localId.value, ready: localReady.value });
}
</script>

<template>
    <Head title="Tanks!" />

    <!-- LOBBY -->
    <div v-if="phase === 'lobby' && !roomCode" class="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div class="w-full max-w-md p-8">
            <!-- Title -->
            <div class="text-center mb-10">
                <h1 class="text-6xl font-black text-white tracking-tight">
                    TANKS<span class="text-emerald-400">!</span>
                </h1>
                <p class="text-gray-400 mt-2 text-sm font-mono">Low-poly multiplayer mayhem</p>
            </div>

            <!-- Nickname -->
            <div class="mb-6">
                <input
                    v-model="nickname"
                    type="text"
                    placeholder="Your nickname"
                    maxlength="12"
                    class="w-full px-4 py-3 bg-[#2a2a4a] border border-[#3a3a6a] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-400 font-mono text-center text-lg"
                    @keydown.enter="joiningViaLink ? joinRoom() : createRoom()"
                />
            </div>

            <!-- Join via link: simplified -->
            <div v-if="joiningViaLink" class="space-y-3">
                <p class="text-center text-gray-400 font-mono text-sm mb-2">Joining room <span class="text-emerald-400 font-bold tracking-widest">{{ roomCodeInput }}</span></p>
                <button
                    @click="joinRoom"
                    class="w-full py-3 bg-blue-500 hover:bg-blue-400 text-black font-bold rounded-lg transition-colors text-lg font-mono"
                >
                    JOIN GAME
                </button>
                <button
                    @click="joiningViaLink = false"
                    class="w-full py-2 text-gray-500 hover:text-gray-300 transition-colors text-sm font-mono"
                >
                    or create your own room
                </button>
            </div>

            <!-- Normal lobby -->
            <div v-else class="space-y-3">
                <button
                    @click="createRoom"
                    class="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg transition-colors text-lg font-mono"
                >
                    CREATE ROOM
                </button>

                <div class="flex items-center gap-3">
                    <input
                        v-model="roomCodeInput"
                        type="text"
                        placeholder="CODE"
                        maxlength="4"
                        class="flex-1 px-4 py-3 bg-[#2a2a4a] border border-[#3a3a6a] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-400 font-mono text-center text-lg uppercase tracking-widest"
                        @keydown.enter="joinRoom"
                    />
                    <button
                        @click="joinRoom"
                        class="px-6 py-3 bg-blue-500 hover:bg-blue-400 text-black font-bold rounded-lg transition-colors font-mono"
                    >
                        JOIN
                    </button>
                </div>
            </div>

            <p v-if="errorMsg" class="text-red-400 text-sm text-center mt-4 font-mono">{{ errorMsg }}</p>
        </div>
    </div>

    <!-- WAITING ROOM -->
    <div v-else-if="phase === 'lobby' && roomCode" class="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div class="w-full max-w-md p-8">
            <div class="text-center mb-6">
                <h2 class="text-2xl font-bold text-white font-mono mb-4">WAITING ROOM</h2>
                <div class="flex items-center justify-center gap-3">
                    <span class="text-4xl font-black text-emerald-400 tracking-[0.3em] font-mono">{{ roomCode }}</span>
                    <button
                        @click="copyRoomCode"
                        class="text-gray-400 hover:text-white transition-colors text-sm font-mono border border-gray-600 px-2 py-1 rounded"
                    >
                        COPY
                    </button>
                </div>
                <div class="flex items-center justify-center gap-2 mt-2">
                    <button
                        @click="copyJoinLink"
                        class="text-emerald-400 hover:text-emerald-300 transition-colors text-xs font-mono border border-emerald-400/30 px-2 py-1 rounded"
                    >
                        COPY LINK
                    </button>
                </div>
            </div>

            <!-- Color Picker -->
            <div class="mb-6">
                <p class="text-gray-500 text-xs font-mono text-center mb-2">YOUR COLOR</p>
                <div class="flex justify-center gap-2 flex-wrap">
                    <button
                        v-for="color in TANK_COLORS"
                        :key="color"
                        @click="pickColor(color)"
                        :disabled="takenColors.has(color)"
                        class="w-8 h-8 rounded-full transition-all"
                        :class="[
                            selectedColor === color
                                ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1a1a2e] scale-110'
                                : takenColors.has(color)
                                    ? 'opacity-20 cursor-not-allowed'
                                    : 'opacity-50 hover:opacity-80',
                        ]"
                        :style="{ backgroundColor: color }"
                    />
                </div>
            </div>

            <!-- Player List -->
            <div class="space-y-2 mb-6">
                <div
                    v-for="player in players"
                    :key="player.id"
                    class="flex items-center gap-3 px-4 py-3 bg-[#2a2a4a] rounded-lg border border-[#3a3a6a]"
                >
                    <div
                        class="w-4 h-4 rounded-full shrink-0"
                        :style="{ backgroundColor: player.color }"
                    />
                    <span class="text-white font-mono flex-1">{{ player.name }}</span>
                    <span v-if="player.isAdmin" class="text-xs text-yellow-400 font-mono border border-yellow-400/30 px-2 py-0.5 rounded">
                        HOST
                    </span>
                    <span v-else-if="player.ready" class="text-xs text-emerald-400 font-mono border border-emerald-400/30 px-2 py-0.5 rounded">
                        READY
                    </span>
                    <span v-else class="text-xs text-gray-500 font-mono">
                        ...
                    </span>
                    <span v-if="player.id === localId" class="text-xs text-gray-400 font-mono">
                        (you)
                    </span>
                </div>
            </div>

            <p class="text-center text-gray-600 text-xs font-mono mb-4">{{ players.length }}/{{ MAX_PLAYERS }} players</p>

            <!-- Ready / Start -->
            <div v-if="isAdmin" class="space-y-2">
                <button
                    @click="adminStartGame"
                    :disabled="players.length < 1"
                    class="w-full py-4 font-bold rounded-lg transition-colors text-xl font-mono"
                    :class="allReady
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-black'
                        : 'bg-yellow-500 hover:bg-yellow-400 text-black'"
                >
                    {{ allReady ? 'START GAME' : 'FORCE START' }}
                </button>
                <p v-if="players.length < 1" class="text-center text-gray-500 text-xs font-mono">Need at least 1 player</p>
                <p v-else-if="!allReady" class="text-center text-gray-500 text-xs font-mono">Waiting for players to ready up ({{ readyCount }}/{{ players.length }})</p>
            </div>
            <div v-else>
                <button
                    @click="toggleReady"
                    class="w-full py-4 font-bold rounded-lg transition-colors text-xl font-mono"
                    :class="localReady
                        ? 'bg-gray-600 hover:bg-gray-500 text-white'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-black'"
                >
                    {{ localReady ? 'UNREADY' : 'READY UP' }}
                </button>
                <p class="text-center text-gray-500 text-xs font-mono mt-2">Waiting for host to start...</p>
            </div>
        </div>
    </div>

    <!-- COUNTDOWN -->
    <div v-else-if="phase === 'countdown'" class="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div class="text-center">
            <div class="text-[12rem] font-black text-emerald-400 leading-none font-mono animate-pulse">
                {{ countdown }}
            </div>
            <p class="text-gray-400 font-mono mt-4">Get ready!</p>
        </div>
    </div>

    <!-- GAME -->
    <div v-show="phase === 'playing' || (phase === 'gameover' && canvasRef)" class="relative w-screen h-screen overflow-hidden">
        <canvas ref="canvasRef" class="block w-full h-full" />

        <!-- HUD -->
        <div class="absolute top-0 left-0 right-0 p-4 pointer-events-none">
            <div class="flex items-start justify-between">
                <!-- HP -->
                <div class="flex items-center gap-2">
                    <div class="flex gap-1">
                        <div
                            v-for="i in DEFAULT_CONFIG.maxHp"
                            :key="i"
                            class="w-8 h-3 rounded-sm transition-colors"
                            :class="i <= myHp
                                ? (myHp === 1 ? 'bg-red-500' : myHp === 2 ? 'bg-yellow-400' : 'bg-emerald-400')
                                : 'bg-gray-700'"
                        />
                    </div>
                    <span class="text-white font-mono text-sm">{{ myHp }}/{{ DEFAULT_CONFIG.maxHp }}</span>
                </div>

                <!-- Room code -->
                <div class="text-gray-500 font-mono text-xs">{{ roomCode }}</div>
            </div>
        </div>

        <!-- Kill feed -->
        <div class="absolute top-16 right-4 space-y-1 pointer-events-none">
            <div
                v-for="(kill, i) in killFeed"
                :key="i"
                class="text-xs font-mono px-3 py-1 bg-black/50 rounded text-white"
            >
                <span class="text-red-400">{{ kill.killer }}</span>
                <span class="text-gray-500"> eliminated </span>
                <span class="text-gray-300">{{ kill.target }}</span>
            </div>
        </div>

        <!-- Dead overlay -->
        <div v-if="!alive && phase === 'playing'" class="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
            <div class="text-center">
                <p class="text-4xl font-black text-red-500 font-mono">ELIMINATED</p>
                <p class="text-gray-400 font-mono mt-2">Spectating...</p>
            </div>
        </div>

        <!-- Controls hint -->
        <div class="absolute bottom-4 left-4 pointer-events-none">
            <div class="text-gray-600 font-mono text-xs space-y-0.5">
                <p>W/A/S/D — Move up/left/down/right</p>
                <p>Mouse — Aim turret</p>
                <p>Click — Fire</p>
            </div>
        </div>
    </div>

    <!-- GAME OVER -->
    <div v-if="phase === 'gameover'" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div class="text-center p-8">
            <template v-if="winnerId === localId">
                <p class="text-2xl text-emerald-400 font-mono mb-2">VICTORY</p>
                <p class="text-6xl font-black text-white font-mono mb-8">YOU WON!</p>
            </template>
            <template v-else>
                <p class="text-2xl text-gray-400 font-mono mb-2">DEFEATED</p>
                <p class="text-4xl font-black text-red-400 font-mono mb-2">{{ winner }}</p>
                <p class="text-lg text-gray-500 font-mono mb-8">wins the round</p>
            </template>

            <div v-if="isAdmin" class="space-y-3">
                <button
                    @click="adminRestart"
                    class="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg transition-colors font-mono"
                >
                    PLAY AGAIN
                </button>
            </div>
            <p v-else class="text-gray-500 font-mono text-sm">Waiting for host...</p>
        </div>
    </div>
</template>
