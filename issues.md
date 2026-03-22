# Tanks! - Issues & Improvements

## Critical Bugs

- [x] **Memory leak: Remote tank meshes not disposed** — Fixed: `removeRemoteTank()` now traverses and disposes all geometry/materials/sprites.
- [x] **Trail geometry recreated every frame** — Fixed: Pre-allocated BufferGeometry with attribute updates instead of dispose/recreate.
- [x] **Rain bullets can kill during gulag** — Fixed: Rain damage checks `gulagInProgress` flag and skips during gulag.
- [x] **Effect tick interval never cleared on game-over** — Fixed: Cleared in both `onGameOver` callbacks.
- [x] **Reconnection race condition** — Fixed: Added 100ms delay after joinChannel for localId to be set, with graceful fallback.
- [x] **Freeze powerup doesn't work** — Fixed: Added `onFreeze` network event, `applyRemoteFreeze()` method, visual blue tint.
- [x] **Kills/deaths always reported as 0** — Fixed: Track kills/deaths by player ID in `onKill` callback, sent in `reportGameEnd()`.

## Edge Cases

- [ ] **Powerup double-pickup** — Two players can pick up the same powerup before network sync removes it on the other client.
- [ ] **Player rejoins during gulag** — Gulag logic expects exactly 2 fighters. A third player joining mid-gulag breaks win condition.
- [ ] **Projectile stuck in wall corners** — Shallow-angle hits on wall corners can cause projectiles to bounce in place or reverse repeatedly. (`projectile.ts:106`)
- [ ] **Shield vs simultaneous projectiles** — Two projectiles hitting in the same frame: first breaks shield, second deals damage. Correct but inconsistent across clients.
- [ ] **Landmine double-detonation** — Two mines close together detonating in the same frame can shift array indices. (`engine.ts:1009`)
- [ ] **Ghost tanks visible during countdown** — Tanks at spawn points can be seen briefly before countdown ends.

## Network / Sync

- [ ] **Tank state arrives before engine ready** — Network listeners are set up before engine exists. Early whisper messages are silently dropped. (`network.ts:118`)
- [ ] **Game-over fires while gulag pending** — Another death during gulag countdown can trigger game-over overlay on top of gulag UI.
- [ ] **15Hz tank state throttle causes jitter** — Remote tanks snap between positions on high-latency connections. Could use 20-30Hz or client-side prediction.
- [ ] **No server-side hit validation** — Clients self-report hits. Malicious client can spam fake hit events. (`engine.ts:287`)

## Memory Leaks

- [x] **Powerup PointLight not disposed** — Fixed: Added PointLight disposal in `removePowerup()` traversal.
- [ ] **Resize listener persists on partial init failure** — If engine init throws, resize listener is never removed.
- [ ] **Muzzle flash/explosion particles use independent RAF** — Animations run on separate requestAnimationFrame loops, not cleaned up if game ends mid-animation. (`projectile.ts:183`)

## Input

- [x] **Fire button sticks on alt-tab** — Fixed: Added `window.blur` listener that resets all input state.
- [ ] **Spectator still sends mouse updates** — Input handler runs in spectate mode, wasting bandwidth on unused tank state.
- [ ] **No mobile/touch support** — Game is unplayable on phones/tablets. No touch events, no virtual gamepad.

## Powerup Balance

- [ ] **Rapid fire + triple shot is overpowered** — 0.3x cooldown * 3 projectiles = 12.6 projectiles/sec. Dominates endgame.
- [x] **Speed boost doesn't affect rotation** — Fixed: Rotation lerp now 0.32 when speed_boost active (up from 0.2).
- [x] **Big shot self-hit** — Fixed: Grace period extended to 0.8s for big_shot projectiles (up from 0.4s).
- [ ] **Gulag survivors can't heal** — Respawn at 2 HP with no guaranteed health powerups nearby. Hard to recover.

## Visual / UX

- [x] **Light-colored nameplates invisible** — Fixed: Added dark stroke outline behind nameplate text.
- [x] **HP bar narrower than tank body** — Fixed: BAR_WIDTH changed from 2.0 to 2.2.
- [x] **No visual indicator for freeze** — Fixed: Frozen tanks get blue tint via material color change.
- [ ] **Rain zone boundary invisible** — Rain only covers center 60% but nothing communicates the safe zones.
- [x] **No respawn invulnerability** — Fixed: 2-second grace period after gulag respawn with flash/pulse visual.
- [ ] **No spawn-in animation** — Tanks pop into existence. Should fade in or have shield bubble.

## Performance

- [x] **Fog causes z-fighting** — Fixed: Fog far distance increased from 80 to 150.
- [ ] **No LOD for distant tanks** — All 8 tanks at full detail regardless of distance.
- [ ] **Session save every 5s during gameplay** — POST request every 5 seconds per player. With 8 players = 1.6 req/sec to server.

## Security

- [ ] **Game reports not validated** — `reportGameEnd()` accepts any data. Leaderboard can be manipulated. (`GameController.php:41`)
- [ ] **No rate limiting on API endpoints** — Room register/update/report can be spammed.
- [ ] **Guest IDs are predictable** — `guest-` + 8 random chars. Could enumerate active sessions.

## Polish

- [x] **No sound for gulag start** — Fixed: Added synthesized descending horn sound.
- [ ] **Leaderboard is static** — Only fetched on page load. Doesn't update after games.
- [x] **No respawn animation or invulnerability frames** — Fixed: 2-second invulnerability with visual flash.
- [x] **Kill feed doesn't distinguish system messages** — Fixed: SYSTEM messages gray, GULAG messages yellow with "GULAG —" prefix.
- [ ] **No camera shake on explosions** — Deaths feel flat without screen shake.
- [x] **No victory/defeat sound** — Fixed: Added ascending fanfare for victory, descending tones for defeat.
- [ ] **Map preview in lobby** — Players can't see what the map looks like before selecting.
