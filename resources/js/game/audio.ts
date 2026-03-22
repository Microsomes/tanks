const FILE_SOUNDS = {
    fire: '/sounds/fire.mp3',
    explosion: '/sounds/explosion.mp3',
    hit: '/sounds/hit.mp3',
} as const;

type FileSoundName = keyof typeof FILE_SOUNDS;
type SynthSoundName = 'ricochet';
type SoundName = FileSoundName | SynthSoundName;

export class AudioManager {
    private ctx: AudioContext | null = null;
    private buffers = new Map<FileSoundName, AudioBuffer>();
    private loaded = false;

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

    destroy() {
        this.buffers.clear();
        this.ctx?.close().catch(() => {});
        this.ctx = null;
        this.loaded = false;
    }
}
