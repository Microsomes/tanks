# Laravel Docker Vue Starter 2026

A batteries-included Laravel 13 starter template with Docker, Vue 3, Inertia.js, Terraform staging infrastructure, and GitHub Actions CI/CD.

## What's Included

- **Laravel 13** with Inertia.js + Vue 3 + TypeScript
- **PHP 8.5 FPM** (Alpine)
- **Nginx** reverse proxy
- **MariaDB 11** database
- **Redis** for cache, queues, and broadcasting
- **Laravel Horizon** for queue management and monitoring
- **Laravel Reverb** WebSocket server for real-time broadcasting
- **Vite** dev server with HMR
- **Mailpit** for local email testing
- **Scheduler** container for scheduled tasks
- **Fortify** authentication with 2FA support
- **Terraform + Ansible** staging infrastructure (DigitalOcean)
- **GitHub Actions** CI/CD auto-deploy pipeline

## Requirements

- Docker & Docker Compose

## Getting Started

```bash
git clone git@github.com:Microsomes/laravel-docker-vue-starter-2026.git myapp
cd myapp
cp .env.example .env

# Build and start all 9 containers
docker compose up -d --build

# Install PHP dependencies
docker compose exec app composer install

# Generate app key and run migrations
docker compose exec app php artisan key:generate
docker compose exec app php artisan migrate

# Visit http://localhost:9005
```

## Services

| Service      | URL / Port                   | Description                                 |
|--------------|------------------------------|---------------------------------------------|
| Nginx        | http://localhost:9005        | Web server                                  |
| Horizon      | http://localhost:9005/horizon| Queue dashboard                             |
| Reverb       | ws://localhost:8080          | WebSocket server                            |
| Vite HMR     | http://localhost:5173        | Frontend hot reload                         |
| MariaDB      | localhost:3306               | Database (user: `laravel` / pass: `secret`) |
| Redis        | localhost:6379               | Cache / queues / broadcasting               |
| Mailpit      | http://localhost:8025        | Email testing UI                            |
| Mailpit SMTP | localhost:1025               | SMTP inbox                                  |

## Docker Containers

| Container   | Purpose                                  |
|-------------|------------------------------------------|
| `app`       | PHP-FPM process (serves the Laravel app) |
| `nginx`     | Web server, proxies to PHP-FPM           |
| `node`      | Vite dev server with HMR                 |
| `mariadb`   | MariaDB 11 database                      |
| `redis`     | Redis for cache, queues, broadcasting    |
| `horizon`   | Laravel Horizon queue worker             |
| `reverb`    | Laravel Reverb WebSocket server          |
| `scheduler` | Runs `php artisan schedule:work`         |
| `mailpit`   | Catches all outgoing email               |

## Common Commands

```bash
# Start / stop
docker compose up -d
docker compose down

# Rebuild (after Dockerfile changes)
docker compose up -d --build

# View logs
docker compose logs -f              # all services
docker compose logs -f horizon      # queue worker
docker compose logs -f reverb       # websocket server

# Artisan
docker compose exec app php artisan migrate
docker compose exec app php artisan migrate:fresh --seed
docker compose exec app php artisan tinker
docker compose exec app php artisan test

# Database shell
docker compose exec mariadb mysql -ularavel -psecret laravel
```

## Real-Time Broadcasting

Reverb + Echo are pre-configured. A `DemoNotification` event broadcasts on the public `demo` channel every 10 seconds via the scheduler, and a toast notification on the Welcome page listens for it.

The Welcome page also demonstrates:
- **Live visitor counter** via presence channels
- **Shared mouse cursors** via whisper events
- **Click-to-throw particles** visible to all visitors

## Staging Infrastructure

The `.infra/staging/` directory contains Terraform + Ansible for deploying to a DigitalOcean droplet with a native stack (no Docker on the server).

### What gets installed on the server

- PHP 8.5-FPM via ondrej PPA
- Nginx with Laravel vhost + WebSocket proxy
- MariaDB
- Redis
- Node.js 22 + Composer
- UFW firewall (22, 80, 443)
- Systemd services for Horizon and Reverb
- Cron for Laravel scheduler
- Let's Encrypt SSL (optional)

### Step 1: Configure

Edit `.infra/staging/config.yml`:

```yaml
region: lon1
size: s-2vcpu-4gb
image: ubuntu-24-04-x64
droplet_name: laravel-staging

app_domain: ""                # leave empty for IP-only, or set your domain
app_repo: git@github.com:Microsomes/laravel-docker-vue-starter-2026.git

db_password: "YOUR_STRONG_PASSWORD"
db_root_password: "YOUR_ROOT_PASSWORD"

ssl_enabled: false            # set true after pointing DNS
ssl_email: you@example.com
```

### Step 2: Provision the droplet

```bash
cd .infra/staging/terraform
terraform init

# Option A: export as env var (recommended, avoids token in shell history)
export TF_VAR_do_token=YOUR_DIGITALOCEAN_API_TOKEN
terraform apply

# Option B: pass inline
terraform apply -var="do_token=YOUR_DIGITALOCEAN_API_TOKEN"
```

### Step 3: Run Stage 1 (install packages, generate deploy key)

```bash
cd ../ansible
ansible-playbook -i inventory.ini playbook.yml --tags stage1
```

Stage 1 installs all packages and prints an SSH deploy key at the end. Copy it.

### Step 4: Add deploy key to GitHub

Go to your repo **Settings > Deploy Keys** and add the printed key.

### Step 5: Run Stage 2 (clone, build, go live)

```bash
ansible-playbook -i inventory.ini playbook.yml --tags stage2
```

This clones the repo, installs dependencies, builds frontend assets, runs migrations, sets up systemd services, and optionally obtains an SSL certificate.

### Adding a domain later

1. Point your DNS A record to the droplet IP
2. Update `config.yml`: set `app_domain` and `ssl_enabled: true`
3. Re-run: `ansible-playbook -i inventory.ini playbook.yml --tags stage2`

## GitHub Actions CI/CD

Every push to `master` automatically runs tests and deploys to staging.

### Setup

**1. Generate a deploy SSH key:**

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f gh_actions_staging -N ""
```

**2. Add the public key to the server:**

```bash
ssh -i .infra/staging/staging_key root@YOUR_SERVER_IP \
  "echo '$(cat gh_actions_staging.pub)' >> /home/deploy/.ssh/authorized_keys && \
   chmod 600 /home/deploy/.ssh/authorized_keys && \
   chown deploy:deploy /home/deploy/.ssh/authorized_keys"
```

**3. Add GitHub Secrets** at `Settings > Secrets and variables > Actions`:

| Secret                | Value                                |
|-----------------------|--------------------------------------|
| `STAGING_SSH_KEY`     | Contents of `gh_actions_staging` (private key) |
| `STAGING_SERVER_IP`   | Your droplet IP                      |
| `STAGING_DEPLOY_USER` | `deploy`                            |

**4. (Optional) Create a `staging` environment** at `Settings > Environments` for deployment protection rules.

### What the pipeline does

1. **Test** — installs deps, builds assets, runs PHPUnit
2. **Deploy** — SSHes into the server and runs:
   - `php artisan down`
   - `git pull origin master`
   - `composer install --no-dev`
   - `npm ci && npm run build`
   - `php artisan migrate --force`
   - `php artisan config:cache && route:cache && view:cache && event:cache`
   - Restarts PHP-FPM, Horizon, Reverb
   - `php artisan up`

### Security

- Secrets are never exposed in logs or to fork PRs
- Use **branch rulesets** to restrict who can push to master (Settings > Rules > Rulesets)
- Add yourself to the bypass list so you can push directly; others must use PRs

## Cleanup

Remove the demo welcome page and docs to start fresh:

```bash
docker compose exec app php artisan starter:cleanup
```

This replaces the Welcome page with a clean Hello World and removes the docs page.

## Stopping & Cleanup

```bash
# Stop containers (preserves data)
docker compose down

# Stop and remove volumes (destroys database data)
docker compose down -v

# Tear down staging server
cd .infra/staging/terraform && terraform destroy
```
