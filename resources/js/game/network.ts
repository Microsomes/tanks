import type Echo from 'laravel-echo';
import type { TankState, FireEvent, HitEvent, PowerupSpawnEvent, PowerupPickupEvent, RainBulletsEvent, GulagEvent } from './types';

export type PresenceMember = { id: string; name: string; color: string };

export interface NetworkCallbacks {
    onPlayersUpdate: (players: PresenceMember[], myId: string) => void;
    onPlayerJoin: (player: PresenceMember) => void;
    onPlayerLeave: (player: PresenceMember) => void;
    onColorChange: (data: { id: string; color: string }) => void;
    onReadyChange: (data: { id: string; ready: boolean }) => void;
    onTankState: (state: TankState) => void;
    onFire: (event: FireEvent) => void;
    onHit: (event: HitEvent) => void;
    onDeath: (data: { id: string; killerId: string }) => void;
    onGameStart: (data: { countdown: number; spawnAssignments: Record<string, number>; mapName: string }) => void;
    onMapChange: (data: { mapName: string }) => void;
    onGulag: (event: GulagEvent) => void;
    onGameOver: (data: { winnerId: string; winnerName: string }) => void;
    onRestart: () => void;
    onPowerupSpawn: (event: PowerupSpawnEvent) => void;
    onPowerupPickup: (event: PowerupPickupEvent) => void;
    onRainBullets: (event: RainBulletsEvent) => void;
    onRequestState: (data: { requesterId: string }) => void;
    onGameState: (data: { spawnAssignments: Record<string, number>; mapName: string; phase: string }) => void;
    onPlayerDisconnect: (data: { id: string; name: string }) => void;
    onPlayerReconnect: (data: { id: string; name: string }) => void;
}

/**
 * Extract members with IDs from the raw Pusher channel.
 * Echo's here() strips IDs — we bypass that by reading channel.subscription.members directly.
 */
function extractMembers(channel: any): { members: PresenceMember[]; myId: string } {
    const pusherMembers = channel.subscription?.members;
    if (!pusherMembers) {
        return { members: [], myId: '' };
    }

    const myId = String(pusherMembers.me?.id ?? '');
    const members: PresenceMember[] = [];

    pusherMembers.each((member: any) => {
        members.push({
            id: String(member.id),
            name: member.info?.name ?? 'Player',
            color: member.info?.color ?? '#4ade80',
        });
    });

    return { members, myId };
}

/**
 * Extract a single member's id + name from the raw Pusher member_added/member_removed event.
 * Echo's joining()/leaving() only pass member.info, stripping the id.
 * We bind directly to the Pusher events instead.
 */
function memberFromPusherEvent(data: any): PresenceMember {
    return {
        id: String(data.id),
        name: data.info?.name ?? 'Player',
        color: data.info?.color ?? '#4ade80',
    };
}

export class GameNetwork {
    private channel: any = null;
    private echo: Echo<'reverb'>;
    private roomCode: string = '';
    private callbacks: NetworkCallbacks;
    private throttleTimer: number | null = null;
    private lastState: TankState | null = null;

    constructor(echo: Echo<'reverb'>, callbacks: NetworkCallbacks) {
        this.echo = echo;
        this.callbacks = callbacks;
    }

    join(roomCode: string, nickname: string): Promise<void> {
        this.roomCode = roomCode;

        return new Promise((resolve, reject) => {
            this.channel = this.echo.join(`game.${roomCode}`);

            const pusherChannel = this.channel.subscription;

            pusherChannel?.bind('pusher:subscription_error', (err: any) => {
                reject(err);
            });

            // Use here() just as a "subscription succeeded" signal, then read Pusher members directly
            this.channel
                .here(() => {
                    const { members, myId } = extractMembers(this.channel);
                    this.callbacks.onPlayersUpdate(members, myId);
                    resolve();
                });

            // Bind directly to Pusher events to get member IDs (Echo strips them)
            pusherChannel?.bind('pusher:member_added', (member: any) => {
                this.callbacks.onPlayerJoin(memberFromPusherEvent(member));
            });
            pusherChannel?.bind('pusher:member_removed', (member: any) => {
                this.callbacks.onPlayerLeave(memberFromPusherEvent(member));
            });

            // Whisper listeners via Echo
            this.channel
                .listenForWhisper('color-change', (data: { id: string; color: string }) => {
                    this.callbacks.onColorChange(data);
                })
                .listenForWhisper('ready-change', (data: { id: string; ready: boolean }) => {
                    this.callbacks.onReadyChange(data);
                })
                .listenForWhisper('tank-state', (data: TankState) => {
                    this.callbacks.onTankState(data);
                })
                .listenForWhisper('fire', (data: FireEvent) => {
                    this.callbacks.onFire(data);
                })
                .listenForWhisper('hit', (data: HitEvent) => {
                    this.callbacks.onHit(data);
                })
                .listenForWhisper('death', (data: { id: string; killerId: string }) => {
                    this.callbacks.onDeath(data);
                })
                .listenForWhisper('game-start', (data: { countdown: number; spawnAssignments: Record<string, number>; mapName: string }) => {
                    this.callbacks.onGameStart(data);
                })
                .listenForWhisper('map-change', (data: { mapName: string }) => {
                    this.callbacks.onMapChange(data);
                })
                .listenForWhisper('gulag', (data: GulagEvent) => {
                    this.callbacks.onGulag(data);
                })
                .listenForWhisper('game-over', (data: { winnerId: string; winnerName: string }) => {
                    this.callbacks.onGameOver(data);
                })
                .listenForWhisper('restart', () => {
                    this.callbacks.onRestart();
                })
                .listenForWhisper('powerup-spawn', (data: PowerupSpawnEvent) => {
                    this.callbacks.onPowerupSpawn(data);
                })
                .listenForWhisper('powerup-pickup', (data: PowerupPickupEvent) => {
                    this.callbacks.onPowerupPickup(data);
                })
                .listenForWhisper('rain-bullets', (data: RainBulletsEvent) => {
                    this.callbacks.onRainBullets(data);
                })
                .listenForWhisper('request-state', (data: { requesterId: string }) => {
                    this.callbacks.onRequestState(data);
                })
                .listenForWhisper('game-state', (data: { spawnAssignments: Record<string, number>; mapName: string; phase: string }) => {
                    this.callbacks.onGameState(data);
                })
                .listenForWhisper('player-disconnect', (data: { id: string; name: string }) => {
                    this.callbacks.onPlayerDisconnect(data);
                })
                .listenForWhisper('player-reconnect', (data: { id: string; name: string }) => {
                    this.callbacks.onPlayerReconnect(data);
                });
        });
    }

    sendColorChange(data: { id: string; color: string }) {
        this.channel?.whisper('color-change', data);
    }

    sendReadyChange(data: { id: string; ready: boolean }) {
        this.channel?.whisper('ready-change', data);
    }

    sendTankState(state: TankState) {
        this.lastState = state;
        if (this.throttleTimer) return;

        this.throttleTimer = window.setTimeout(() => {
            if (this.channel && this.lastState) {
                this.channel.whisper('tank-state', this.lastState);
            }
            this.throttleTimer = null;
        }, 66); // ~15Hz
    }

    sendFire(event: FireEvent) {
        this.channel?.whisper('fire', event);
    }

    sendHit(event: HitEvent) {
        this.channel?.whisper('hit', event);
    }

    sendDeath(data: { id: string; killerId: string }) {
        this.channel?.whisper('death', data);
    }

    sendGameStart(data: { countdown: number; spawnAssignments: Record<string, number>; mapName: string }) {
        this.channel?.whisper('game-start', data);
    }

    sendMapChange(data: { mapName: string }) {
        this.channel?.whisper('map-change', data);
    }

    sendGulag(event: GulagEvent) {
        this.channel?.whisper('gulag', event);
    }

    sendGameOver(data: { winnerId: string; winnerName: string }) {
        this.channel?.whisper('game-over', data);
    }

    sendRestart() {
        this.channel?.whisper('restart', {});
    }

    sendPowerupSpawn(event: PowerupSpawnEvent) {
        this.channel?.whisper('powerup-spawn', event);
    }

    sendPowerupPickup(event: PowerupPickupEvent) {
        this.channel?.whisper('powerup-pickup', event);
    }

    sendRainBullets(event: RainBulletsEvent) {
        this.channel?.whisper('rain-bullets', event);
    }

    sendRequestState(data: { requesterId: string }) {
        this.channel?.whisper('request-state', data);
    }

    sendGameState(data: { spawnAssignments: Record<string, number>; mapName: string; phase: string }) {
        this.channel?.whisper('game-state', data);
    }

    sendPlayerDisconnect(data: { id: string; name: string }) {
        this.channel?.whisper('player-disconnect', data);
    }

    sendPlayerReconnect(data: { id: string; name: string }) {
        this.channel?.whisper('player-reconnect', data);
    }

    leave() {
        if (this.roomCode) {
            this.echo.leave(`game.${this.roomCode}`);
            this.channel = null;
            this.roomCode = '';
        }
        if (this.throttleTimer) {
            clearTimeout(this.throttleTimer);
            this.throttleTimer = null;
        }
    }
}
