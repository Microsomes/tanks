<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { ref, onMounted, onUnmounted } from 'vue';
import {
    Zap,
    Container,
    FileCode,
    Server,
    Cloud,
    Terminal,
    FolderTree,
    Settings,
    Globe,
    Layers,
    ArrowLeft,
    Hash,
    ChevronDown,
} from 'lucide-vue-next';

const activeSection = ref('overview');

const sections = [
    { id: 'overview', label: 'Overview', icon: Layers },
    { id: 'docker', label: 'Docker Compose', icon: Container },
    { id: 'dockerfile', label: 'PHP Dockerfile', icon: FileCode },
    { id: 'nginx', label: 'Nginx', icon: Globe },
    { id: 'env', label: 'Environment', icon: Settings },
    { id: 'terraform', label: 'Terraform', icon: Cloud },
    { id: 'ansible', label: 'Ansible', icon: Server },
    { id: 'structure', label: 'Infra Structure', icon: FolderTree },
    { id: 'commands', label: 'Commands', icon: Terminal },
];

function scrollToSection(id: string) {
    activeSection.value = id;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleScroll() {
    const scrollY = window.scrollY + 120;
    for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i].id);
        if (el && el.offsetTop <= scrollY) {
            activeSection.value = sections[i].id;
            break;
        }
    }
}

onMounted(() => window.addEventListener('scroll', handleScroll, { passive: true }));
onUnmounted(() => window.removeEventListener('scroll', handleScroll));

const openFiles = ref<Record<string, boolean>>({
    'tf-config': true,
    'tf-variables': true,
    'tf-outputs': true,
    'nginx-dockerfile': true,
    'nginx-conf': true,
});

function toggleFile(id: string) {
    openFiles.value[id] = !openFiles.value[id];
}

const stagingCmds = [
    { cmd: 'cd .infra/staging/terraform && terraform init', desc: 'Initialize Terraform' },
    { cmd: 'terraform apply -var="do_token=..."', desc: 'Provision DigitalOcean droplet' },
    { cmd: 'terraform output droplet_ip', desc: 'Get server IP' },
    { cmd: 'cd ../ansible && ansible-playbook -i inventory.ini playbook.yml --tags stage1', desc: 'Stage 1: Install packages, generate deploy key' },
    { cmd: '# Copy the printed deploy key to GitHub repo settings/keys', desc: 'Manual step' },
    { cmd: 'ansible-playbook -i inventory.ini playbook.yml --tags stage2', desc: 'Stage 2: Clone, build, go live' },
    { cmd: 'terraform destroy', desc: 'Tear down staging' },
];

// ── File contents ──────────────────────────────────────────────

const files = {
    'docker-compose': `services:
  app:
    build:
      context: .docker/dev/php
      dockerfile: Dockerfile
    container_name: laravel-app
    restart: unless-stopped
    working_dir: /var/www/html
    volumes:
      - .:/var/www/html
    networks:
      - laravel
    depends_on:
      mariadb:
        condition: service_healthy
      redis:
        condition: service_started

  nginx:
    build:
      context: .docker/dev/nginx
      dockerfile: Dockerfile
    container_name: laravel-nginx
    restart: unless-stopped
    ports:
      - "9005:80"
    volumes:
      - .:/var/www/html
    networks:
      - laravel
    depends_on:
      - app

  mariadb:
    image: mariadb:11
    container_name: laravel-mariadb
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: secret
      MYSQL_DATABASE: laravel
      MYSQL_USER: laravel
      MYSQL_PASSWORD: secret
    volumes:
      - mariadb_data:/var/lib/mysql
    networks:
      - laravel
    healthcheck:
      test: ["CMD", "mariadb-admin", "ping", "-h", "localhost", "-psecret"]
      interval: 5s
      timeout: 5s
      retries: 10

  node:
    build:
      context: .docker/dev/php
      dockerfile: Dockerfile
    container_name: laravel-node
    restart: unless-stopped
    working_dir: /var/www/html
    ports:
      - "5173:5173"
    volumes:
      - .:/var/www/html
    networks:
      - laravel
    depends_on:
      mariadb:
        condition: service_healthy
    command: sh -c "npm install && npm run dev"

  redis:
    image: redis:alpine
    container_name: laravel-redis
    restart: unless-stopped
    networks:
      - laravel

  reverb:
    build:
      context: .docker/dev/php
      dockerfile: Dockerfile
    container_name: laravel-reverb
    restart: unless-stopped
    working_dir: /var/www/html
    ports:
      - "8080:8080"
    volumes:
      - .:/var/www/html
    networks:
      - laravel
    depends_on:
      mariadb:
        condition: service_healthy
      redis:
        condition: service_started
    command: php artisan reverb:start --host=0.0.0.0 --port=8080

  horizon:
    build:
      context: .docker/dev/php
      dockerfile: Dockerfile
    container_name: laravel-horizon
    restart: unless-stopped
    working_dir: /var/www/html
    volumes:
      - .:/var/www/html
    networks:
      - laravel
    depends_on:
      mariadb:
        condition: service_healthy
      redis:
        condition: service_started
    command: php artisan horizon

  scheduler:
    build:
      context: .docker/dev/php
      dockerfile: Dockerfile
    container_name: laravel-scheduler
    restart: unless-stopped
    working_dir: /var/www/html
    volumes:
      - .:/var/www/html
    networks:
      - laravel
    depends_on:
      mariadb:
        condition: service_healthy
      redis:
        condition: service_started
    command: php artisan schedule:work

  mailpit:
    image: axllent/mailpit
    container_name: laravel-mailpit
    restart: unless-stopped
    ports:
      - "8025:8025"
      - "1025:1025"
    networks:
      - laravel

networks:
  laravel:
    driver: bridge

volumes:
  mariadb_data:
    driver: local`,

    'php-dockerfile': `FROM php:8.5-fpm-alpine

# Install system dependencies
RUN apk add --no-cache \\
    curl \\
    freetype-dev \\
    icu-dev \\
    libjpeg-turbo-dev \\
    libpng-dev \\
    libxml2-dev \\
    libzip-dev \\
    oniguruma-dev \\
    zip \\
    unzip \\
    git \\
    linux-headers \\
    $PHPIZE_DEPS

# Install PHP extensions (mbstring, xml, opcache are built-in on PHP 8.5)
RUN docker-php-ext-configure gd --with-freetype --with-jpeg \\
    && docker-php-ext-install -j$(nproc) \\
        pdo_mysql \\
        bcmath \\
        zip \\
        gd \\
        intl \\
        pcntl \\
        exif

# Install Redis extension
RUN pecl install redis && docker-php-ext-enable redis

# Copy custom PHP config
COPY php.ini /usr/local/etc/php/conf.d/99-custom.ini

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Install Node.js 22
RUN apk add --no-cache nodejs npm

# Create user with host UID for permission compatibility
ARG UID=1000
ARG GID=1000
RUN addgroup -g \${GID} laravel \\
    && adduser -u \${UID} -G laravel -s /bin/sh -D laravel

# Set working directory
WORKDIR /var/www/html

USER laravel

EXPOSE 9000

CMD ["php-fpm"]`,

    'nginx-dockerfile': `FROM nginx:alpine

COPY default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80`,

    'nginx-conf': `server {
    listen 80;
    server_name localhost;
    root /var/www/html/public;
    index index.php index.html;

    charset utf-8;
    client_max_body_size 64M;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location = /favicon.ico { access_log off; log_not_found off; }
    location = /robots.txt  { access_log off; log_not_found off; }

    error_page 404 /index.php;

    location ~ \\.php$ {
        fastcgi_pass app:9000;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_buffering off;
    }

    location ~ /\\.(?!well-known).* {
        deny all;
    }
}`,

    'tf-config': `# Server (DigitalOcean)
region: lon1
size: s-1vcpu-2gb
image: ubuntu-24-04-x64
droplet_name: laravel-staging

# Application
app_name: laravel
app_domain: staging.example.com
app_repo: git@github.com:Microsomes/laravel-docker-vue-starter-2026.git
app_branch: master
app_path: /var/www/laravel
deploy_user: deploy

# PHP
php_version: "8.5"

# Database
db_name: laravel
db_user: laravel
db_password: "CHANGE_ME_STRONG_PASSWORD"
db_root_password: "CHANGE_ME_ROOT_PASSWORD"

# Redis
redis_password: null

# Reverb (WebSocket)
reverb_app_id: staging-app
reverb_app_key: staging-key
reverb_app_secret: staging-secret
reverb_port: 8080

# SSL (Let's Encrypt)
ssl_enabled: true
ssl_email: admin@example.com

# Node.js
node_major_version: 22`,

    'tf-main': `terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

provider "digitalocean" {
  token = var.do_token
}

locals {
  config = yamldecode(file("\${path.module}/../config.yml"))
}

# Generate SSH key pair
resource "tls_private_key" "staging" {
  algorithm = "ED25519"
}

# Save private key locally
resource "local_file" "ssh_private_key" {
  content         = tls_private_key.staging.private_key_openssh
  filename        = "\${path.module}/../staging_key"
  file_permission = "0600"
}

# Save public key locally
resource "local_file" "ssh_public_key" {
  content         = tls_private_key.staging.public_key_openssh
  filename        = "\${path.module}/../staging_key.pub"
  file_permission = "0644"
}

# Register SSH key with DigitalOcean
resource "digitalocean_ssh_key" "staging" {
  name       = "\${local.config.droplet_name}-key"
  public_key = tls_private_key.staging.public_key_openssh
}

# Create the droplet
resource "digitalocean_droplet" "staging" {
  name     = local.config.droplet_name
  region   = local.config.region
  size     = local.config.size
  image    = local.config.image
  ssh_keys = [digitalocean_ssh_key.staging.fingerprint]

  tags = ["staging", "laravel"]
}

# Generate Ansible inventory
resource "local_file" "ansible_inventory" {
  content = templatefile("\${path.module}/inventory.tpl", {
    ip          = digitalocean_droplet.staging.ipv4_address
    private_key = "\${path.module}/../staging_key"
  })
  filename = "\${path.module}/../ansible/inventory.ini"
}`,

    'tf-variables': `variable "do_token" {
  description = "DigitalOcean API token"
  type        = string
  sensitive   = true
}`,

    'tf-outputs': `output "droplet_ip" {
  description = "Public IP of the staging droplet"
  value       = digitalocean_droplet.staging.ipv4_address
}

output "ssh_command" {
  description = "SSH into the staging server"
  value       = "ssh -i \${path.module}/../staging_key root@\${digitalocean_droplet.staging.ipv4_address}"
}

output "next_step" {
  description = "Next step after provisioning"
  value       = "Run: cd ../ansible && ansible-playbook -i inventory.ini playbook.yml --tags stage1"
}`,

    'ansible-playbook': `---
- name: Setup staging server
  hosts: staging
  become: true

  tasks:
    - name: Update apt cache
      apt:
        update_cache: true
        cache_valid_time: 3600

    - name: Install prerequisites
      apt:
        name:
          - apt-transport-https
          - ca-certificates
          - curl
          - gnupg
          - lsb-release
          - ufw
        state: present

    - name: Add Docker GPG key
      shell: |
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
        chmod a+r /etc/apt/keyrings/docker.asc
      args:
        creates: /etc/apt/keyrings/docker.asc

    - name: Add Docker repository
      shell: |
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources-list.d/docker.list
      args:
        creates: /etc/apt/sources-list.d/docker.list

    - name: Install Docker
      apt:
        name:
          - docker-ce
          - docker-ce-cli
          - containerd.io
          - docker-compose-plugin
        state: present
        update_cache: true

    - name: Start and enable Docker
      systemd:
        name: docker
        state: started
        enabled: true

    - name: Configure UFW - allow SSH
      ufw:
        rule: allow
        port: "22"

    - name: Configure UFW - allow HTTP
      ufw:
        rule: allow
        port: "80"

    - name: Configure UFW - allow HTTPS
      ufw:
        rule: allow
        port: "443"

    - name: Enable UFW
      ufw:
        state: enabled
        default: deny

    - name: Create app directory
      file:
        path: /opt/laravel
        state: directory
        mode: "0755"`,
};
</script>

<template>
    <Head title="Infrastructure Docs" />

    <div class="min-h-screen bg-zinc-950 text-zinc-100">
        <div class="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/15 via-zinc-950 to-zinc-950"></div>

        <div class="relative z-10">
            <!-- Header -->
            <header class="sticky top-0 z-40 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl">
                <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                    <div class="flex items-center gap-4">
                        <Link href="/" class="flex items-center gap-2 text-zinc-400 transition hover:text-zinc-100">
                            <ArrowLeft class="h-4 w-4" />
                            <span class="text-sm">Back</span>
                        </Link>
                        <div class="h-5 w-px bg-zinc-800"></div>
                        <div class="flex items-center gap-2">
                            <div class="flex h-7 w-7 items-center justify-center rounded-md bg-violet-600">
                                <Zap class="h-4 w-4 text-white" />
                            </div>
                            <span class="font-semibold text-zinc-100">Infrastructure Docs</span>
                        </div>
                    </div>
                </div>
            </header>

            <div class="mx-auto max-w-7xl px-6 py-10">
                <div class="flex gap-10">
                    <!-- Sidebar -->
                    <nav class="hidden w-52 shrink-0 lg:block">
                        <div class="sticky top-24 max-h-[calc(100vh-7rem)] space-y-0.5 overflow-y-auto pb-10">
                            <button
                                v-for="section in sections"
                                :key="section.id"
                                @click="scrollToSection(section.id)"
                                class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition"
                                :class="activeSection === section.id
                                    ? 'bg-violet-600/10 text-violet-400'
                                    : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'"
                            >
                                <component :is="section.icon" class="h-4 w-4 shrink-0" />
                                <span>{{ section.label }}</span>
                            </button>
                        </div>
                    </nav>

                    <!-- Content -->
                    <main class="min-w-0 flex-1 space-y-16 pb-32">

                        <!-- Overview -->
                        <section id="overview">
                            <h1 class="text-4xl font-bold tracking-tight text-zinc-100">Infrastructure</h1>
                            <p class="mt-4 max-w-3xl text-lg leading-relaxed text-zinc-400">
                                Docker Compose for local development, Terraform for provisioning a DigitalOcean staging
                                droplet, and Ansible for configuring the server.
                            </p>

                            <div class="mt-8 grid gap-3 sm:grid-cols-3">
                                <div class="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                                    <Container class="h-5 w-5 text-blue-400" />
                                    <p class="mt-2 text-2xl font-bold text-blue-400">9 services</p>
                                    <p class="text-sm text-zinc-500">Docker Compose stack</p>
                                </div>
                                <div class="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
                                    <Cloud class="h-5 w-5 text-purple-400" />
                                    <p class="mt-2 text-2xl font-bold text-purple-400">Terraform</p>
                                    <p class="text-sm text-zinc-500">DigitalOcean provisioning</p>
                                </div>
                                <div class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                                    <Server class="h-5 w-5 text-emerald-400" />
                                    <p class="mt-2 text-2xl font-bold text-emerald-400">Ansible</p>
                                    <p class="text-sm text-zinc-500">Server configuration</p>
                                </div>
                            </div>

                            <div class="mt-8 rounded-xl border border-zinc-800 bg-zinc-950 p-5 font-mono text-sm">
                                <div class="mb-3 flex items-center gap-2">
                                    <span class="h-3 w-3 rounded-full bg-red-500/60"></span>
                                    <span class="h-3 w-3 rounded-full bg-yellow-500/60"></span>
                                    <span class="h-3 w-3 rounded-full bg-green-500/60"></span>
                                    <span class="ml-2 text-xs text-zinc-600">Quick start</span>
                                </div>
                                <pre class="text-zinc-400"><span class="text-emerald-400">$</span> git clone https://github.com/Microsomes/laravel-docker-vue-starter-2026.git myapp
<span class="text-emerald-400">$</span> cd myapp && cp .env.example .env
<span class="text-emerald-400">$</span> docker compose up -d --build
<span class="text-emerald-400">$</span> docker compose exec app composer install
<span class="text-emerald-400">$</span> docker compose exec app php artisan key:generate
<span class="text-emerald-400">$</span> docker compose exec app php artisan migrate
<span class="text-emerald-400">$</span> open <span class="text-amber-300">http://localhost:9005</span></pre>
                            </div>
                        </section>

                        <!-- Docker Compose -->
                        <section id="docker">
                            <h2 class="flex items-center gap-3 text-2xl font-bold text-zinc-100">
                                <Hash class="h-5 w-5 text-violet-400" /> Docker Compose
                            </h2>
                            <p class="mt-2 text-zinc-400">
                                9 services on a shared <span class="font-mono text-sm text-violet-400">laravel</span> bridge network.
                            </p>

                            <div class="mt-6 space-y-4">
                                <div v-for="svc in [
                                    { name: 'app', container: 'laravel-app', port: '9000 (internal)', desc: 'PHP 8.5-FPM. Handles HTTP requests via Nginx proxy. Non-root user laravel (UID 1000).' },
                                    { name: 'nginx', container: 'laravel-nginx', port: '9005:80', desc: 'Alpine reverse proxy. FastCGI to app:9000. 64MB upload. SPA routing via index.php.' },
                                    { name: 'mariadb', container: 'laravel-mariadb', port: '3306 (internal)', desc: 'MariaDB 11. Healthcheck every 5s (10 retries). Persistent volume. DB: laravel.' },
                                    { name: 'redis', container: 'laravel-redis', port: '6379 (internal)', desc: 'Cache, queue, sessions, and Reverb relay. Ephemeral.' },
                                    { name: 'node', container: 'laravel-node', port: '5173:5173', desc: 'npm install && npm run dev. Vite HMR dev server.' },
                                    { name: 'reverb', container: 'laravel-reverb', port: '8080:8080', desc: 'Laravel Reverb WebSocket server. Presence channels, whisper events.' },
                                    { name: 'horizon', container: 'laravel-horizon', port: 'None', desc: 'Queue supervisor. php artisan horizon. Dashboard at /horizon.' },
                                    { name: 'scheduler', container: 'laravel-scheduler', port: 'None', desc: 'php artisan schedule:work. Runs due tasks every minute.' },
                                    { name: 'mailpit', container: 'laravel-mailpit', port: '8025 / 1025', desc: 'Email capture. Web UI at localhost:8025.' },
                                ]" :key="svc.name" class="rounded-xl border border-zinc-800/50 bg-zinc-900/40 p-5">
                                    <div class="flex flex-wrap items-center gap-3">
                                        <span class="rounded-md bg-blue-500/10 px-2.5 py-1 font-mono text-sm font-semibold text-blue-400">{{ svc.name }}</span>
                                        <span class="font-mono text-xs text-zinc-600">{{ svc.container }}</span>
                                        <span class="ml-auto rounded-full bg-zinc-800 px-2.5 py-0.5 font-mono text-xs text-zinc-400">{{ svc.port }}</span>
                                    </div>
                                    <p class="mt-3 text-sm leading-relaxed text-zinc-400">{{ svc.desc }}</p>
                                </div>
                            </div>

                            <!-- Actual file -->
                            <div class="mt-6 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                                <button @click="toggleFile('docker-compose')" class="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-zinc-900/50">
                                    <FileCode class="h-4 w-4 shrink-0 text-zinc-500" />
                                    <span class="font-mono text-sm text-violet-400">docker-compose.yml</span>
                                    <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500">yaml</span>
                                    <ChevronDown class="ml-auto h-4 w-4 text-zinc-600 transition-transform duration-200" :class="{ 'rotate-180': openFiles['docker-compose'] }" />
                                </button>
                                <div v-if="openFiles['docker-compose']" class="border-t border-zinc-800">
                                    <pre class="overflow-x-auto p-5 text-sm leading-relaxed text-zinc-400">{{ files['docker-compose'] }}</pre>
                                </div>
                            </div>
                        </section>

                        <!-- PHP Dockerfile -->
                        <section id="dockerfile">
                            <h2 class="flex items-center gap-3 text-2xl font-bold text-zinc-100">
                                <Hash class="h-5 w-5 text-violet-400" /> PHP Dockerfile
                            </h2>
                            <p class="mt-2 text-zinc-400">
                                <span class="font-mono text-sm text-violet-400">php:8.5-fpm-alpine</span> base. Reused by app, reverb, horizon, scheduler, node.
                            </p>

                            <div class="mt-6 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                                <button @click="toggleFile('php-dockerfile')" class="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-zinc-900/50">
                                    <FileCode class="h-4 w-4 shrink-0 text-zinc-500" />
                                    <span class="font-mono text-sm text-violet-400">.docker/dev/php/Dockerfile</span>
                                    <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500">dockerfile</span>
                                    <ChevronDown class="ml-auto h-4 w-4 text-zinc-600 transition-transform duration-200" :class="{ 'rotate-180': openFiles['php-dockerfile'] }" />
                                </button>
                                <div v-if="openFiles['php-dockerfile']" class="border-t border-zinc-800">
                                    <pre class="overflow-x-auto p-5 text-sm leading-relaxed text-zinc-400">{{ files['php-dockerfile'] }}</pre>
                                </div>
                            </div>
                        </section>

                        <!-- Nginx -->
                        <section id="nginx">
                            <h2 class="flex items-center gap-3 text-2xl font-bold text-zinc-100">
                                <Hash class="h-5 w-5 text-violet-400" /> Nginx Configuration
                            </h2>
                            <p class="mt-2 text-zinc-400">Alpine reverse proxy in front of PHP-FPM.</p>

                            <div class="mt-6 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                                <button @click="toggleFile('nginx-dockerfile')" class="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-zinc-900/50">
                                    <FileCode class="h-4 w-4 shrink-0 text-zinc-500" />
                                    <span class="font-mono text-sm text-violet-400">.docker/dev/nginx/Dockerfile</span>
                                    <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500">dockerfile</span>
                                    <ChevronDown class="ml-auto h-4 w-4 text-zinc-600 transition-transform duration-200" :class="{ 'rotate-180': openFiles['nginx-dockerfile'] }" />
                                </button>
                                <div v-if="openFiles['nginx-dockerfile']" class="border-t border-zinc-800">
                                    <pre class="overflow-x-auto p-5 text-sm leading-relaxed text-zinc-400">{{ files['nginx-dockerfile'] }}</pre>
                                </div>
                            </div>

                            <div class="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                                <button @click="toggleFile('nginx-conf')" class="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-zinc-900/50">
                                    <FileCode class="h-4 w-4 shrink-0 text-zinc-500" />
                                    <span class="font-mono text-sm text-violet-400">.docker/dev/nginx/default.conf</span>
                                    <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500">nginx</span>
                                    <ChevronDown class="ml-auto h-4 w-4 text-zinc-600 transition-transform duration-200" :class="{ 'rotate-180': openFiles['nginx-conf'] }" />
                                </button>
                                <div v-if="openFiles['nginx-conf']" class="border-t border-zinc-800">
                                    <pre class="overflow-x-auto p-5 text-sm leading-relaxed text-zinc-400">{{ files['nginx-conf'] }}</pre>
                                </div>
                            </div>
                        </section>

                        <!-- Environment -->
                        <section id="env">
                            <h2 class="flex items-center gap-3 text-2xl font-bold text-zinc-100">
                                <Hash class="h-5 w-5 text-violet-400" /> Environment Variables
                            </h2>
                            <p class="mt-2 text-zinc-400">
                                <span class="font-mono text-sm text-violet-400">.env.example</span> — pre-configured for Docker.
                            </p>

                            <div class="mt-6 space-y-4">
                                <div v-for="group in [
                                    { title: 'Application', items: [{ key: 'APP_URL', value: 'http://localhost:9005', note: 'Matches Nginx port' }] },
                                    { title: 'Database', items: [{ key: 'DB_HOST', value: 'mariadb', note: 'Docker service' }, { key: 'DB_DATABASE', value: 'laravel', note: '' }, { key: 'DB_USERNAME', value: 'laravel', note: '' }, { key: 'DB_PASSWORD', value: 'secret', note: 'Dev only' }] },
                                    { title: 'Redis', items: [{ key: 'REDIS_HOST', value: 'redis', note: 'Docker service' }, { key: 'CACHE_STORE', value: 'redis', note: '' }, { key: 'QUEUE_CONNECTION', value: 'redis', note: '' }] },
                                    { title: 'Reverb', items: [{ key: 'REVERB_HOST', value: 'reverb', note: 'Server-side' }, { key: 'VITE_REVERB_HOST', value: 'localhost', note: 'Browser' }, { key: 'REVERB_PORT', value: '8080', note: '' }] },
                                    { title: 'Mail', items: [{ key: 'MAIL_HOST', value: 'mailpit', note: 'Docker service' }, { key: 'MAIL_PORT', value: '1025', note: 'SMTP' }] },
                                ]" :key="group.title" class="rounded-xl border border-zinc-800/50 bg-zinc-900/40 p-5">
                                    <h4 class="mb-3 text-sm font-semibold text-zinc-200">{{ group.title }}</h4>
                                    <div class="space-y-2">
                                        <div v-for="item in group.items" :key="item.key" class="flex flex-wrap items-baseline gap-3 font-mono text-sm">
                                            <span class="text-emerald-400">{{ item.key }}</span>
                                            <span class="text-zinc-600">=</span>
                                            <span class="text-amber-300">{{ item.value }}</span>
                                            <span v-if="item.note" class="font-sans text-xs text-zinc-600">({{ item.note }})</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <!-- Terraform -->
                        <section id="terraform">
                            <h2 class="flex items-center gap-3 text-2xl font-bold text-zinc-100">
                                <Hash class="h-5 w-5 text-violet-400" /> Terraform
                            </h2>
                            <p class="mt-2 text-zinc-400">Provisions a DigitalOcean droplet and generates Ansible inventory. Config.yml is shared between Terraform and Ansible.</p>

                            <div class="mt-6 rounded-xl border border-zinc-800/50 bg-zinc-900/40 p-5">
                                <h4 class="text-sm font-semibold text-zinc-200">What it creates</h4>
                                <p class="mt-2 text-sm leading-relaxed text-zinc-400">
                                    <strong class="text-zinc-300">1.</strong> ED25519 SSH keypair (staging_key / staging_key.pub).
                                    <strong class="text-zinc-300">2.</strong> Public key registered with DigitalOcean.
                                    <strong class="text-zinc-300">3.</strong> Droplet from config.yml specs. Tagged: staging, laravel.
                                    <strong class="text-zinc-300">4.</strong> Ansible inventory.ini with droplet IP.
                                </p>
                            </div>

                            <div v-for="f in [
                                { id: 'tf-config', name: '.infra/staging/config.yml', lang: 'yaml' },
                                { id: 'tf-main', name: '.infra/staging/terraform/main.tf', lang: 'hcl' },
                                { id: 'tf-variables', name: '.infra/staging/terraform/variables.tf', lang: 'hcl' },
                                { id: 'tf-outputs', name: '.infra/staging/terraform/outputs.tf', lang: 'hcl' },
                            ]" :key="f.id" class="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                                <button @click="toggleFile(f.id)" class="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-zinc-900/50">
                                    <FileCode class="h-4 w-4 shrink-0 text-zinc-500" />
                                    <span class="font-mono text-sm text-violet-400">{{ f.name }}</span>
                                    <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500">{{ f.lang }}</span>
                                    <ChevronDown class="ml-auto h-4 w-4 text-zinc-600 transition-transform duration-200" :class="{ 'rotate-180': openFiles[f.id] }" />
                                </button>
                                <div v-if="openFiles[f.id]" class="border-t border-zinc-800">
                                    <pre class="overflow-x-auto p-5 text-sm leading-relaxed text-zinc-400">{{ files[f.id as keyof typeof files] }}</pre>
                                </div>
                            </div>
                        </section>

                        <!-- Ansible -->
                        <section id="ansible">
                            <h2 class="flex items-center gap-3 text-2xl font-bold text-zinc-100">
                                <Hash class="h-5 w-5 text-violet-400" /> Ansible
                            </h2>
                            <p class="mt-2 text-zinc-400">
                                Two-stage native setup (no Docker). Stage 1 installs PHP 8.5-FPM, Nginx, MariaDB, Redis, Node.js, Composer, configures the firewall, and generates a deploy key. Stage 2 clones the repo, builds, migrates, and sets up systemd services + SSL.
                            </p>

                            <div class="mt-6 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                                <button @click="toggleFile('ansible-playbook')" class="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-zinc-900/50">
                                    <FileCode class="h-4 w-4 shrink-0 text-zinc-500" />
                                    <span class="font-mono text-sm text-violet-400">.infra/staging/ansible/playbook.yml</span>
                                    <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500">yaml</span>
                                    <ChevronDown class="ml-auto h-4 w-4 text-zinc-600 transition-transform duration-200" :class="{ 'rotate-180': openFiles['ansible-playbook'] }" />
                                </button>
                                <div v-if="openFiles['ansible-playbook']" class="border-t border-zinc-800">
                                    <pre class="overflow-x-auto p-5 text-sm leading-relaxed text-zinc-400">{{ files['ansible-playbook'] }}</pre>
                                </div>
                            </div>
                        </section>

                        <!-- Infra Structure -->
                        <section id="structure">
                            <h2 class="flex items-center gap-3 text-2xl font-bold text-zinc-100">
                                <Hash class="h-5 w-5 text-violet-400" /> Infrastructure File Structure
                            </h2>

                            <div class="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-5 font-mono text-sm leading-relaxed text-zinc-400">
                                <pre>
<span class="text-zinc-600"># Docker</span>
docker-compose.yml                    <span class="text-zinc-600"># 9-service orchestration</span>
<span class="text-violet-400">.docker/dev/</span>
  <span class="text-violet-400">php/</span>
    Dockerfile                         <span class="text-zinc-600"># PHP 8.5-FPM + Node 22 + Composer</span>
    php.ini                            <span class="text-zinc-600"># Custom PHP settings</span>
  <span class="text-violet-400">nginx/</span>
    Dockerfile                         <span class="text-zinc-600"># Nginx Alpine</span>
    default.conf                       <span class="text-zinc-600"># Reverse proxy config</span>

<span class="text-zinc-600"># Staging</span>
<span class="text-violet-400">.infra/staging/</span>
  config.yml                           <span class="text-zinc-600"># Droplet specs</span>
  <span class="text-violet-400">terraform/</span>
    main.tf                            <span class="text-zinc-600"># SSH key + droplet + inventory</span>
    variables.tf                       <span class="text-zinc-600"># do_token (sensitive)</span>
    outputs.tf                         <span class="text-zinc-600"># droplet_ip, ssh_command</span>
    inventory.tpl                      <span class="text-zinc-600"># Ansible inventory template</span>
  <span class="text-violet-400">ansible/</span>
    playbook.yml                       <span class="text-zinc-600"># Two-stage native setup</span>
    inventory.ini                      <span class="text-zinc-600"># Auto-generated by Terraform</span>
    <span class="text-violet-400">templates/</span>
      nginx-site.conf.j2              <span class="text-zinc-600"># Nginx vhost + WebSocket proxy</span>
      php-fpm-pool.conf.j2            <span class="text-zinc-600"># PHP-FPM pool config</span>
      php.ini.j2                      <span class="text-zinc-600"># Production PHP settings</span>
      env.j2                          <span class="text-zinc-600"># .env template</span>
      laravel-horizon.service.j2      <span class="text-zinc-600"># Systemd unit for Horizon</span>
      laravel-reverb.service.j2       <span class="text-zinc-600"># Systemd unit for Reverb</span>

.env.example                           <span class="text-zinc-600"># All Docker-ready defaults</span></pre>
                            </div>
                        </section>

                        <!-- Commands -->
                        <section id="commands">
                            <h2 class="flex items-center gap-3 text-2xl font-bold text-zinc-100">
                                <Hash class="h-5 w-5 text-violet-400" /> Commands
                            </h2>

                            <h3 class="mt-8 mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">Local Development</h3>
                            <div class="space-y-3">
                                <div v-for="c in [
                                    { cmd: 'docker compose up -d --build', desc: 'Build and start all 9 services' },
                                    { cmd: 'docker compose exec app composer install', desc: 'Install PHP dependencies' },
                                    { cmd: 'docker compose exec app php artisan key:generate', desc: 'Generate app key' },
                                    { cmd: 'docker compose exec app php artisan migrate', desc: 'Run migrations' },
                                    { cmd: 'docker compose exec app php artisan migrate:fresh --seed', desc: 'Reset DB and seed' },
                                    { cmd: 'docker compose logs -f reverb', desc: 'Follow Reverb logs' },
                                    { cmd: 'docker compose logs -f horizon', desc: 'Follow Horizon logs' },
                                    { cmd: 'docker compose down', desc: 'Stop (data preserved)' },
                                    { cmd: 'docker compose down -v', desc: 'Stop and wipe volumes' },
                                ]" :key="c.cmd" class="flex flex-col gap-1 rounded-lg border border-zinc-800/30 bg-zinc-900/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                    <code class="text-sm text-emerald-400">{{ c.cmd }}</code>
                                    <span class="text-sm text-zinc-500">{{ c.desc }}</span>
                                </div>
                            </div>

                            <h3 class="mt-8 mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">Staging Deployment</h3>
                            <div class="space-y-3">
                                <div v-for="c in stagingCmds" :key="c.cmd" class="flex flex-col gap-1 rounded-lg border border-zinc-800/30 bg-zinc-900/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                    <code class="text-sm text-emerald-400">{{ c.cmd }}</code>
                                    <span class="text-sm text-zinc-500">{{ c.desc }}</span>
                                </div>
                            </div>

                            <h3 class="mt-8 mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">Useful URLs (Local)</h3>
                            <div class="space-y-3">
                                <div v-for="c in [
                                    { cmd: 'http://localhost:9005', desc: 'Application' },
                                    { cmd: 'http://localhost:9005/horizon', desc: 'Horizon dashboard' },
                                    { cmd: 'http://localhost:8025', desc: 'Mailpit email UI' },
                                    { cmd: 'ws://localhost:8080', desc: 'Reverb WebSocket' },
                                ]" :key="c.cmd" class="flex flex-col gap-1 rounded-lg border border-zinc-800/30 bg-zinc-900/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                    <code class="text-sm text-emerald-400">{{ c.cmd }}</code>
                                    <span class="text-sm text-zinc-500">{{ c.desc }}</span>
                                </div>
                            </div>
                        </section>

                    </main>
                </div>
            </div>
        </div>
    </div>
</template>
