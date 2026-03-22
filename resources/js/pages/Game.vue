<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { ref, reactive, onMounted, onUnmounted, nextTick, computed } from 'vue';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { GameEngine } from '@/game/engine';
import { GameNetwork } from '@/game/network';
import { AudioManager } from '@/game/audio';
import { DEFAULT_CONFIG, TANK_COLORS, GULAG_CONFIG } from '@/game/types';
import type { PlayerInfo, GamePhase, TankState, FireEvent, HitEvent, ActiveEffect, PowerupType, RainBulletsEvent, GulagEvent, GulagResultEvent } from '@/game/types';
import type { MapName } from '@/game/arena';
import { MAP_NAMES } from '@/game/arena';

const props = defineProps<{
    topPlayers?: { id: number; identifier: string; nickname: string; games_played: number; wins: number; kills: number; deaths: number }[];
    activeRooms?: { id: number; room_code: string; host_name: string; map_name: string; player_count: number; players_json: string[] | null; status: string; max_players: number }[];
    recentGames?: { id: number; room_code: string; map_name: string; player_count: number; winner_name: string; created_at: string }[];
    activeSession?: { room_code: string; player_identifier: string; nickname: string; color: string; map_name: string; spawn_index: number; hp: number; x: number; z: number; body_rotation: number; alive: boolean; is_admin: boolean } | null;
}>();

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
const activeEffects = reactive<ActiveEffect[]>([]);
const gameKills = reactive<Record<string, number>>({});
const gameDeaths = reactive<Record<string, number>>({});
const canvasRef = ref<HTMLCanvasElement | null>(null);
const selectedMap = ref<MapName>('classic');
const mapDescriptions: Record<string, string> = {
    classic: 'Balanced cross layout',
    corridors: 'Tight lanes & chokepoints',
    bunkers: 'Corner forts, open center',
    open: 'Minimal cover, high risk',
    maze: 'Dense winding paths',
};
const gulagActive = ref(false);
const gulagCountdown = ref(0);
const gulagUsed = new Set<string>();
const gulagOpponent = ref('');
const gulagInProgress = ref(false); // prevents win condition check
const spectating = ref(false);
const now = ref(performance.now());
const disconnectTimer = ref(0);
let disconnectInterval: number | null = null;
const rematchRequested = ref(false);
const rematchRequestedBy = reactive<Set<string>>(new Set());
let effectTickInterval: number | null = null;

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
const freshTopPlayers = reactive<any[]>([]);

const reconnecting = ref(false);
let lastSessionSave = 0;

let network: GameNetwork | null = null;
let engine: GameEngine | null = null;
let echo: Echo<'reverb'> | null = null;
let currentSpawnAssignments: Record<string, number> = {};
const uiAudio = new AudioManager();

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
                color: selectedColor.value,
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
    history.replaceState(null, '', '?code=' + roomCode.value);
    apiPost('/api/game/room/register', {
        room_code: code,
        host_name: nickname.value,
        map_name: selectedMap.value,
        player_count: 1,
        status: 'lobby',
        player_names: [nickname.value],
    });
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
    history.replaceState(null, '', '?code=' + roomCode.value);

    if (players.length > MAX_PLAYERS) {
        errorMsg.value = 'Room is full (max 8 players)';
        network?.leave();
        network = null;
        roomCode.value = '';
        players.splice(0, players.length);
        return;
    }
}

async function spectateRoom(code: string, mapName: string) {
    if (!nickname.value.trim()) {
        nickname.value = 'Spectator';
    }
    spectating.value = true;
    roomCode.value = code;
    isAdmin.value = false;
    selectedMap.value = mapName as MapName;
    await joinChannel(code);

    // Go straight to playing phase as spectator
    phase.value = 'playing';
    effectTickInterval = window.setInterval(() => { now.value = performance.now(); }, 200);
    await nextTick();
    if (!canvasRef.value) return;

    const localInfo: PlayerInfo = {
        id: localId.value,
        name: nickname.value,
        color: '#666666',
        isAdmin: false,
    };

    engine = new GameEngine(canvasRef.value, localId.value, localInfo, {
        onFire() {},
        onTankState() {},
        onHit() {},
        onDeath() {},
        onGameOver() {},
        onHpChange() {},
        onKill(killerName, targetName) {
            killFeed.push({ killer: killerName, target: targetName, time: Date.now() });
            if (killFeed.length > 5) killFeed.shift();
        },
        onPowerupSpawn() {},
        onPowerupPickup() {},
        onEffectsChange() {},
        onRainBullets() {},
        onGulag() {},
        onFreeze() {},
    }, undefined, mapName as MapName);

    engine.init();
    // Hide local tank — spectator has no tank
    engine.spawnLocal(0);
    engine.setSpectateMode(true);

    // Add all current players as remote tanks
    for (const p of players) {
        if (p.id !== localId.value) {
            engine.addRemoteTank(p.id, {
                id: p.id,
                name: p.name,
                color: p.color,
                isAdmin: p.isAdmin,
            }, 0);
        }
    }

    engine.start();
    alive.value = false;
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
            // Ensure at least one player is admin
            const hasAdmin = players.some(p => p.isAdmin);
            if (!hasAdmin && players.length > 0) {
                players[0].isAdmin = true;
            }
            if (players.find(p => p.id === myId)?.isAdmin) {
                isAdmin.value = true;
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
            if (engine) {
                // Cancel disconnect timer if someone rejoined
                if (disconnectInterval) {
                    clearInterval(disconnectInterval);
                    disconnectInterval = null;
                    disconnectTimer.value = 0;
                }
                // Player reconnected mid-game — show notification and re-add their tank
                killFeed.push({ killer: 'SYSTEM', target: `${member.name} reconnected`, time: Date.now() });
                if (killFeed.length > 5) killFeed.shift();
                network?.sendPlayerReconnect({ id: member.id, name: member.name });
                // Skip adding tank during gulag — tank state whispers will sync after gulag ends
                if (!gulagInProgress.value) {
                    // Re-add their tank — fetch last position from DB
                    const spawnIdx = currentSpawnAssignments[member.id] ?? 0;
                    const tankInfo: PlayerInfo = {
                        id: member.id,
                        name: member.name,
                        color: member.color || TANK_COLORS[0],
                        isAdmin: false,
                    };
                    fetch(`/api/game/session?room_code=${roomCode.value}&player_identifier=${member.id}`)
                        .then(r => r.json())
                        .then(data => {
                            if (data.session && engine) {
                                const s = data.session;
                                engine.addRemoteTank(member.id, tankInfo, spawnIdx, {
                                    x: s.x, z: s.z, rotation: s.body_rotation, hp: s.hp,
                                });
                            } else if (engine) {
                                engine.addRemoteTank(member.id, tankInfo, spawnIdx);
                            }
                        })
                        .catch(() => {
                            engine?.addRemoteTank(member.id, tankInfo, spawnIdx);
                        });
                }
            }
            if (isAdmin.value) {
                syncRoom();
            }
        },
        onPlayerLeave(member) {
            const idx = players.findIndex(p => p.id === member.id);
            if (idx >= 0) players.splice(idx, 1);
            if (players.length > 0) {
                // Ensure there's always an admin
                const hasAdmin = players.some(p => p.isAdmin);
                if (!hasAdmin) {
                    players[0].isAdmin = true;
                }
                if (players[0].isAdmin && players[0].id === localId.value) {
                    isAdmin.value = true;
                    engine?.setAdmin(true);
                }
            }
            if (engine) {
                killFeed.push({ killer: 'SYSTEM', target: `${member.name} disconnected`, time: Date.now() });
                if (killFeed.length > 5) killFeed.shift();
                engine.removeRemoteTank(member.id);
            }
            if (players.length === 1) {
                syncRoom();
                // If we're the only one left in an active game, start 30s grace period
                if (engine && phase.value === 'playing' && !disconnectInterval) {
                    disconnectTimer.value = 30;
                    killFeed.push({ killer: 'SYSTEM', target: `${member.name} disconnected. Waiting 30s to rejoin...`, time: Date.now() });
                    if (killFeed.length > 5) killFeed.shift();
                    disconnectInterval = window.setInterval(() => {
                        disconnectTimer.value--;
                        if (disconnectTimer.value <= 0) {
                            clearInterval(disconnectInterval!);
                            disconnectInterval = null;
                            disconnectTimer.value = 0;
                            // Time's up — win by default
                            if (players.length <= 1 && phase.value === 'playing') {
                                killFeed.push({ killer: 'SYSTEM', target: 'Opponent did not rejoin. You win!', time: Date.now() });
                                if (killFeed.length > 5) killFeed.shift();
                                phase.value = 'gameover';
                                winner.value = nickname.value;
                                winnerId.value = localId.value;
                                if (isAdmin.value) {
                                    network?.sendGameOver({ winnerId: localId.value, winnerName: nickname.value });
                                    reportGameEnd(nickname.value, localId.value);
                                    refreshLeaderboard();
                                }
                                clearSessionStorage();
                            }
                        }
                    }, 1000);
                }
            } else if (players.length === 0) {
                // Everyone left
                apiPost('/api/game/room/unregister', { room_code: roomCode.value });
            } else {
                syncRoom();
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
            if (gulagInProgress.value && isAdmin.value) {
                // Death during gulag = gulag result
                const result: GulagResultEvent = { winnerId: data.killerId, loserId: data.id };
                network?.sendGulagResult(result);
                handleGulagResult(result);
            } else if (isAdmin.value && !gulagUsed.has(data.id) && !gulagInProgress.value) {
                if (Math.random() < GULAG_CONFIG.chance) {
                    gulagUsed.add(data.id);
                    const gulagEvent: GulagEvent = { deadPlayerId: data.id, killerPlayerId: data.killerId };
                    network?.sendGulag(gulagEvent);
                    handleGulagEvent(gulagEvent);
                } else {
                    checkWinCondition();
                }
            } else if (!gulagInProgress.value) {
                checkWinCondition();
            }
        },
        onGameStart(data) {
            startGame(data.countdown, data.spawnAssignments, data.mapName as MapName);
        },
        onGameOver(data) {
            phase.value = 'gameover';
            winner.value = data.winnerName;
            winnerId.value = data.winnerId;
            if (effectTickInterval) { clearInterval(effectTickInterval); effectTickInterval = null; }
            uiAudio.play(data.winnerId === localId.value ? 'victory' : 'defeat');
            clearSessionStorage();
        },
        onRestart() {
            resetGame();
        },
        onPowerupSpawn(event) {
            engine?.spawnPowerup(event);
        },
        onPowerupPickup(event) {
            engine?.handleRemotePowerupPickup(event);
        },
        onRainBullets(event: RainBulletsEvent) {
            engine?.startRainBullets(event.activatorId);
        },
        onMapChange(data) {
            selectedMap.value = data.mapName as MapName;
        },
        onGulag(event: GulagEvent) {
            handleGulagEvent(event);
        },
        onGulagResult(event: GulagResultEvent) {
            handleGulagResult(event);
        },
        onRequestState(data) {
            // Only the admin responds with the current game state
            if (engine && isAdmin.value) {
                network?.sendGameState({
                    spawnAssignments: currentSpawnAssignments,
                    mapName: selectedMap.value,
                    phase: phase.value,
                });
            }
        },
        onGameState(data) {
            if (reconnecting.value && data.phase === 'playing') {
                reconnecting.value = false;
                const savedSpawn = Number(sessionStorage.getItem('tanks_spawn_index') || '0');
                const assignments: Record<string, number> = { ...data.spawnAssignments };
                // Ensure our ID is in the assignments
                if (!(localId.value in assignments)) {
                    assignments[localId.value] = savedSpawn;
                }
                startGame(0, assignments, data.mapName as MapName);
            }
        },
        onPlayerDisconnect(data) {
            if (engine) {
                killFeed.push({ killer: 'SYSTEM', target: `${data.name} disconnected`, time: Date.now() });
                if (killFeed.length > 5) killFeed.shift();
            }
        },
        onPlayerReconnect(data) {
            if (engine) {
                killFeed.push({ killer: 'SYSTEM', target: `${data.name} reconnected`, time: Date.now() });
                if (killFeed.length > 5) killFeed.shift();
            }
        },
        onRematchRequest(data) {
            rematchRequestedBy.add(data.id);
            if (data.id === players.find(p => p.isAdmin)?.id) {
                resetGame();
            }
        },
        onFreeze(data) {
            engine?.applyRemoteFreeze(data.activatorId);
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

    network?.sendGameStart({ countdown: 3, spawnAssignments: assignments, mapName: selectedMap.value });
    startGame(3, assignments, selectedMap.value);
    syncRoom({ status: 'playing' });
}

async function startGame(countdownSec: number, spawnAssignments: Record<string, number>, mapName: MapName = 'classic') {
    currentSpawnAssignments = { ...spawnAssignments };
    myHp.value = DEFAULT_CONFIG.maxHp;
    alive.value = true;
    winner.value = '';
    killFeed.splice(0, killFeed.length);
    Object.keys(gameKills).forEach(k => delete gameKills[k]);
    Object.keys(gameDeaths).forEach(k => delete gameDeaths[k]);

    // Countdown (skip if 0, e.g. reconnecting)
    if (countdownSec > 0) {
        phase.value = 'countdown';
        countdown.value = countdownSec;
        for (let i = countdownSec; i > 0; i--) {
            countdown.value = i;
            await sleep(1000);
        }
        countdown.value = 0;
    }

    phase.value = 'playing';
    effectTickInterval = window.setInterval(() => { now.value = performance.now(); }, 200);
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
            // Save position to DB every 10 seconds
            const t = Date.now();
            if (t - lastSessionSave > 10000) {
                lastSessionSave = t;
                apiPost('/api/game/session/save', {
                    room_code: roomCode.value,
                    player_identifier: localId.value,
                    nickname: nickname.value,
                    hp: myHp.value,
                    x: state.x,
                    z: state.z,
                    body_rotation: state.bodyRotation,
                    alive: alive.value,
                });
            }
        },
        onHit(data) {
            network?.sendHit(data);
        },
        onDeath(data) {
            alive.value = false;
            network?.sendDeath(data);
            if (gulagInProgress.value && isAdmin.value) {
                const result: GulagResultEvent = { winnerId: data.killerId, loserId: data.id };
                network?.sendGulagResult(result);
                handleGulagResult(result);
            } else if (isAdmin.value && !gulagUsed.has(data.id) && !gulagInProgress.value) {
                if (Math.random() < GULAG_CONFIG.chance) {
                    gulagUsed.add(data.id);
                    const gulagEvent: GulagEvent = { deadPlayerId: data.id, killerPlayerId: data.killerId };
                    network?.sendGulag(gulagEvent);
                    handleGulagEvent(gulagEvent);
                } else {
                    checkWinCondition();
                }
            } else if (!gulagInProgress.value) {
                checkWinCondition();
            }
        },
        onGameOver(data) {
            phase.value = 'gameover';
            winner.value = data.winnerName;
            winnerId.value = data.winnerId;
            if (effectTickInterval) { clearInterval(effectTickInterval); effectTickInterval = null; }
            uiAudio.play(data.winnerId === localId.value ? 'victory' : 'defeat');
            network?.sendGameOver(data);
            clearSessionStorage();
            if (isAdmin.value) {
                reportGameEnd(data.winnerName, data.winnerId);
                refreshLeaderboard();
            }
        },
        onHpChange(hp) {
            myHp.value = hp;
        },
        onKill(killerName, targetName) {
            killFeed.push({ killer: killerName, target: targetName, time: Date.now() });
            // Keep only last 5
            if (killFeed.length > 5) killFeed.shift();
            // Track kills/deaths by name
            const killer = players.find(p => p.name === killerName);
            const target = players.find(p => p.name === targetName);
            if (killer) gameKills[killer.id] = (gameKills[killer.id] || 0) + 1;
            if (target) gameDeaths[target.id] = (gameDeaths[target.id] || 0) + 1;
        },
        onPowerupSpawn(event) {
            network?.sendPowerupSpawn(event);
        },
        onPowerupPickup(event) {
            network?.sendPowerupPickup(event);
        },
        onEffectsChange(effects) {
            activeEffects.splice(0, activeEffects.length, ...effects);
        },
        onRainBullets(event: RainBulletsEvent) {
            network?.sendRainBullets(event);
        },
        onGulag(event: GulagEvent) {
            network?.sendGulag(event);
        },
        onFreeze(data) {
            network?.sendFreeze(data);
        },
    }, undefined, mapName);

    engine.init();
    engine.spawnLocal(spawnAssignments[localId.value] ?? 0);

    // Restore position if reconnecting
    if (countdownSec === 0 && props.activeSession) {
        const s = props.activeSession;
        engine.setLocalPosition(s.x, s.z, s.body_rotation, s.hp);
        myHp.value = s.hp;
    }

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

    // Save session state for reconnection (local + DB)
    sessionStorage.setItem('tanks_room_code', roomCode.value);
    sessionStorage.setItem('tanks_nickname', nickname.value);
    sessionStorage.setItem('tanks_color', selectedColor.value);
    sessionStorage.setItem('tanks_map', mapName);
    sessionStorage.setItem('tanks_spawn_index', String(spawnAssignments[localId.value] ?? 0));
    apiPost('/api/game/session/save', {
        room_code: roomCode.value,
        player_identifier: localId.value,
        nickname: nickname.value,
        color: selectedColor.value,
        map_name: mapName,
        spawn_index: spawnAssignments[localId.value] ?? 0,
        hp: DEFAULT_CONFIG.maxHp,
        x: 0,
        z: 0,
        alive: true,
        is_admin: isAdmin.value,
    });
}

function clearSessionStorage() {
    sessionStorage.removeItem('tanks_room_code');
    sessionStorage.removeItem('tanks_nickname');
    sessionStorage.removeItem('tanks_color');
    sessionStorage.removeItem('tanks_map');
    sessionStorage.removeItem('tanks_spawn_index');
    // Also clear DB session
    if (roomCode.value) {
        apiPost('/api/game/session/clear', { room_code: roomCode.value });
    }
}

function checkWinCondition() {
    if (!engine || phase.value !== 'playing') return;
    if (gulagInProgress.value) return;

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
            reportGameEnd(wName, wId);
            refreshLeaderboard();
        }
    }
}

// ─── Map Selection ──────────────────────────────────────────────
function selectMap(map: MapName) {
    if (!isAdmin.value) return;
    selectedMap.value = map;
    network?.sendMapChange({ mapName: map });
}

// ─── Gulag System ───────────────────────────────────────────────
async function handleGulagEvent(event: GulagEvent) {
    const deadPlayer = players.find(p => p.id === event.deadPlayerId);
    const killerPlayer = players.find(p => p.id === event.killerPlayerId);
    const deadName = deadPlayer?.name || 'Unknown';
    const killerName = killerPlayer?.name || 'Unknown';

    gulagInProgress.value = true;
    engine?.setGulagInProgress(true);

    // Show in kill feed
    killFeed.push({ killer: 'GULAG', target: `${deadName} vs ${killerName}!`, time: Date.now() });
    if (killFeed.length > 5) killFeed.shift();

    const isLocal = event.deadPlayerId === localId.value || event.killerPlayerId === localId.value;

    if (isLocal) {
        gulagActive.value = true;
        uiAudio.play('gulag');
        gulagOpponent.value = event.deadPlayerId === localId.value ? killerName : deadName;
        gulagCountdown.value = GULAG_CONFIG.countdownSec;

        for (let i = GULAG_CONFIG.countdownSec; i > 0; i--) {
            gulagCountdown.value = i;
            await sleep(1000);
        }
        gulagCountdown.value = 0;
    } else {
        // Spectator perspective — just wait the countdown
        await sleep(GULAG_CONFIG.countdownSec * 1000);
    }

    // Respawn both fighters at opposite ends with gulag HP
    engine?.respawnFromGulag(event.deadPlayerId, 0);
    engine?.respawnFromGulag(event.killerPlayerId, 3);

    if (isLocal) {
        alive.value = true;
        myHp.value = GULAG_CONFIG.hp;
    }
}

function handleGulagResult(event: GulagResultEvent) {
    gulagInProgress.value = false;
    engine?.setGulagInProgress(false);
    gulagActive.value = false;
    gulagOpponent.value = '';

    const winnerPlayer = players.find(p => p.id === event.winnerId);
    const loserPlayer = players.find(p => p.id === event.loserId);

    killFeed.push({ killer: 'GULAG', target: `${winnerPlayer?.name || 'Unknown'} wins! ${loserPlayer?.name || 'Unknown'} is eliminated.`, time: Date.now() });
    if (killFeed.length > 5) killFeed.shift();

    // The loser stays dead — only winner continues with 25% HP
    if (event.winnerId === localId.value) {
        alive.value = true;
        myHp.value = GULAG_CONFIG.hp;
    }
    if (event.loserId === localId.value) {
        alive.value = false;
    }

    // Now check win condition
    checkWinCondition();
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
    activeEffects.splice(0, activeEffects.length);
    gulagActive.value = false;
    gulagCountdown.value = 0;
    gulagUsed.clear();
    gulagOpponent.value = '';
    gulagInProgress.value = false;
    spectating.value = false;
    Object.keys(gameKills).forEach(k => delete gameKills[k]);
    Object.keys(gameDeaths).forEach(k => delete gameDeaths[k]);
    reconnecting.value = false;
    rematchRequested.value = false;
    rematchRequestedBy.clear();
    currentSpawnAssignments = {};
    if (effectTickInterval) { clearInterval(effectTickInterval); effectTickInterval = null; }
    if (disconnectInterval) { clearInterval(disconnectInterval); disconnectInterval = null; }
    disconnectTimer.value = 0;
    // Reset ready state for all players
    players.forEach(p => p.ready = false);
    // Clear reconnection data
    clearSessionStorage();
    history.replaceState(null, '', '/');
}

function adminRestart() {
    network?.sendRestart();
    resetGame();
}

function requestRematch() {
    rematchRequested.value = true;
    rematchRequestedBy.add(localId.value);
    network?.sendRematchRequest({ id: localId.value, name: nickname.value });
    // If we're admin, just restart directly
    if (isAdmin.value) {
        adminRestart();
    }
}

function leaveGame() {
    clearSessionStorage();
    if (isAdmin.value && roomCode.value) {
        apiPost('/api/game/room/unregister', { room_code: roomCode.value });
    }
    engine?.destroy();
    engine = null;
    network?.leave();
    network = null;
    echo = null;
    phase.value = 'lobby';
    roomCode.value = '';
    players.splice(0, players.length);
    localId.value = '';
    isAdmin.value = false;
    alive.value = true;
    myHp.value = DEFAULT_CONFIG.maxHp;
    winner.value = '';
    winnerId.value = '';
    killFeed.splice(0, killFeed.length);
    activeEffects.splice(0, activeEffects.length);
    gulagActive.value = false;
    gulagInProgress.value = false;
    spectating.value = false;
    reconnecting.value = false;
    if (effectTickInterval) { clearInterval(effectTickInterval); effectTickInterval = null; }
    if (disconnectInterval) { clearInterval(disconnectInterval); disconnectInterval = null; }
    disconnectTimer.value = 0;
    history.replaceState(null, '', '/');
}

// ─── Lifecycle ───────────────────────────────────────────────────
function handleBeforeUnload() {
    // Don't unregister if we're in a game — we might be reconnecting
    if (phase.value === 'playing' || phase.value === 'countdown') {
        return;
    }
    if (roomCode.value) {
        const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
        fetch('/api/game/room/unregister', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
            body: JSON.stringify({ room_code: roomCode.value }),
            keepalive: true,
        }).catch(() => {});
    }
}

onMounted(async () => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    uiAudio.load();

    // Check for saved session — attempt reconnection
    const savedRoom = sessionStorage.getItem('tanks_room_code');
    const savedNick = sessionStorage.getItem('tanks_nickname');
    if (savedRoom && savedNick) {
        try {
            nickname.value = savedNick;
            selectedColor.value = sessionStorage.getItem('tanks_color') || TANK_COLORS[0];
            roomCode.value = savedRoom;
            reconnecting.value = true;
            await joinChannel(savedRoom);
            // Wait a tick for onPlayersUpdate to set localId
            await new Promise(r => setTimeout(r, 100));
            if (!localId.value) {
                // Still no ID — fail gracefully
                clearSessionStorage();
                reconnecting.value = false;
                roomCode.value = '';
                return;
            }
            history.replaceState(null, '', '?code=' + roomCode.value);
            // Request game state from other players
            network?.sendRequestState({ requesterId: localId.value });
            // If no response within 3 seconds, fall back to lobby
            setTimeout(() => {
                if (reconnecting.value) {
                    reconnecting.value = false;
                    // Game is no longer running, just stay in lobby
                    clearSessionStorage();
                }
            }, 3000);
            return;
        } catch {
            // Reconnection failed, clear and fall through to normal flow
            clearSessionStorage();
            reconnecting.value = false;
            roomCode.value = '';
        }
    }

    // Check server-side active session (covers cleared sessionStorage)
    if (!reconnecting.value && props.activeSession) {
        const s = props.activeSession;
        try {
            nickname.value = s.nickname;
            selectedColor.value = s.color;
            roomCode.value = s.room_code;
            selectedMap.value = s.map_name as MapName;
            reconnecting.value = true;
            // Restore sessionStorage from DB
            sessionStorage.setItem('tanks_room_code', s.room_code);
            sessionStorage.setItem('tanks_nickname', s.nickname);
            sessionStorage.setItem('tanks_color', s.color);
            sessionStorage.setItem('tanks_map', s.map_name);
            sessionStorage.setItem('tanks_spawn_index', String(s.spawn_index));
            await joinChannel(s.room_code);
            history.replaceState(null, '', '?code=' + s.room_code);
            network?.sendRequestState({ requesterId: localId.value });
            setTimeout(() => {
                if (reconnecting.value) {
                    reconnecting.value = false;
                    clearSessionStorage();
                }
            }, 3000);
            return;
        } catch {
            clearSessionStorage();
            reconnecting.value = false;
            roomCode.value = '';
        }
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code && code.length === 4) {
        roomCodeInput.value = code.toUpperCase();
        joiningViaLink.value = true;
    }
});

onUnmounted(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    if (isAdmin.value && roomCode.value) {
        apiPost('/api/game/room/unregister', { room_code: roomCode.value });
    }
    engine?.destroy();
    network?.leave();
    uiAudio.destroy();
    if (effectTickInterval) { clearInterval(effectTickInterval); effectTickInterval = null; }
});

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function copyRoomCode() {
    navigator.clipboard.writeText(roomCode.value);
}

function copyJoinLink() {
    const url = `${window.location.origin}/?code=${roomCode.value}`;
    navigator.clipboard.writeText(url);
}

async function apiPost(url: string, data: Record<string, any>) {
    const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
        body: JSON.stringify(data),
    }).catch(() => {});
}

function syncRoom(extra: Record<string, any> = {}) {
    if (!isAdmin.value || !roomCode.value) return;
    apiPost('/api/game/room/update', {
        room_code: roomCode.value,
        player_count: players.length,
        status: phase.value === 'playing' ? 'playing' : 'lobby',
        map_name: selectedMap.value,
        player_names: players.map(p => p.name),
        ...extra,
    });
}

function reportGameEnd(winnerName: string, winnerPlayerId: string) {
    const playerStats = players.map(p => ({
        identifier: p.id,
        nickname: p.name,
        kills: gameKills[p.id] || 0,
        deaths: gameDeaths[p.id] || 0,
        won: p.id === winnerPlayerId,
    }));

    apiPost('/api/game/report', {
        room_code: roomCode.value,
        winner_name: winnerName,
        winner_identifier: winnerPlayerId,
        player_count: players.length,
        map_name: selectedMap.value,
        players: playerStats,
    });
}

async function refreshLeaderboard() {
    try {
        const res = await fetch('/api/leaderboard/top');
        const data = await res.json();
        if (Array.isArray(data)) {
            freshTopPlayers.splice(0, freshTopPlayers.length, ...data);
        }
    } catch {}
}

function effectLabel(type: PowerupType): string {
    const labels: Record<PowerupType, string> = {
        triple_shot: 'TRIPLE',
        speed_boost: 'SPEED',
        shield: 'SHIELD',
        rapid_fire: 'RAPID',
        health: 'HP',
        rain_bullets: 'RAINFIRE',
        mega_bounce: 'BOUNCE',
        ghost: 'GHOST',
        magnet: 'MAGNET',
        freeze: 'FREEZE',
        big_shot: 'BIG SHOT',
        landmine: 'MINE',
    };
    return labels[type];
}

function effectTimeLeft(effect: ActiveEffect): string {
    const secs = Math.max(0, Math.ceil((effect.expiresAt - now.value) / 1000));
    return `${secs}s`;
}

function effectStyle(type: PowerupType): string {
    const styles: Record<PowerupType, string> = {
        triple_shot: 'bg-orange-500/80 text-black',
        speed_boost: 'bg-blue-400/80 text-black',
        shield: 'bg-emerald-400/80 text-black',
        rapid_fire: 'bg-yellow-400/80 text-black',
        health: 'bg-red-500/80 text-white',
        rain_bullets: 'bg-orange-600/80 text-white',
        mega_bounce: 'bg-purple-500/80 text-white',
        ghost: 'bg-gray-400/80 text-black',
        magnet: 'bg-fuchsia-500/80 text-white',
        freeze: 'bg-cyan-400/80 text-black',
        big_shot: 'bg-rose-500/80 text-white',
        landmine: 'bg-amber-700/80 text-white',
    };
    return styles[type];
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
        <div class="w-full max-w-2xl p-8">
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

            <!-- Active Rooms -->
            <div class="mt-8">
                <h3 class="text-lg font-bold text-white font-mono mb-3">Active Rooms</h3>
                <div v-if="props.activeRooms?.length" class="space-y-2 max-h-72 overflow-y-auto">
                    <div v-for="room in props.activeRooms" :key="room.id"
                         class="px-4 py-3 bg-[#2a2a4a] rounded-lg border border-[#3a3a6a]">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <span class="text-emerald-400 font-mono font-bold tracking-wider">{{ room.room_code }}</span>
                                <span class="text-gray-600 text-xs font-mono">{{ room.map_name }}</span>
                                <span class="text-xs font-mono px-2 py-0.5 rounded"
                                      :class="room.status === 'playing' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'">
                                    {{ room.status === 'playing' ? 'IN GAME' : 'LOBBY' }}
                                </span>
                            </div>
                            <div class="flex items-center gap-3">
                                <span class="text-gray-400 text-xs font-mono">{{ room.player_count }}/{{ room.max_players }}</span>
                                <button v-if="room.status === 'lobby' && room.player_count < room.max_players"
                                        @click="roomCodeInput = room.room_code; joinRoom()"
                                        :disabled="!nickname.trim()"
                                        class="px-3 py-1 text-xs font-bold rounded font-mono transition-colors"
                                        :class="nickname.trim()
                                            ? 'bg-blue-500 hover:bg-blue-400 text-black'
                                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'"
                                        :title="!nickname.trim() ? 'Enter a nickname first' : ''">
                                    JOIN
                                </button>
                                <button v-else-if="room.status === 'playing'"
                                        @click="spectateRoom(room.room_code, room.map_name)"
                                        class="px-3 py-1 bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold rounded font-mono transition-colors">
                                    SPECTATE
                                </button>
                                <span v-else-if="room.player_count >= room.max_players" class="text-gray-600 text-xs font-mono">full</span>
                            </div>
                        </div>
                        <!-- Player names -->
                        <div v-if="room.players_json?.length" class="mt-1.5 flex flex-wrap gap-1.5">
                            <span v-for="name in room.players_json" :key="name"
                                  class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1a1a2e] text-gray-400">
                                {{ name }}
                            </span>
                        </div>
                    </div>
                </div>
                <p v-else class="text-gray-600 text-sm font-mono">No active rooms</p>
                <p v-if="!nickname.trim() && props.activeRooms?.length" class="text-yellow-500/70 text-xs font-mono mt-2 text-center">
                    Enter a nickname above to join a room
                </p>
            </div>

            <!-- Top Players -->
            <div class="mt-8">
                <h3 class="text-lg font-bold text-white font-mono mb-3">Top Players</h3>
                <div v-if="(freshTopPlayers.length ? freshTopPlayers : props.topPlayers)?.length" class="space-y-1">
                    <div v-for="(player, i) in (freshTopPlayers.length ? freshTopPlayers : props.topPlayers)" :key="player.id"
                         class="flex items-center justify-between px-4 py-2 rounded-lg"
                         :class="i === 0 ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-[#2a2a4a]'">
                        <div class="flex items-center gap-2">
                            <span class="text-gray-500 font-mono text-xs w-5">{{ i + 1 }}</span>
                            <span class="text-white font-mono text-sm">{{ player.nickname }}</span>
                        </div>
                        <div class="flex items-center gap-4">
                            <span class="text-emerald-400 font-mono text-xs">{{ player.wins }}W</span>
                            <span class="text-gray-500 font-mono text-xs">{{ player.kills }}K</span>
                            <span class="text-gray-600 font-mono text-xs">{{ player.games_played }}G</span>
                        </div>
                    </div>
                </div>
                <p v-else class="text-gray-600 text-sm font-mono">No games played yet</p>
            </div>
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
                    <button
                        @click="leaveGame"
                        class="text-red-400 hover:text-red-300 transition-colors text-xs font-mono border border-red-400/30 px-2 py-1 rounded"
                    >
                        LEAVE ROOM
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

            <!-- Map Selection -->
            <div class="mb-6">
                <p class="text-gray-500 text-xs font-mono text-center mb-2">MAP</p>
                <div class="flex justify-center gap-2 flex-wrap">
                    <button
                        v-for="map in MAP_NAMES"
                        :key="map"
                        @click="selectMap(map)"
                        :disabled="!isAdmin"
                        class="px-3 py-2 rounded-lg font-mono text-xs uppercase tracking-wide transition-all border"
                        :class="[
                            selectedMap === map
                                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400'
                                : isAdmin
                                    ? 'bg-[#2a2a4a] border-[#3a3a6a] text-gray-400 hover:border-gray-400 hover:text-white'
                                    : 'bg-[#2a2a4a] border-[#3a3a6a] text-gray-600 cursor-default',
                        ]"
                    >
                        {{ map }}
                        <span class="block text-[9px] opacity-60 normal-case tracking-normal mt-0.5">{{ mapDescriptions[map] }}</span>
                    </button>
                </div>
            </div>

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

    <!-- RECONNECTING -->
    <div v-else-if="reconnecting" class="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div class="text-center">
            <div class="text-4xl font-black text-emerald-400 font-mono animate-pulse mb-4">
                RECONNECTING
            </div>
            <p class="text-gray-400 font-mono text-sm">Rejoining room {{ roomCode }}...</p>
            <div class="mt-6 flex justify-center">
                <div class="w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
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
                <!-- HP + Active Effects -->
                <div>
                    <div class="flex items-center gap-2">
                        <div class="w-32 h-3 bg-gray-700 rounded-sm overflow-hidden">
                            <div
                                class="h-full rounded-sm transition-all duration-200"
                                :style="{ width: (myHp / DEFAULT_CONFIG.maxHp * 100) + '%' }"
                                :class="myHp / DEFAULT_CONFIG.maxHp > 0.6 ? 'bg-emerald-400' : myHp / DEFAULT_CONFIG.maxHp > 0.3 ? 'bg-yellow-400' : 'bg-red-500'"
                            />
                        </div>
                        <span class="text-white font-mono text-sm">{{ myHp }}/{{ DEFAULT_CONFIG.maxHp }}</span>
                    </div>
                    <div v-if="activeEffects.length" class="flex gap-1.5 mt-2">
                        <div
                            v-for="effect in activeEffects"
                            :key="effect.type"
                            class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wide flex items-center gap-1"
                            :class="effectStyle(effect.type)"
                        >
                            {{ effectLabel(effect.type) }}
                            <span class="opacity-70">{{ effectTimeLeft(effect) }}</span>
                        </div>
                    </div>
                </div>

                <!-- Room code -->
                <div class="text-gray-500 font-mono text-xs">{{ roomCode }}</div>
            </div>
        </div>

        <!-- Disconnect grace period banner -->
        <div v-if="disconnectTimer > 0" class="absolute top-14 left-1/2 -translate-x-1/2 pointer-events-none">
            <div class="px-4 py-2 bg-yellow-500/20 border border-yellow-500/40 rounded-lg text-center">
                <p class="text-yellow-400 font-mono text-sm">Opponent disconnected</p>
                <p class="text-white font-mono text-lg font-bold">{{ disconnectTimer }}s</p>
                <p class="text-yellow-500/70 font-mono text-xs">to rejoin</p>
            </div>
        </div>

        <!-- Kill feed -->
        <div class="absolute top-16 right-4 space-y-1 pointer-events-none">
            <div
                v-for="(kill, i) in killFeed"
                :key="i"
                class="text-xs font-mono px-3 py-1 bg-black/50 rounded text-white"
            >
                <template v-if="kill.killer === 'SYSTEM'">
                    <span class="text-gray-400">{{ kill.target }}</span>
                </template>
                <template v-else-if="kill.killer === 'GULAG'">
                    <span class="text-yellow-400">GULAG</span>
                    <span class="text-gray-400"> — </span>
                    <span class="text-gray-300">{{ kill.target }}</span>
                </template>
                <template v-else>
                    <span class="text-red-400">{{ kill.killer }}</span>
                    <span class="text-gray-500"> eliminated </span>
                    <span class="text-gray-300">{{ kill.target }}</span>
                </template>
            </div>
        </div>

        <!-- Dead / Spectate overlay -->
        <div v-if="!alive && phase === 'playing'" class="absolute inset-0 flex items-center justify-center pointer-events-none"
             :class="spectating ? 'bg-black/20' : 'bg-black/50'">
            <div class="text-center">
                <template v-if="spectating">
                    <div class="absolute top-20 left-1/2 -translate-x-1/2">
                        <span class="px-4 py-2 bg-purple-500/30 border border-purple-400/50 rounded-lg text-purple-300 font-mono text-sm">
                            SPECTATING
                        </span>
                    </div>
                </template>
                <template v-else-if="gulagActive">
                    <p class="text-5xl font-black text-yellow-400 font-mono animate-pulse">GULAG!</p>
                    <p v-if="gulagCountdown > 0" class="text-8xl font-black text-white font-mono mt-4">{{ gulagCountdown }}</p>
                    <p class="text-gray-300 font-mono mt-2 text-lg">vs <span class="text-red-400 font-bold">{{ gulagOpponent }}</span></p>
                    <p v-if="gulagCountdown === 0" class="text-emerald-400 font-mono mt-2 text-sm">FIGHT!</p>
                </template>
                <template v-else>
                    <p class="text-4xl font-black text-red-500 font-mono">ELIMINATED</p>
                    <p class="text-gray-400 font-mono mt-2">Spectating...</p>
                </template>
            </div>
        </div>

        <!-- Controls hint + Leave button -->
        <div class="absolute bottom-4 left-4 flex items-end gap-4">
            <div class="text-gray-600 font-mono text-xs space-y-0.5 pointer-events-none">
                <p>W/A/S/D — Move</p>
                <p>Mouse — Aim</p>
                <p>Click — Fire</p>
            </div>
            <button
                @click="leaveGame"
                class="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 text-red-400 text-xs font-mono rounded transition-colors"
            >
                LEAVE
            </button>
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

            <div class="flex items-center justify-center gap-4">
                <button
                    v-if="!rematchRequested"
                    @click="requestRematch"
                    class="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg transition-colors font-mono"
                >
                    REMATCH
                </button>
                <span v-else class="px-8 py-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold rounded-lg font-mono text-sm">
                    REMATCH REQUESTED
                </span>

                <button
                    @click="leaveGame"
                    class="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors font-mono"
                >
                    LEAVE
                </button>
            </div>

            <div v-if="rematchRequestedBy.size > 0" class="mt-4">
                <p class="text-gray-500 font-mono text-xs">
                    {{ Array.from(rematchRequestedBy).map(id => players.find(p => p.id === id)?.name || 'Someone').join(', ') }}
                    {{ rematchRequestedBy.size === 1 ? 'wants' : 'want' }} a rematch
                </p>
            </div>
        </div>
    </div>
</template>
