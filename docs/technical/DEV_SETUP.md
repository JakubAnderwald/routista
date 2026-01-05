# Development Environment Setup

Complete guide to set up your local development environment for Routista.

## For AI Agents

If you're an AI agent setting up this codebase:

1. **Use `required_permissions: ["all"]`** for Vercel/git commands (SSL cert issues)
2. **Use `required_permissions: ["network"]`** for `npm install`, `brew install`
3. **Interactive commands are OK** - User will complete login prompts when needed
4. **Check terminals folder** before starting dev server (may already be running)
5. **Follow Quick Start steps** in order - they work for agents too

For full agent rules, see `.agent/rules/project_rules.md`.

## Prerequisites

- **Node.js** v18+ ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)
- **Git** ([Download](https://git-scm.com/))
- **Vercel CLI** (recommended): `brew install vercel-cli`

Verify installation:
```bash
node --version    # Should show v18.x or higher
npm --version     # Should show 9.x or higher
git --version
vercel --version  # Optional, for pulling env vars
```

## Quick Start (5 minutes)

### 1. Clone the Repository

```bash
git clone https://github.com/jakubanderwald/routista.git
cd routista
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Pull Environment Variables from Vercel

```bash
vercel login
vercel link    # Select "routista" project
vercel env pull .env.local
```

This creates `.env.local` with all required API keys.

> **No Vercel access?** See "Getting API Keys" section below to create keys manually.

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Working with Git Worktrees

For feature branch development, use git worktrees to maintain isolated environments. This enables parallel work on multiple features and supports multi-agent development.

### Creating a Worktree for a New Feature

From your main repo directory:

```bash
# Create worktree with new feature branch
git worktree add ../routista-[feature-name] -b feature/[feature-name] main

# Navigate to worktree and set up
cd ../routista-[feature-name]
npm install
vercel env pull .env.local

# Start dev server (use different port if main is running)
npm run dev -- -p 3001
```

### Naming Convention

- **Worktree location**: `../routista-[feature-name]` (sibling to main repo)
- **Branch name**: `feature/[descriptive-name]`
- **Example**: `../routista-dark-mode` → `feature/dark-mode`

### Managing Worktrees

```bash
# List all worktrees
git worktree list

# Remove a worktree (after PR merged)
git worktree remove ../routista-[feature-name]

# Prune stale worktree references
git worktree prune
```

### Why Worktrees?

- **Isolation**: Each worktree has its own `node_modules`, `.next` cache, `.env.local`
- **Parallel work**: Run multiple dev servers on different ports
- **Multi-agent**: Multiple AI agents can work on different features simultaneously
- **Quick switching**: No need to stash/commit changes when switching features

## Environment Variables

### Required for Full Functionality

| Variable | Required | Purpose | How to Get |
|----------|----------|---------|------------|
| `NEXT_PUBLIC_RADAR_LIVE_PK` | Yes* | Radar API key (production) | [Radar Dashboard](https://radar.com/dashboard) |
| `NEXT_PUBLIC_RADAR_TEST_PK` | Yes* | Radar API key (development) | Same as above |

*At least one Radar key needed for real routing. App works without it using mock data.

### Optional Services

| Variable | Purpose | How to Get |
|----------|---------|------------|
| `KV_REST_API_URL` | Upstash Redis URL (caching) | [Upstash Console](https://console.upstash.com/) |
| `KV_REST_API_TOKEN` | Upstash Redis token | Same as above |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error tracking | [Sentry Dashboard](https://sentry.io/) |
| `SENTRY_AUTH_TOKEN` | Sentry source maps | Same as above |
| `SENTRY_ORG` | Sentry organization | Same as above |
| `SENTRY_PROJECT` | Sentry project name | Same as above |

### Strava Integration (Optional)

| Variable | Purpose | How to Get |
|----------|---------|------------|
| `STRAVA_CLIENT_ID` | Strava app ID (server) | [Strava API Settings](https://www.strava.com/settings/api) |
| `STRAVA_CLIENT_SECRET` | Strava app secret | Same as above |
| `NEXT_PUBLIC_STRAVA_CLIENT_ID` | Strava app ID (client) | Same as above |
| `NEXT_PUBLIC_STRAVA_REDIRECT_URI` | OAuth callback URL | Your app URL + `/api/strava/callback` |

### Getting `.env.local`

**Recommended:** Pull from Vercel (contains all production keys):

```bash
vercel env pull .env.local
```

This creates `.env.local` with all configured variables. Done!

### Reference: `.env.local` Structure

For reference only (use `vercel env pull` instead of manually creating):

```bash
# Radar API (required for real routing)
NEXT_PUBLIC_RADAR_LIVE_PK=prj_live_pk_...
NEXT_PUBLIC_RADAR_TEST_PK=prj_test_pk_...

# Upstash Redis (optional - enables route caching)
KV_REST_API_URL=https://....upstash.io
KV_REST_API_TOKEN=...

# Sentry (optional - enables error tracking)
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...

# Strava (optional - enables direct upload)
STRAVA_CLIENT_ID=...
NEXT_PUBLIC_STRAVA_CLIENT_ID=...
NEXT_PUBLIC_STRAVA_REDIRECT_URI=http://localhost:3000/api/strava/callback
```

## Getting API Keys

> **Note:** If you have Vercel access, all keys are already configured. Use `vercel env pull .env.local` instead of creating new accounts.

### Radar (Routing API)

1. Sign up at [radar.com](https://radar.com/)
2. Create a new project
3. Go to **Settings** → **Keys**
4. Copy the **Test Publishable Key** for development
5. Copy the **Live Publishable Key** for production

### Upstash Redis (Optional Caching)

1. Sign up at [upstash.com](https://upstash.com/)
2. Create a new Redis database
3. Go to **Details** → **REST API**
4. Copy **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN**

### Sentry (Optional Error Tracking)

1. Sign up at [sentry.io](https://sentry.io/)
2. Create a new project (Next.js)
3. Copy the DSN from project settings
4. Generate auth token: **Settings** → **Auth Tokens**

### Strava (Optional Direct Upload)

1. Go to [strava.com/settings/api](https://www.strava.com/settings/api)
2. Create an application
3. Set callback domain to `localhost` for development
4. Copy Client ID and Client Secret

## NPM Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server with Turbopack |
| `npm run build` | Production build (runs lint + tests first) |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest tests |
| `npm start` | Start production server |

## IDE Setup (Recommended)

### VS Code / Cursor

Recommended extensions:
- **ESLint** - Linting
- **Tailwind CSS IntelliSense** - CSS autocomplete
- **Pretty TypeScript Errors** - Better error messages
- **Error Lens** - Inline error display

### Settings

Add to `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

## Troubleshooting

### "Module not found" errors after clone

```bash
rm -rf node_modules package-lock.json
npm install
```

### Port 3000 already in use

```bash
# Find and kill the process
lsof -i :3000
kill -9 <PID>

# Or use a different port
npm run dev -- -p 3001
```

### Radar API returns errors

1. Check your API key is valid in [Radar Dashboard](https://radar.com/dashboard)
2. Verify the key starts with `prj_test_pk_` (dev) or `prj_live_pk_` (prod)
3. Check rate limits in dashboard (free tier: 100k requests/month)

### Routes show as straight lines (not following roads)

This means mock mode is active because:
- No Radar API key configured
- Invalid API key
- API rate limits exceeded

### "Cannot connect to Redis" warnings

Safe to ignore - app works without Redis (caching disabled). To fix:
1. Set up Upstash account
2. Add `KV_REST_API_URL` and `KV_REST_API_TOKEN` to `.env.local`

### Build fails with security audit

```bash
# Check what's failing
npm audit

# Fix if possible
npm audit fix

# Skip audit for dev (not recommended for production)
npm run dev
```

### TypeScript errors in IDE but build works

```bash
# Restart TypeScript server in VS Code
Cmd+Shift+P → "TypeScript: Restart TS Server"
```

## Running Tests

```bash
# Unit tests
npm test

# Watch mode
npm test -- --watch

# E2E tests (requires browser)
npm run test:e2e
```

## Pre-Push Checks

Before pushing, run all checks:

```bash
npm audit --audit-level=high
npm run lint
npm test
npx tsc --noEmit
```

See `.agent/rules/project_rules.md` for the complete workflow.

## Next Steps

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for system overview
- Check [CONTEXT_MAP.md](./CONTEXT_MAP.md) to find relevant files
- See [DEBUGGING.md](./DEBUGGING.md) for console logging details
- Explore [features/](../features/) for feature documentation

