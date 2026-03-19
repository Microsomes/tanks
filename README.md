# Laravel Starter Docker

Local development environment using Docker Compose with PHP-FPM, Nginx, MariaDB, Redis, Vite, and Mailpit.

## Requirements

- Docker & Docker Compose

## Getting Started

```bash
# Build and start all containers
docker compose up -d --build

# Install PHP dependencies
docker compose exec app composer install

# Generate app key
docker compose exec app php artisan key:generate

# Run migrations
docker compose exec app php artisan migrate

# (Optional) Seed the database
docker compose exec app php artisan db:seed
```

The app will be available at **http://localhost:9005**.

## Services

| Service  | URL / Port               | Description               |
|----------|--------------------------|---------------------------|
| Nginx    | http://localhost:9005     | Web server                |
| Vite HMR | http://localhost:5173    | Frontend hot reload       |
| MariaDB  | localhost:3306            | Database (user: `laravel` / pass: `secret`) |
| Redis    | localhost:6379            | Cache / sessions / queues |
| Mailpit  | http://localhost:8025     | Email testing UI          |
| Mailpit SMTP | localhost:1025        | SMTP inbox                |

## Common Commands

```bash
# Start containers
docker compose up -d

# Stop containers
docker compose down

# Rebuild containers (after Dockerfile changes)
docker compose up -d --build

# View logs
docker compose logs -f           # all services
docker compose logs -f app       # php-fpm only

# Artisan commands
docker compose exec app php artisan migrate
docker compose exec app php artisan migrate:fresh --seed
docker compose exec app php artisan tinker
docker compose exec app php artisan queue:work

# Composer
docker compose exec app composer install
docker compose exec app composer require some/package

# npm (runs inside the node container)
docker compose exec node npm install
docker compose exec node npm run build

# Database shell
docker compose exec mariadb mysql -ularavel -psecret laravel
```

## Stopping & Cleanup

```bash
# Stop containers (preserves data)
docker compose down

# Stop and remove volumes (destroys database data)
docker compose down -v
```
