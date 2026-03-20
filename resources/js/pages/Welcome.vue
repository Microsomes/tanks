<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { dashboard, login, register } from '@/routes';
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import ToastNotification from '@/components/ToastNotification.vue';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import {
    Container,
    Radio,
    Activity,
    Clock,
    Cloud,
    CodeXml,
    Users,
    Zap,
    Terminal,
    GitBranch,
    Database,
    Mail,
    MousePointerClick,
} from 'lucide-vue-next';

withDefaults(
    defineProps<{
        canRegister: boolean;
    }>(),
    {
        canRegister: true,
    },
);

const CURSOR_COLORS = [
    '#f43f5e', '#ec4899', '#a855f7', '#8b5cf6',
    '#6366f1', '#3b82f6', '#06b6d4', '#14b8a6',
    '#10b981', '#22c55e', '#eab308', '#f97316',
];

interface CursorData {
    x: number;
    y: number;
    color: string;
    name: string;
    lastSeen: number;
}

interface Particle {
    id: number;
    x: number;
    y: number;
    color: string;
    angle: number;
    distance: number;
    size: number;
    duration: number;
}

const showBanner = ref(true);
const visitorCount = ref(0);
const cursors = reactive<Record<string, CursorData>>({});
const particles = ref<Particle[]>([]);
const myId = ref('');
const myColor = ref('');
let welcomeEcho: Echo<'reverb'> | null = null;
let channel: ReturnType<Echo<'reverb'>['join']> | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let nextParticleId = 0;

function getColorForId(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

function throttle<T extends (...args: any[]) => void>(fn: T, ms: number): T {
    let last = 0;
    return ((...args: any[]) => {
        const now = Date.now();
        if (now - last >= ms) {
            last = now;
            fn(...args);
        }
    }) as T;
}

function getCsrfToken(): string {
    const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

function spawnParticles(x: number, y: number, color: string) {
    const count = 14;
    const newParticles: Particle[] = [];

    for (let i = 0; i < count; i++) {
        newParticles.push({
            id: nextParticleId++,
            x,
            y,
            color,
            angle: (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6,
            distance: 50 + Math.random() * 80,
            size: 3 + Math.random() * 6,
            duration: 600 + Math.random() * 600,
        });
    }

    particles.value.push(...newParticles);

    setTimeout(() => {
        const ids = new Set(newParticles.map((p) => p.id));
        particles.value = particles.value.filter((p) => !ids.has(p.id));
    }, 1300);
}

function handleClick(e: MouseEvent) {
    const x = e.clientX;
    const y = e.clientY;

    spawnParticles(x, y, myColor.value);

    if (channel) {
        channel.whisper('particles', {
            x: x / window.innerWidth,
            y: y / window.innerHeight,
            color: myColor.value,
        });
    }
}

const handleMouseMove = throttle((e: MouseEvent) => {
    if (!channel) return;
    channel.whisper('mouse-move', {
        id: myId.value,
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
        color: myColor.value,
        name: 'Visitor',
    });
}, 50);

onMounted(() => {
    welcomeEcho = new Echo({
        broadcaster: 'reverb',
        key: import.meta.env.VITE_REVERB_APP_KEY,
        wsHost: import.meta.env.VITE_REVERB_HOST,
        wsPort: Number(import.meta.env.VITE_REVERB_PORT),
        wssPort: Number(import.meta.env.VITE_REVERB_PORT),
        forceTLS: import.meta.env.VITE_REVERB_SCHEME === 'https',
        enabledTransports: ['ws', 'wss'],
        Pusher,
        authorizer: (ch: any) => ({
            authorize: (socketId: string, callback: (error: any, data: any) => void) => {
                fetch('/welcome/presence-auth', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-XSRF-TOKEN': getCsrfToken(),
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        socket_id: socketId,
                        channel_name: ch.name,
                    }),
                })
                    .then((r) => r.json())
                    .then((data) => callback(null, data))
                    .catch((error) => callback(error, null));
            },
        }),
    });

    channel = welcomeEcho.join('welcome');

    channel
        .here((users: any[]) => {
            visitorCount.value = users.length;
            if (users.length > 0) {
                const meUser = users[users.length - 1];
                myId.value = String(meUser.id ?? meUser);
                myColor.value = getColorForId(myId.value);
            }
        })
        .joining(() => {
            visitorCount.value++;
        })
        .leaving((user: any) => {
            visitorCount.value--;
            const id = String(user.id ?? user);
            delete cursors[id];
        })
        .listenForWhisper('mouse-move', (e: any) => {
            if (e.id === myId.value) return;
            cursors[e.id] = {
                x: e.x,
                y: e.y,
                color: e.color,
                name: e.name || 'Visitor',
                lastSeen: Date.now(),
            };
        })
        .listenForWhisper('particles', (e: any) => {
            spawnParticles(
                e.x * window.innerWidth,
                e.y * window.innerHeight,
                e.color,
            );
        });

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('click', handleClick);

    cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const id in cursors) {
            if (now - cursors[id].lastSeen > 5000) {
                delete cursors[id];
            }
        }
    }, 3000);
});

onUnmounted(() => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('click', handleClick);
    if (channel) {
        welcomeEcho?.leave('welcome');
    }
    welcomeEcho?.disconnect();
    if (cleanupInterval) clearInterval(cleanupInterval);
});

const features = [
    {
        icon: Container,
        title: 'Docker Compose',
        desc: '9-service dev stack: PHP-FPM, Nginx, MariaDB, Redis, Node, Reverb, Horizon, Scheduler, Mailpit',
        color: 'text-blue-400',
        border: 'border-blue-500/20',
        bg: 'bg-blue-500/5',
    },
    {
        icon: Radio,
        title: 'Laravel Reverb',
        desc: 'First-party WebSocket server for real-time broadcasting. See the live cursors on this page!',
        color: 'text-violet-400',
        border: 'border-violet-500/20',
        bg: 'bg-violet-500/5',
    },
    {
        icon: Activity,
        title: 'Horizon',
        desc: 'Queue dashboard for monitoring Redis-powered job processing with metrics and retry controls',
        color: 'text-indigo-400',
        border: 'border-indigo-500/20',
        bg: 'bg-indigo-500/5',
    },
    {
        icon: Clock,
        title: 'Task Scheduler',
        desc: 'Cron-based task scheduling running inside its own container, ready for recurring jobs',
        color: 'text-emerald-400',
        border: 'border-emerald-500/20',
        bg: 'bg-emerald-500/5',
    },
    {
        icon: Cloud,
        title: 'Terraform + Ansible',
        desc: 'One-command staging deploys to DigitalOcean. Terraform provisions, Ansible configures the server',
        color: 'text-purple-400',
        border: 'border-purple-500/20',
        bg: 'bg-purple-500/5',
    },
    {
        icon: CodeXml,
        title: 'Vue 3 + Inertia + TS',
        desc: 'Inertia.js SPA with SSR, TypeScript, Tailwind v4, Reka UI components, and Wayfinder routes',
        color: 'text-cyan-400',
        border: 'border-cyan-500/20',
        bg: 'bg-cyan-500/5',
    },
];

const infraSteps = [
    { step: '01', label: 'Configure', desc: 'Set domain, DB credentials, and droplet specs in config.yml' },
    { step: '02', label: 'Provision', desc: 'terraform apply creates your DigitalOcean droplet' },
    { step: '03', label: 'Stage 1', desc: 'Ansible installs PHP-FPM, Nginx, MariaDB, Redis and generates a deploy key' },
    { step: '04', label: 'Stage 2', desc: 'Add deploy key to GitHub, then Ansible clones, builds, and goes live with SSL' },
];

const techStack = [
    { label: 'PHP 8.5', icon: Terminal },
    { label: 'Laravel 13', icon: Zap },
    { label: 'Vue 3', icon: CodeXml },
    { label: 'MariaDB 11', icon: Database },
    { label: 'Redis', icon: Database },
    { label: 'Mailpit', icon: Mail },
    { label: 'Inertia', icon: GitBranch },
    { label: 'Tailwind v4', icon: CodeXml },
];
</script>

<template>
    <Head title="Welcome" />
    <ToastNotification />

    <!-- Cursor + Particle overlay -->
    <div class="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        <!-- Other users' cursors -->
        <TransitionGroup name="cursor">
            <div
                v-for="(cursor, id) in cursors"
                :key="id"
                class="absolute transition-all duration-75 ease-linear"
                :style="{
                    left: `${cursor.x * 100}%`,
                    top: `${cursor.y * 100}%`,
                    transform: 'translate(-2px, -2px)',
                }"
            >
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    class="drop-shadow-lg"
                >
                    <path
                        d="M3 3L10 17L12 11L18 9L3 3Z"
                        :fill="cursor.color"
                        :stroke="cursor.color"
                        stroke-width="1"
                        stroke-linejoin="round"
                    />
                </svg>
                <span
                    class="ml-4 -mt-1 block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium text-white shadow-lg"
                    :style="{ backgroundColor: cursor.color }"
                >
                    {{ cursor.name }}
                </span>
            </div>
        </TransitionGroup>

        <!-- Particles -->
        <div
            v-for="p in particles"
            :key="p.id"
            class="particle absolute rounded-full"
            :style="{
                left: `${p.x}px`,
                top: `${p.y}px`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                backgroundColor: p.color,
                boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
                '--dx': `${Math.cos(p.angle) * p.distance}px`,
                '--dy': `${Math.sin(p.angle) * p.distance}px`,
                animationDuration: `${p.duration}ms`,
            }"
        />
    </div>

    <div class="min-h-screen bg-zinc-950 text-zinc-100">
        <!-- Subtle gradient background -->
        <div class="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-950/20 via-zinc-950 to-zinc-950"></div>

        <!-- Grid pattern overlay -->
        <div
            class="fixed inset-0 opacity-[0.03]"
            style="
                background-image: url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M60%200H0v60%22%20fill%3D%22none%22%20stroke%3D%22%23fff%22%20stroke-width%3D%220.5%22%2F%3E%3C%2Fsvg%3E');
                background-size: 60px 60px;
            "
        ></div>

        <div class="relative z-10">
            <!-- Cleanup banner -->
            <div v-if="showBanner" class="border-b border-zinc-800/50 bg-zinc-900/80 backdrop-blur-sm">
                <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-2.5">
                    <p class="flex flex-wrap items-center gap-x-2 text-sm text-zinc-400">
                        <Terminal class="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                        Ready to build? Run
                        <code class="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-emerald-400">php artisan starter:cleanup</code>
                        to replace this with a clean Hello World.
                    </p>
                    <button @click="showBanner = false" class="shrink-0 text-zinc-600 transition hover:text-zinc-400">
                        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                </div>
            </div>

            <!-- Header -->
            <header class="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
                <div class="flex items-center gap-3">
                    <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600">
                        <Zap class="h-5 w-5 text-white" />
                    </div>
                    <span class="text-lg font-semibold text-zinc-100">Laravel Starter</span>
                </div>
                <nav class="flex items-center gap-3">
                    <Link
                        href="/docs"
                        class="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition hover:text-zinc-100"
                    >
                        Docs
                    </Link>
                    <Link
                        v-if="$page.props.auth.user"
                        :href="dashboard()"
                        class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500"
                    >
                        Dashboard
                    </Link>
                    <template v-else>
                        <Link
                            :href="login()"
                            class="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition hover:text-zinc-100"
                        >
                            Log in
                        </Link>
                        <Link
                            v-if="canRegister"
                            :href="register()"
                            class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500"
                        >
                            Register
                        </Link>
                    </template>
                </nav>
            </header>

            <!-- Hero -->
            <section class="mx-auto max-w-6xl px-6 pb-16 pt-20 text-center lg:pt-32">
                <!-- Live counter badge -->
                <div class="mb-8 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-4 py-1.5 text-sm backdrop-blur-sm">
                    <span class="relative flex h-2.5 w-2.5">
                        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                        <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                    </span>
                    <Users class="h-3.5 w-3.5 text-zinc-400" />
                    <span class="text-zinc-300">
                        <strong class="text-emerald-400">{{ visitorCount }}</strong>
                        {{ visitorCount === 1 ? 'visitor' : 'visitors' }} on this page right now
                    </span>
                </div>

                <h1 class="mx-auto max-w-4xl text-5xl font-bold tracking-tight lg:text-7xl">
                    <span class="bg-gradient-to-r from-zinc-100 via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
                        Laravel Docker Vue
                    </span>
                    <br />
                    <span class="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                        Starter 2026
                    </span>
                </h1>

                <p class="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400">
                    A production-ready starter template with Docker Compose, real-time WebSockets,
                    queue management, scheduled tasks, and one-command infrastructure deployment.
                </p>

                <p class="mx-auto mt-3 flex items-center justify-center gap-2 text-sm text-zinc-500">
                    <MousePointerClick class="h-4 w-4" />
                    Move your mouse and click anywhere to throw particles — others will see them too
                </p>

                <div class="mt-10 flex items-center justify-center gap-4">
                    <a
                        href="#getting-started"
                        class="rounded-lg bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
                    >
                        Get Started
                    </a>
                    <a
                        href="#features"
                        class="rounded-lg border border-zinc-800 px-6 py-3 text-sm font-semibold text-zinc-300 transition hover:border-zinc-700 hover:text-white"
                    >
                        Explore Features
                    </a>
                </div>
            </section>

            <!-- Features Grid -->
            <section id="features" class="mx-auto max-w-6xl px-6 py-16">
                <div class="mb-12 text-center">
                    <h2 class="text-3xl font-bold text-zinc-100">Everything Included</h2>
                    <p class="mt-3 text-zinc-400">
                        One
                        <code class="rounded bg-zinc-800 px-1.5 py-0.5 text-sm text-violet-400">docker compose up</code>
                        and you're running.
                    </p>
                </div>

                <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <div
                        v-for="feature in features"
                        :key="feature.title"
                        class="group rounded-xl border border-zinc-800/50 bg-zinc-900/50 p-6 backdrop-blur-sm transition hover:border-zinc-700/50 hover:bg-zinc-900/80"
                    >
                        <div
                            class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border"
                            :class="[feature.bg, feature.border]"
                        >
                            <component :is="feature.icon" class="h-5 w-5" :class="feature.color" />
                        </div>
                        <h3 class="text-lg font-semibold text-zinc-100">{{ feature.title }}</h3>
                        <p class="mt-2 text-sm leading-relaxed text-zinc-400">{{ feature.desc }}</p>
                    </div>
                </div>
            </section>

            <!-- Getting Started -->
            <section id="getting-started" class="mx-auto max-w-6xl px-6 py-16">
                <div class="overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-900/50 backdrop-blur-sm">
                    <div class="grid lg:grid-cols-2">
                        <!-- Left: Info -->
                        <div class="p-8 lg:p-12">
                            <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-xs font-medium text-emerald-400">
                                <Terminal class="h-3.5 w-3.5" />
                                Getting Started
                            </div>
                            <h2 class="text-3xl font-bold text-zinc-100">
                                Up and running<br />in 4 commands
                            </h2>
                            <p class="mt-4 text-zinc-400">
                                Clone the repo, copy the environment file, build the containers, and run the setup commands.
                                Everything is containerized — no local PHP, Node, or database installs needed.
                            </p>

                            <div class="mt-8 space-y-3">
                                <div class="flex items-center gap-3">
                                    <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-[10px] font-bold text-emerald-400">1</span>
                                    <span class="text-sm text-zinc-400">Build and start all 9 services</span>
                                </div>
                                <div class="flex items-center gap-3">
                                    <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-[10px] font-bold text-emerald-400">2</span>
                                    <span class="text-sm text-zinc-400">Install PHP dependencies</span>
                                </div>
                                <div class="flex items-center gap-3">
                                    <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-[10px] font-bold text-emerald-400">3</span>
                                    <span class="text-sm text-zinc-400">Generate app key and run migrations</span>
                                </div>
                                <div class="flex items-center gap-3">
                                    <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-[10px] font-bold text-emerald-400">4</span>
                                    <span class="text-sm text-zinc-400">Visit localhost:9005</span>
                                </div>
                            </div>
                        </div>

                        <!-- Right: Terminal -->
                        <div class="border-t border-zinc-800/50 bg-zinc-950/50 p-8 lg:border-l lg:border-t-0 lg:p-12">
                            <div class="rounded-xl border border-zinc-800 bg-zinc-950 p-5 font-mono text-sm">
                                <div class="mb-3 flex items-center gap-2">
                                    <span class="h-3 w-3 rounded-full bg-red-500/60"></span>
                                    <span class="h-3 w-3 rounded-full bg-yellow-500/60"></span>
                                    <span class="h-3 w-3 rounded-full bg-green-500/60"></span>
                                    <span class="ml-2 text-xs text-zinc-600">terminal</span>
                                </div>
                                <div class="space-y-1 text-zinc-400">
                                    <p class="text-zinc-600"># Clone and configure</p>
                                    <p><span class="text-emerald-400">$</span> git clone https://github.com/Microsomes/laravel-docker-vue-starter-2026.git myapp</p>
                                    <p><span class="text-emerald-400">$</span> cd myapp</p>
                                    <p><span class="text-emerald-400">$</span> cp .env.example .env</p>
                                    <p>&nbsp;</p>
                                    <p class="text-zinc-600"># Build and start containers</p>
                                    <p><span class="text-emerald-400">$</span> docker compose up -d --build</p>
                                    <p>&nbsp;</p>
                                    <p class="text-zinc-600"># Install dependencies</p>
                                    <p><span class="text-emerald-400">$</span> docker compose exec app composer install</p>
                                    <p>&nbsp;</p>
                                    <p class="text-zinc-600"># Generate key and run migrations</p>
                                    <p><span class="text-emerald-400">$</span> docker compose exec app php artisan key:generate</p>
                                    <p><span class="text-emerald-400">$</span> docker compose exec app php artisan migrate</p>
                                    <p>&nbsp;</p>
                                    <p class="text-zinc-600"># Ready!</p>
                                    <p><span class="text-emerald-400">$</span> open <span class="text-amber-300">http://localhost:9005</span></p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Infrastructure Section -->
            <section id="infrastructure" class="mx-auto max-w-6xl px-6 py-16">
                <div class="overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-900/50 backdrop-blur-sm">
                    <div class="grid lg:grid-cols-2">
                        <!-- Left: Info -->
                        <div class="p-8 lg:p-12">
                            <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/5 px-3 py-1 text-xs font-medium text-purple-400">
                                <Cloud class="h-3.5 w-3.5" />
                                Staging Infrastructure
                            </div>
                            <h2 class="text-3xl font-bold text-zinc-100">
                                Deploy to DigitalOcean<br />in minutes
                            </h2>
                            <p class="mt-4 text-zinc-400">
                                Terraform provisions a DigitalOcean droplet with SSH keys and generates
                                Ansible inventory automatically. Ansible playbooks handle server configuration,
                                app deployment, SSL, and service management.
                            </p>

                            <div class="mt-8 space-y-4">
                                <div
                                    v-for="step in infraSteps"
                                    :key="step.step"
                                    class="flex items-start gap-4"
                                >
                                    <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-xs font-bold text-violet-400">
                                        {{ step.step }}
                                    </span>
                                    <div>
                                        <h4 class="font-semibold text-zinc-200">{{ step.label }}</h4>
                                        <p class="text-sm text-zinc-500">{{ step.desc }}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Right: Code block -->
                        <div class="border-t border-zinc-800/50 bg-zinc-950/50 p-8 lg:border-l lg:border-t-0 lg:p-12">
                            <div class="rounded-xl border border-zinc-800 bg-zinc-950 p-5 font-mono text-sm">
                                <div class="mb-3 flex items-center gap-2">
                                    <span class="h-3 w-3 rounded-full bg-zinc-800"></span>
                                    <span class="h-3 w-3 rounded-full bg-zinc-800"></span>
                                    <span class="h-3 w-3 rounded-full bg-zinc-800"></span>
                                    <span class="ml-2 text-xs text-zinc-600">.infra/staging/</span>
                                </div>
                                <div class="space-y-1 text-zinc-400">
                                    <p><span class="text-zinc-600"># Directory structure</span></p>
                                    <p><span class="text-violet-400">|--</span> config.yml</p>
                                    <p><span class="text-violet-400">|--</span> terraform/</p>
                                    <p><span class="text-violet-400">|</span>&nbsp;&nbsp;&nbsp;<span class="text-violet-400">|--</span> main.tf</p>
                                    <p><span class="text-violet-400">|</span>&nbsp;&nbsp;&nbsp;<span class="text-violet-400">|--</span> variables.tf</p>
                                    <p><span class="text-violet-400">|</span>&nbsp;&nbsp;&nbsp;<span class="text-violet-400">`--</span> outputs.tf</p>
                                    <p><span class="text-violet-400">`--</span> ansible/</p>
                                    <p>&nbsp;&nbsp;&nbsp;&nbsp;<span class="text-violet-400">|--</span> playbook.yml</p>
                                    <p>&nbsp;&nbsp;&nbsp;&nbsp;<span class="text-violet-400">`--</span> inventory.ini <span class="text-zinc-600">(auto-generated)</span></p>
                                </div>

                                <div class="mt-6 border-t border-zinc-800 pt-4">
                                    <p class="text-zinc-600"># config.yml</p>
                                    <p><span class="text-emerald-400">region</span>: <span class="text-amber-300">lon1</span></p>
                                    <p><span class="text-emerald-400">size</span>: <span class="text-amber-300">s-1vcpu-2gb</span></p>
                                    <p><span class="text-emerald-400">image</span>: <span class="text-amber-300">ubuntu-24-04-x64</span></p>
                                    <p><span class="text-emerald-400">app_domain</span>: <span class="text-amber-300">staging.example.com</span></p>
                                </div>

                                <div class="mt-6 border-t border-zinc-800 pt-4">
                                    <p class="text-zinc-600"># Provision + Stage 1</p>
                                    <p><span class="text-emerald-400">$</span> cd .infra/staging/terraform</p>
                                    <p><span class="text-emerald-400">$</span> terraform init && terraform apply</p>
                                    <p><span class="text-emerald-400">$</span> cd ../ansible</p>
                                    <p><span class="text-emerald-400">$</span> ansible-playbook -i inventory.ini playbook.yml <span class="text-amber-300">--tags stage1</span></p>
                                    <p class="text-zinc-600"># Copy deploy key to GitHub, then:</p>
                                    <p><span class="text-emerald-400">$</span> ansible-playbook -i inventory.ini playbook.yml <span class="text-amber-300">--tags stage2</span></p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Docker Services -->
            <section class="mx-auto max-w-6xl px-6 py-16">
                <div class="mb-12 text-center">
                    <h2 class="text-3xl font-bold text-zinc-100">Docker Compose Stack</h2>
                    <p class="mt-3 text-zinc-400">9 services orchestrated for local development</p>
                </div>

                <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-9">
                    <div
                        v-for="service in ['PHP-FPM', 'Nginx', 'MariaDB', 'Redis', 'Node/Vite', 'Reverb', 'Horizon', 'Scheduler', 'Mailpit']"
                        :key="service"
                        class="flex flex-col items-center gap-2 rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4 text-center"
                    >
                        <Container class="h-5 w-5 text-zinc-500" />
                        <span class="text-xs font-medium text-zinc-400">{{ service }}</span>
                    </div>
                </div>
            </section>

            <!-- Tech Stack Bar -->
            <section class="mx-auto max-w-6xl px-6 py-16">
                <div class="flex flex-wrap items-center justify-center gap-6">
                    <div
                        v-for="tech in techStack"
                        :key="tech.label"
                        class="flex items-center gap-2 text-sm text-zinc-500"
                    >
                        <component :is="tech.icon" class="h-4 w-4" />
                        <span>{{ tech.label }}</span>
                    </div>
                </div>
            </section>

            <!-- Footer -->
            <footer class="border-t border-zinc-800/50 py-8 text-center text-sm text-zinc-600">
                <p>Built with Laravel, Vue, and a lot of Docker containers.</p>
            </footer>
        </div>
    </div>
</template>

<style scoped>
.cursor-enter-active {
    transition: opacity 0.3s ease-out;
}
.cursor-leave-active {
    transition: opacity 0.5s ease-in;
}
.cursor-enter-from,
.cursor-leave-to {
    opacity: 0;
}

.particle {
    animation: particle-fly linear forwards;
}

@keyframes particle-fly {
    0% {
        transform: translate(0, 0) scale(1);
        opacity: 1;
    }
    70% {
        opacity: 0.8;
    }
    100% {
        transform: translate(var(--dx), var(--dy)) scale(0);
        opacity: 0;
    }
}
</style>
