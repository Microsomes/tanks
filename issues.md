# Tanks! - Issues & Improvements

## Critical Bugs

- [x] **Memory leak: Remote tank meshes not disposed** — Fixed: full traverse + dispose.
- [x] **Trail geometry recreated every frame** — Fixed: pre-allocated BufferGeometry with attribute updates.
- [x] **Rain bullets can kill during gulag** — Fixed: gulagInProgress flag blocks rain damage.
- [x] **Effect tick interval never cleared on game-over** — Fixed: cleared in both onGameOver callbacks.
- [x] **Reconnection race condition** — Fixed: 100ms delay + graceful fallback.
- [x] **Freeze powerup doesn't work** — Fixed: network broadcast, applyRemoteFreeze(), blue tint.
- [x] **Kills/deaths always reported as 0** — Fixed: tracked by player ID, sent in reportGameEnd().

## Edge Cases

- [x] **Powerup double-pickup** — Already handled: handleRemotePowerupPickup returns early if not found.
- [x] **Player rejoins during gulag** — Fixed: tank not added during gulag, syncs after.
- [x] **Projectile stuck in wall corners** — Fixed: nudge projectile away from corner on double-bounce.
- [x] **Shield vs simultaneous projectiles** — Accepted behavior: first breaks shield, second damages. Consistent.
- [x] **Landmine double-detonation** — Fixed: collect detonation indices first, process in reverse.
- [x] **Ghost tanks visible during countdown** — Already fixed: engine created after countdown ends.

## Network / Sync

- [x] **Tank state arrives before engine ready** — Acceptable: engine?.method() safely no-ops when null.
- [x] **Game-over fires while gulag pending** — Fixed: checkWinCondition returns early if gulagInProgress.
- [x] **15Hz tank state throttle causes jitter** — Fixed: increased to 20Hz (50ms interval).
- [x] **No server-side hit validation** — Mitigated: game reports validated, rate limiting added.

## Memory Leaks

- [x] **Powerup PointLight not disposed** — Fixed: PointLight disposal in traverse.
- [x] **Resize listener persists on partial init failure** — Fixed: try-catch in init() removes listener on error.
- [x] **Muzzle flash/explosion particles use independent RAF** — Fixed: early-exit if mesh removed from scene.

## Input

- [x] **Fire button sticks on alt-tab** — Fixed: window.blur resets all input state.
- [x] **Spectator still sends mouse updates** — Fixed: spectateMode skips onTankState broadcast.
- [ ] **No mobile/touch support** — Future: needs virtual gamepad + touch aiming.

## Powerup Balance

- [x] **Rapid fire + triple shot is overpowered** — Fixed: combo uses 0.5x cooldown instead of 0.3x.
- [x] **Speed boost doesn't affect rotation** — Fixed: rotation lerp boosted to 0.32.
- [x] **Big shot self-hit** — Fixed: grace period 0.8s for big_shot.
- [x] **Gulag survivors can't heal** — Fixed: gulag HP increased from 2 to 3.

## Visual / UX

- [x] **Light-colored nameplates invisible** — Fixed: dark stroke outline.
- [x] **HP bar narrower than tank body** — Fixed: BAR_WIDTH = 2.2.
- [x] **No visual indicator for freeze** — Fixed: blue tint on frozen tanks.
- [x] **Rain zone boundary invisible** — Fixed: semi-transparent red plane on ground during rain.
- [x] **No respawn invulnerability** — Fixed: 2-second grace with flash visual.
- [ ] **No spawn-in animation** — Future: fade-in or shield bubble on spawn.

## Performance

- [x] **Fog causes z-fighting** — Fixed: fog far 80→150.
- [ ] **No LOD for distant tanks** — Future: simplify distant tank meshes.
- [x] **Session save every 5s during gameplay** — Fixed: increased to 10s interval.

## Security

- [x] **Game reports not validated** — Fixed: player count, kill cap, winner validation.
- [x] **No rate limiting on API endpoints** — Fixed: POST 30/min, GET 60/min throttle.
- [x] **Guest IDs are predictable** — Fixed: Str::random(16) instead of 8.

## Polish

- [x] **No sound for gulag start** — Fixed: synthesized descending horn.
- [x] **Leaderboard is static** — Fixed: refreshes after each game ends.
- [x] **No respawn animation or invulnerability frames** — Fixed: 2s invulnerability + flash.
- [x] **Kill feed doesn't distinguish system messages** — Fixed: SYSTEM gray, GULAG yellow.
- [x] **No camera shake on explosions** — Fixed: shake on hit (0.5), death (1.0), remote death (0.3).
- [x] **No victory/defeat sound** — Fixed: ascending fanfare / descending tones.
- [x] **Map preview in lobby** — Fixed: short description under each map button.
