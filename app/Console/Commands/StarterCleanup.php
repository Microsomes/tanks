<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class StarterCleanup extends Command
{
    protected $signature = 'starter:cleanup';

    protected $description = 'Remove the demo welcome page and docs, replace with a clean Hello World';

    public function handle(): int
    {
        $this->components->info('Cleaning up starter template...');

        // 1. Replace Welcome.vue with a clean Hello World page
        $welcomePath = resource_path('js/pages/Welcome.vue');
        File::put($welcomePath, $this->getCleanWelcome());
        $this->components->task('Welcome.vue replaced with Hello World');

        // 2. Remove Docs page
        $docsPath = resource_path('js/pages/Docs.vue');
        if (File::exists($docsPath)) {
            File::delete($docsPath);
            $this->components->task('Docs.vue removed');
        }

        // 3. Remove WelcomeController (presence auth for demo)
        $controllerPath = app_path('Http/Controllers/WelcomeController.php');
        if (File::exists($controllerPath)) {
            File::delete($controllerPath);
            $this->components->task('WelcomeController removed');
        }

        // 4. Clean up web.php routes
        $routesPath = base_path('routes/web.php');
        $routes = File::get($routesPath);

        // Remove WelcomeController import
        $routes = str_replace("use App\\Http\\Controllers\\WelcomeController;\n", '', $routes);

        // Remove presence-auth and docs routes
        $routes = preg_replace("/\nRoute::post\('\/welcome\/presence-auth'.*\n/", "\n", $routes);
        $routes = preg_replace("/Route::inertia\('\/docs'.*\n/", '', $routes);

        File::put($routesPath, $routes);
        $this->components->task('Routes cleaned up');

        $this->newLine();
        $this->components->info('Done! You have a clean Hello World at /');
        $this->components->info('Start building your app.');

        return self::SUCCESS;
    }

    private function getCleanWelcome(): string
    {
        return <<<'VUE'
<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { dashboard, login, register } from '@/routes';

withDefaults(
    defineProps<{
        canRegister: boolean;
    }>(),
    {
        canRegister: true,
    },
);
</script>

<template>
    <Head title="Welcome" />

    <div class="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-zinc-100">
        <header class="absolute top-6 right-6">
            <nav class="flex items-center gap-3">
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

        <h1 class="text-4xl font-bold">Hello World</h1>
        <p class="mt-4 text-zinc-400">
            Start building something great. Edit <code class="rounded bg-zinc-800 px-1.5 py-0.5 text-sm text-violet-400">resources/js/pages/Welcome.vue</code>
        </p>
    </div>
</template>
VUE;
    }
}
