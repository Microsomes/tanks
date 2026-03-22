# MCP Servers for Development

A curated list of MCP servers for full-stack development (Laravel/PHP, JavaScript, Vue.js).

---

## Quick Setup Commands

Copy-paste ready commands for `claude mcp add`.

---

## Documentation

| Server | Description | Free |
|--------|-------------|------|
| **Context7** | Fetches up-to-date, version-specific docs for any library | Yes |
| **Microsoft Learn** | Searches Microsoft documentation | Yes |

```bash
# Context7 (local)
claude mcp add context7 -- npx -y @upstash/context7-mcp@latest

# Context7 (remote — no npm needed)
claude mcp add --transport http context7 https://mcp.context7.com/mcp

# Microsoft Learn
claude mcp add --transport http microsoft-learn https://learn.microsoft.com/api/mcp
```

---

## GitHub / Git

| Server | Description | Free |
|--------|-------------|------|
| **GitHub Official** | Full GitHub access — issues, PRs, code review, CI/CD | Yes (needs PAT) |

```bash
# GitHub (HTTP — recommended)
claude mcp add-json github '{"type":"http","url":"https://api.githubcopilot.com/mcp","headers":{"Authorization":"Bearer YOUR_GITHUB_PAT"}}'

# GitHub (Docker)
claude mcp add github -e GITHUB_PERSONAL_ACCESS_TOKEN=YOUR_PAT -- docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server
```

---

## Database

| Server | Description | Free |
|--------|-------------|------|
| **DBHub** | Universal DB server — PostgreSQL, MySQL, MariaDB, SQLite, SQL Server | Yes |
| **PostgreSQL (Official)** | Direct Postgres access with natural language queries | Yes |
| **Supabase** | Supabase DB, auth, storage, migrations, type generation | Free tier |
| **Neon** | Serverless Postgres — branches, migrations, SQL | Free tier |
| **Upstash** | Redis and Kafka management | Free tier |

```bash
# DBHub (supports multiple databases)
claude mcp add dbhub -- npx -y @bytebase/dbhub@latest --transport stdio --dsn "postgresql://user:password@localhost:5432/dbname"

# PostgreSQL (Official MCP)
claude mcp add postgres -- npx -y @modelcontextprotocol/server-postgres postgresql://localhost:5432/mydb

# Supabase (remote)
claude mcp add --transport http supabase https://mcp.supabase.com/mcp

# Supabase (local)
claude mcp add supabase -- npx -y @supabase/mcp-server-supabase

# Neon (auto-configures Claude Code)
npx neonctl@latest init

# Upstash (Redis)
claude mcp add upstash -- npx -y @upstash/mcp-server@latest --email <EMAIL> --api-key <API_KEY>
```

---

## Browser Automation

| Server | Description | Free |
|--------|-------------|------|
| **Playwright** | Official Microsoft browser automation — Chrome/Firefox/WebKit | Yes |
| **Puppeteer** | Browser automation and web scraping via Puppeteer | Yes |

```bash
# Playwright (recommended)
claude mcp add playwright -- npx @playwright/mcp@latest

# Puppeteer
claude mcp add puppeteer -- npx -y @modelcontextprotocol/server-puppeteer
```

---

## Laravel / PHP

| Server | Description | Free |
|--------|-------------|------|
| **Laravel Boost** | Built-in Laravel 12+ MCP — schema, Artisan, Eloquent, code gen | Yes |
| **php-mcp/laravel** | Community SDK with deep Laravel integration (container, caching, Redis) | Yes |
| **opgginc/laravel-mcp-server** | Enterprise-grade with Streamable HTTP + SSE transport | Yes |

```bash
# Laravel Boost (Official — requires Laravel 12+)
composer require laravel/boost --dev
claude mcp add -s local -t stdio laravel-boost -- php artisan boost:mcp

# php-mcp/laravel (Community SDK)
# See: https://github.com/php-mcp/laravel

# opgginc/laravel-mcp-server (Enterprise)
# See: https://github.com/opgginc/laravel-mcp-server
```

---

## Frontend / CSS

| Server | Description | Free |
|--------|-------------|------|
| **Tailwind CSS** | Converts CSS to Tailwind utilities, generates palettes & templates | Yes |
| **Flowbite** | Flowbite UI component library context for Tailwind | Yes |

```bash
# Tailwind CSS
claude mcp add tailwindcss -- npx -y tailwindcss-mcp-server

# Flowbite
claude mcp add flowbite -- npx -y flowbite-mcp
```

> **Note:** No Vue.js-specific MCP exists. Use **Context7** for Vue docs + **Playwright** for testing.

---

## API / OpenAPI Tools

| Server | Description | Free |
|--------|-------------|------|
| **mcp-openapi** | Auto-generates MCP tools from any OpenAPI 3.x / Swagger 2.0 spec | Yes |
| **Swagger MCP** | Exposes Swagger docs to AI for API exploration | Yes |

```bash
# mcp-openapi
claude mcp add openapi -- npx -y mcp-openapi --spec https://petstore3.swagger.io/api/v3/openapi.json

# Swagger MCP
claude mcp add swagger -- npx -y @awssam/mcp-swagger https://petstore.swagger.io/v2/swagger.json
```

---

## File System

| Server | Description | Free |
|--------|-------------|------|
| **Filesystem (Official)** | Secure local file ops with directory access control | Yes |
| **Desktop Commander** | Terminal control, filesystem search, diff editing, process mgmt | Yes |

```bash
# Filesystem (Official)
claude mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem ~/Projects

# Desktop Commander
npx @wonderwhy-er/desktop-commander@latest setup
```

---

## Reasoning

| Server | Description | Free |
|--------|-------------|------|
| **Sequential Thinking** | Step-by-step reasoning with revision, branching, and refinement | Yes |

```bash
claude mcp add sequential-thinking -- npx -y @modelcontextprotocol/server-sequential-thinking
```

---

## Error Tracking

| Server | Description | Free |
|--------|-------------|------|
| **Sentry** | Search/debug errors, analyze stack traces, view issue trends | Free tier |

```bash
# Sentry (remote — recommended)
claude mcp add --transport http sentry https://mcp.sentry.dev/mcp

# Sentry (local)
claude mcp add sentry -e SENTRY_AUTH_TOKEN=your-token -e SENTRY_ORG=your-org -- npx -y @sentry/mcp-server
```

---

## Code Execution Sandbox

| Server | Description | Free |
|--------|-------------|------|
| **E2B** | Secure cloud sandboxes — run code in isolated microVMs | Free tier (100h/mo) |

```bash
claude mcp add e2b -e E2B_API_KEY=your-key -- npx -y @e2b/mcp-server
```

---

## Design Tools

| Server | Description | Free |
|--------|-------------|------|
| **Figma (Official)** | Read live design structure, generate code from designs | Yes (needs Figma account) |
| **Excalidraw** | Diagram creation and editing | Yes |

```bash
# Figma
claude mcp add --transport http figma https://mcp.figma.com/mcp

# Excalidraw
claude mcp add --transport http excalidraw https://mcp.excalidraw.com/mcp
```

---

## Deployment

| Server | Description | Free |
|--------|-------------|------|
| **Vercel** | Manage deployments, logs, projects, teams | Free tier |
| **Netlify** | Create, build, deploy, manage sites | Free tier |
| **Cloudflare Workers** | Edge deployment, KV, R2, serverless functions | Free tier |

```bash
# Vercel
claude mcp add --transport http vercel https://mcp.vercel.com

# Netlify
claude mcp add netlify -- npx -y @netlify/mcp

# Cloudflare Workers (after creating a Worker)
npx workers-mcp install:claude
```

---

## Web Search / Scraping

| Server | Description | Free |
|--------|-------------|------|
| **Firecrawl** | Web scraping with JS rendering, batch processing, markdown output | Free tier (500 credits/mo) |
| **Exa** | AI-native semantic web search and crawling | Free tier |
| **Brave Search** | Privacy-focused web and local search | Free (2,000 queries/mo) |

```bash
# Firecrawl
claude mcp add firecrawl -e FIRECRAWL_API_KEY=your-key -- npx -y firecrawl-mcp

# Exa (remote)
claude mcp add --transport http exa "https://mcp.exa.ai/mcp?tools=web_search_advanced_exa"

# Exa (local)
claude mcp add exa -e EXA_API_KEY=your-key -- npx -y exa-mcp-server

# Brave Search
claude mcp add brave-search -e BRAVE_API_KEY=your-key -- npx -y @modelcontextprotocol/server-brave-search
```

---

## Docker / DevOps

| Server | Description | Free |
|--------|-------------|------|
| **Docker MCP Toolkit** | 300+ containerized MCP servers, one-click deployment | Yes (Docker Desktop) |
| **Docker MCP (Community)** | Manage containers and compose stacks | Yes |

```bash
# Docker (community — requires uvx/Python)
claude mcp add docker -- uvx docker-mcp

# Docker MCP Toolkit: Enable via Docker Desktop UI
```

---

## Memory / Knowledge

| Server | Description | Free |
|--------|-------------|------|
| **Memory (Official)** | Knowledge graph-based persistent memory across sessions | Yes |

```bash
claude mcp add memory -- npx -y @modelcontextprotocol/server-memory
```

---

## Productivity / Collaboration

| Server | Description | Free |
|--------|-------------|------|
| **Linear** | Issue tracking and project management | Free tier |
| **Atlassian (Jira + Confluence)** | Issue tracking and documentation | Free tier |
| **Hugging Face** | ML models and datasets | Yes |

```bash
# Linear
claude mcp add --transport http linear https://mcp.linear.app/mcp

# Atlassian (Jira + Confluence)
claude mcp add --transport http atlassian https://mcp.atlassian.com/v1/mcp

# Hugging Face
claude mcp add --transport http hugging-face https://huggingface.co/mcp
```

---

## Recommended Starter Set (Laravel + Vue Full-Stack)

Priority order for immediate utility:

1. **Context7** — live docs for Laravel, Vue, Tailwind, any library
2. **Laravel Boost** — deep Laravel integration (requires Laravel 12+)
3. **Playwright** — browser testing and E2E automation
4. **GitHub** — PR reviews, issue management
5. **DBHub or Postgres** — database access from Claude
6. **Sequential Thinking** — complex architecture/debugging
7. **Sentry** — error tracking (if you use Sentry)
8. **Figma** — design-to-code (if you use Figma)
9. **Vercel or Netlify** — deployment management (pick your platform)

---

## Resources

- [Awesome MCP Servers (GitHub)](https://github.com/punkpeye/awesome-mcp-servers)
- [MCP Servers Directory](https://mcpservers.org/)
- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp)
- [Builder.io Best MCP Servers 2026](https://www.builder.io/blog/best-mcp-servers-2026)
- [Firecrawl Best MCP Servers](https://www.firecrawl.dev/blog/best-mcp-servers-for-developers)
