type MapName = 'classic' | 'corridors' | 'bunkers' | 'open' | 'maze';

interface MusicDef {
    notes: number[];
    tempo: number;
    wave: OscillatorType;
    bassNotes: number[];
    padFreq: number;
    padWave: OscillatorType;
}

const MAP_MUSIC: Record<MapName, MusicDef> = {
    classic: {
        notes: [130.81, 164.81, 196.00, 164.81, 130.81, 110.00, 130.81, 98.00],
        tempo: 0.4,
        wave: 'triangle',
        bassNotes: [65.41, 55.00, 65.41, 49.00],
        padFreq: 130.81,
        padWave: 'sine',
    },
    corridors: {
        notes: [146.83, 174.61, 220.00, 174.61, 146.83, 130.81, 146.83, 110.00],
        tempo: 0.3,
        wave: 'sawtooth',
        bassNotes: [73.42, 65.41, 73.42, 55.00],
        padFreq: 146.83,
        padWave: 'triangle',
    },
    bunkers: {
        notes: [98.00, 116.54, 130.81, 116.54, 98.00, 87.31, 98.00, 82.41],
        tempo: 0.5,
        wave: 'triangle',
        bassNotes: [49.00, 43.65, 49.00, 41.20],
        padFreq: 98.00,
        padWave: 'sine',
    },
    open: {
        notes: [220.00, 261.63, 329.63, 261.63, 220.00, 196.00, 220.00, 164.81],
        tempo: 0.35,
        wave: 'sine',
        bassNotes: [110.00, 98.00, 110.00, 82.41],
        padFreq: 220.00,
        padWave: 'triangle',
    },
    maze: {
        notes: [110.00, 130.81, 155.56, 130.81, 110.00, 103.83, 110.00, 92.50],
        tempo: 0.25,
        wave: 'square',
        bassNotes: [55.00, 51.91, 55.00, 46.25],
        padFreq: 110.00,
        padWave: 'sine',
    },
};

const FILE_SOUNDS = {
    fire: '/sounds/fire.mp3',
    explosion: '/sounds/explosion.mp3',
    hit: '/sounds/hit.mp3',
} as const;

type FileSoundName = keyof typeof FILE_SOUNDS;
type SynthSoundName = 'ricochet' | 'pickup' | 'shield_break' | 'gulag' | 'victory' | 'defeat';
type SoundName = FileSoundName | SynthSoundName;

export class AudioManager {
    private ctx: AudioContext | null = null;
    private buffers = new Map<FileSoundName, AudioBuffer>();
    private loaded = false;

    // Background music
    private musicGain: GainNode | null = null;
    private musicNodes: AudioScheduledSourceNode[] = [];
    private musicInterval: number | null = null;
    private musicPlaying = false;

    async load() {
        const ctx = this.getCtx();
        if (!ctx) return;

        const entries = Object.entries(FILE_SOUNDS) as [FileSoundName, string][];
        await Promise.all(
            entries.map(async ([name, src]) => {
                try {
                    const res = await fetch(src);
                    const arrayBuf = await res.arrayBuffer();
                    const audioBuf = await ctx.decodeAudioData(arrayBuf);
                    this.buffers.set(name, audioBuf);
                } catch {
                    // Sound failed to load — play() will silently skip it
                }
            }),
        );
        this.loaded = true;
    }

    private getCtx(): AudioContext | null {
        if (!this.ctx) {
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
        return this.ctx;
    }

    play(name: SoundName, volume?: number) {
        if (!this.loaded) return;

        if (name === 'ricochet') {
            this.playRicochet(volume ?? 0.15);
            return;
        }
        if (name === 'pickup') {
            this.playPickup(volume ?? 0.3);
            return;
        }
        if (name === 'shield_break') {
            this.playShieldBreak(volume ?? 0.3);
            return;
        }
        if (name === 'gulag') {
            this.playGulag(volume ?? 0.4);
            return;
        }
        if (name === 'victory') {
            this.playVictory(volume ?? 0.3);
            return;
        }
        if (name === 'defeat') {
            this.playDefeat(volume ?? 0.3);
            return;
        }

        const ctx = this.getCtx();
        if (!ctx) return;

        const buffer = this.buffers.get(name);
        if (!buffer) return;

        const gain = ctx.createGain();
        gain.gain.value = volume ?? 0.3;
        gain.connect(ctx.destination);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        source.start();
    }

    /** Synthesize a short metallic ricochet ping */
    private playRicochet(volume: number) {
        const ctx = this.getCtx();
        if (!ctx) return;

        const now = ctx.currentTime;
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        // High-pitched ping
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        const baseFreq = 2000 + Math.random() * 2000; // 2000-4000 Hz randomized
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, now + 0.1);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.12);

        // Noise burst for metallic texture
        const bufferSize = ctx.sampleRate * 0.05;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.3;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(volume * 0.5, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        noise.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start(now);
        noise.stop(now + 0.06);
    }

    /** Ascending two-tone chime for powerup pickup */
    private playPickup(volume: number) {
        const ctx = this.getCtx();
        if (!ctx) return;

        const now = ctx.currentTime;

        for (let i = 0; i < 2; i++) {
            const gain = ctx.createGain();
            gain.connect(ctx.destination);
            const t = now + i * 0.08;
            gain.gain.setValueAtTime(volume, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(i === 0 ? 600 : 900, t);
            osc.connect(gain);
            osc.start(t);
            osc.stop(t + 0.15);
        }
    }

    /** Crystalline shatter for shield break */
    private playShieldBreak(volume: number) {
        const ctx = this.getCtx();
        if (!ctx) return;

        const now = ctx.currentTime;
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(3000, now);
        osc.frequency.exponentialRampToValueAtTime(500, now + 0.15);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.2);

        // Noise burst
        const bufSize = ctx.sampleRate * 0.08;
        const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.4;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuf;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(volume * 0.6, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        noise.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start(now);
        noise.stop(now + 0.1);
    }

    private playGulag(volume: number) {
        const ctx = this.getCtx();
        if (!ctx) return;
        const now = ctx.currentTime;
        // Deep warning horn
        for (let i = 0; i < 3; i++) {
            const gain = ctx.createGain();
            gain.connect(ctx.destination);
            const t = now + i * 0.2;
            gain.gain.setValueAtTime(volume, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200 - i * 30, t);
            osc.frequency.exponentialRampToValueAtTime(100 - i * 20, t + 0.25);
            osc.connect(gain);
            osc.start(t);
            osc.stop(t + 0.3);
        }
    }

    private playVictory(volume: number) {
        const ctx = this.getCtx();
        if (!ctx) return;
        const now = ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        for (let i = 0; i < notes.length; i++) {
            const gain = ctx.createGain();
            gain.connect(ctx.destination);
            const t = now + i * 0.15;
            gain.gain.setValueAtTime(volume, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
            const osc = ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(notes[i], t);
            osc.connect(gain);
            osc.start(t);
            osc.stop(t + 0.4);
        }
    }

    private playDefeat(volume: number) {
        const ctx = this.getCtx();
        if (!ctx) return;
        const now = ctx.currentTime;
        const notes = [392.00, 349.23, 293.66, 261.63]; // G4, F4, D4, C4
        for (let i = 0; i < notes.length; i++) {
            const gain = ctx.createGain();
            gain.connect(ctx.destination);
            const t = now + i * 0.25;
            gain.gain.setValueAtTime(volume, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(notes[i], t);
            osc.connect(gain);
            osc.start(t);
            osc.stop(t + 0.5);
        }
    }

    startMusic(mapName: string) {
        this.stopMusic();
        const ctx = this.getCtx();
        if (!ctx) return;

        const def = MAP_MUSIC[mapName as MapName];
        if (!def) return;

        this.musicGain = ctx.createGain();
        this.musicGain.gain.value = 0.08; // quiet background
        this.musicGain.connect(ctx.destination);

        // Ambient pad — sustained low drone
        const pad = ctx.createOscillator();
        pad.type = def.padWave;
        pad.frequency.value = def.padFreq * 0.5;
        const padGain = ctx.createGain();
        padGain.gain.value = 0.4;
        pad.connect(padGain);
        padGain.connect(this.musicGain);
        pad.start();
        this.musicNodes.push(pad);

        // Second pad voice for thickness
        const pad2 = ctx.createOscillator();
        pad2.type = 'sine';
        pad2.frequency.value = def.padFreq * 0.501; // slight detune for width
        const pad2Gain = ctx.createGain();
        pad2Gain.gain.value = 0.3;
        pad2.connect(pad2Gain);
        pad2Gain.connect(this.musicGain);
        pad2.start();
        this.musicNodes.push(pad2);

        // Melodic sequence
        let noteIdx = 0;
        let bassIdx = 0;
        const scheduleNote = () => {
            if (!this.musicPlaying || !ctx || ctx.state === 'closed') return;

            const now = ctx.currentTime;
            const dur = def.tempo * 0.9;

            // Lead note
            const osc = ctx.createOscillator();
            osc.type = def.wave;
            osc.frequency.value = def.notes[noteIdx % def.notes.length];
            const noteGain = ctx.createGain();
            noteGain.gain.setValueAtTime(0.5, now);
            noteGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
            osc.connect(noteGain);
            noteGain.connect(this.musicGain!);
            osc.start(now);
            osc.stop(now + dur);

            // Bass note (plays every 2 melody notes)
            if (noteIdx % 2 === 0) {
                const bass = ctx.createOscillator();
                bass.type = 'triangle';
                bass.frequency.value = def.bassNotes[bassIdx % def.bassNotes.length];
                const bassGain = ctx.createGain();
                bassGain.gain.setValueAtTime(0.6, now);
                bassGain.gain.exponentialRampToValueAtTime(0.001, now + def.tempo * 1.8);
                bass.connect(bassGain);
                bassGain.connect(this.musicGain!);
                bass.start(now);
                bass.stop(now + def.tempo * 2);
                bassIdx++;
            }

            noteIdx++;
        };

        this.musicPlaying = true;
        scheduleNote();
        this.musicInterval = window.setInterval(scheduleNote, def.tempo * 1000);
    }

    stopMusic() {
        this.musicPlaying = false;
        if (this.musicInterval) {
            clearInterval(this.musicInterval);
            this.musicInterval = null;
        }
        for (const node of this.musicNodes) {
            try { node.stop(); } catch { /* already stopped */ }
        }
        this.musicNodes = [];
        this.musicGain?.disconnect();
        this.musicGain = null;
    }

    destroy() {
        this.stopMusic();
        this.buffers.clear();
        this.ctx?.close().catch(() => {});
        this.ctx = null;
        this.loaded = false;
    }
}
