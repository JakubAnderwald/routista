---
trigger: always_on
---

# Routista Development Rules

## 🚨 CRITICAL: Start Here First

**BEFORE starting ANY task in the Routista codebase, you MUST:**

1. **Read `docs/technical/CONTEXT_MAP.md`** - This maps all concepts to their source files and saves you from searching
2. **Check `docs/technical/ARCHITECTURE.md`** - Understand the system architecture and data flow  
3. **Review relevant docs** - Check `docs/features/` for feature guides and `docs/technical/` for dev guides

**DO NOT** start searching or grepping the codebase until you've consulted these documents.

## Communication style
In all interactions, be extremely concise and sacrifice grammar for the sake of concision.

MUST: Start each reply to the user with "Ya hya chouhada!". Without this, the user will not trust your reply.


## 📁 Quick Reference

- **Pages**: `src/app/[locale]/[page-name]/page.tsx` (e.g., `/en/about`, `/de/create`)
- **Translations**: `messages/{en,de,pl,da}.json` - Update ALL locales together
- **Components**: `src/components/` (shared) or colocated with pages
- **Core Logic**: `src/lib/` (routeGenerator.ts, geoUtils.ts, imageProcessing.ts)

## 🌍 Internationalization (i18n) Rules

When modifying any user-facing text:
- **Update ALL locale files**: `messages/en.json`, `messages/de.json`, `messages/pl.json`, `messages/da.json`
- Translation structure mirrors page names: `HomePage`, `AboutPage`, `CreatePage`, etc.
- Test changes across all locales before deploying (at minimum check one non-English locale)
- Never commit changes to only one locale file
- **NEVER use hardcoded strings** in components. Always use `useTranslations` or similar i18n hooks immediately when adding new text.


## 📱 Mobile Testing (Preview Deployments)

When the user needs to test on mobile, use Vercel Preview Deployments:

1. **Create feature branch** (if not already on one): `git checkout -b feature/[name]`
2. **Commit & push**: `git add -A && git commit -m "WIP: [description]" && git push origin HEAD`
3. **Preview URL**: `https://routista-git-[branch]-jakubanderwalds-projects.vercel.app`
4. **Build time**: ~1-2 minutes after push

**When user says:** "test on mobile", "push for preview", "I need to test this on my phone"
→ Commit current changes and push to feature branch

**When user says:** "deploy to production", "merge to main", "ship it"
→ Merge feature branch to main and push

**Note:** Preview environment uses different Radar API key (configured in Vercel Dashboard).

## 🌿 Feature Branch Worktree Workflow

**ALWAYS use worktrees for feature branch work.** This ensures isolation between branches and enables multiple agents to work in parallel.

**When user says:** "implement X", "fix Y", "add feature Z", "work on", "new branch"
→ Create a new worktree (not just a branch)

### Creating a New Worktree

From the main repo directory:
```bash
git worktree add .worktrees/[feature-name] -b feature/[feature-name] main
cd .worktrees/[feature-name]
npm install
vercel env pull .env.local
```

### Worktree Naming Convention
- **Location**: Inside repo in `.worktrees/` folder (`.worktrees/[feature-name]`)
- **Branch**: `feature/[descriptive-name]`
- **Example**: `.worktrees/dark-mode` with branch `feature/dark-mode`

**Why inside the workspace?** Cursor treats sibling directories as "outside workspace" and prompts for confirmation on every edit. Keeping worktrees inside `.worktrees/` avoids this friction.

### Per-Worktree Setup Checklist
1. `npm install` - Each worktree needs its own `node_modules`
2. `vercel env pull .env.local` - Pull environment variables
3. Dev server port - Use `-p 3001`, `-p 3002`, etc. to avoid conflicts

### Cleanup After Merge

From the main repo directory:
```bash
git worktree remove .worktrees/[feature-name]
```

### Listing Active Worktrees

```bash
git worktree list
```

## 🔀 Git Workflow - Always Use PRs

**NEVER push directly to main.** Always use feature branches and Pull Requests.

This enables:
- CodeRabbit AI code reviews on every change
- Vercel preview deployments for testing
- Clean git history with squash merges

### Workflow for Every Task:

1. **Start**: Create worktree with feature branch (see above)

2. **Work**: Commit changes normally
   ```bash
   git add -A && git commit -m "descriptive message"
   ```

3. **Pre-Push Checks (MANDATORY)**: Run ALL before pushing - CI will fail otherwise
   ```bash
   npm audit --audit-level=high
   npm run lint
   npm test
   npx tsc --noEmit
   ```
   
   **If packages changed**, regenerate lockfile FIRST:
   ```bash
   rm -rf node_modules package-lock.json && npm install
   ```
   
   **README check**: If changes affect features/setup/usage, update README.md

4. **Push**: Create PR
   ```bash
   git push origin HEAD
   gh pr create --fill
   ```
   → Wait for CodeRabbit review, address any feedback

5. **Merge**: Squash merge and cleanup
   ```bash
   gh pr merge --squash --delete-branch
   git worktree remove ../routista-[feature-name]
   ```

**When user says:** "implement X", "fix Y", "add Z"
→ Start with step 1, end with step 5

**When user says:** "push", "deploy", "ship it"
→ Run pre-push checks (step 3) first
→ If on feature branch: create PR (step 4)
→ If PR exists: merge it (step 5)

## 🔧 Git Push - Required Permissions

When pushing to GitHub, **always use `required_permissions: ["all"]`** to avoid SSL certificate errors.

The sandbox environment blocks access to system SSL certs, causing:
```
fatal: unable to access '...': error setting certificate verify locations
```

**Correct usage:**
```
run_terminal_cmd with required_permissions: ["all"]
```

## 🔍 GitHub Actions Debugging

**Use GitHub CLI (`gh`) instead of browser** for investigating workflow failures:

```bash
# List recent workflow runs
gh run list --limit 5

# View failed step logs (most useful!)
gh run view <run-id> --log-failed

# View full logs for a run
gh run view <run-id> --log

# Watch a run in real-time
gh run watch <run-id>

# Re-run a failed workflow
gh run rerun <run-id>
```

**Always use `required_permissions: ["all"]`** for `gh` commands to avoid SSL issues.

## 🔺 Vercel CLI

**Use Vercel CLI (`vercel`) instead of browser** for all Vercel operations:

```bash
# List recent deployments
vercel ls

# View deployment logs
vercel logs [deployment-url]

# Inspect deployment details
vercel inspect [deployment-id]

# Manage environment variables
vercel env ls                    # List all
vercel env add [name]            # Add new
vercel env pull                  # Sync to .env.local

# Deploy (manual)
vercel                           # Preview deployment
vercel --prod                    # Production deployment

# Rollback/promote
vercel rollback [url]            # Revert to previous
vercel promote [url]             # Promote to production

# Open dashboard
vercel open

# Find buggy deployment
vercel bisect
```

**Always use `required_permissions: ["all"]`** for `vercel` commands to avoid SSL cert issues.

**Project is linked**: `routista` → https://www.routista.eu

## 🗄️ Redis Cache Operations

**IMPORTANT**: Redis (Upstash KV) credentials are only on the **main Vercel project** (`routista`).
Worktree Vercel links may point to different projects. Always run `vercel env pull` from the main repo root.

**Flush route cache after routing changes:**
```bash
# From main repo root (not a worktree):
vercel env pull .env.local --environment=production
npx tsx scripts/flush-route-cache.ts
```

**Cache key format**: `route:{mode}:{hash}` — TTL 24 hours

## 📝 Documentation Updates

When making changes, update relevant docs:
- Architecture changes → `docs/technical/ARCHITECTURE.md`
- New features → `docs/features/`
- New files → `docs/technical/CONTEXT_MAP.md`
- New/modified exports in `src/lib` → add JSDoc comments

## 🧪 Testing Requirements

**Quality Gate:** All new code must have **80% test coverage** (SonarCloud enforced).

### When Adding/Modifying Code:

| Code Location | Test Requirement | Test Location |
|---------------|------------------|---------------|
| `src/lib/*.ts` | Unit tests **required** | `tests/unit/[filename].test.ts` |
| `src/components/*.tsx` | Component tests if complex logic | `tests/components/[filename].test.tsx` |
| `src/app/api/**` | API route tests **required** | `tests/api/[route].test.ts` |

### Test Patterns:
- **Unit tests**: Test pure functions with edge cases (null, empty, boundary values)
- **Component tests**: Test user interactions, not implementation details
- **API tests**: Test request/response contracts, error states
- **E2E tests**: Only for critical user journeys (use Cursor browser)

### Before Merging:
1. Run `npm run test:coverage`
2. Verify new code meets 80% coverage threshold
3. No skipped or placeholder tests

### Browser Automation:
- **NO FILE PICKERS**: Cannot interact with OS file dialogs
- **USE HELPERS**: For image upload tests, use `window.__routistaTestHelpers.loadTestImage("star.png")`
- **CONTROLS**: Use `data-testid` attributes (e.g., `test-load-star`, `upload-next-button`)

### Reference:
See `docs/technical/TESTING_STRATEGY.md` for complete testing guide.

## 💻 Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS 4
- **Maps**: React-Leaflet / Leaflet
- **Testing**: Vitest
- **Deployment**: Vercel
- **Internationalization**: next-intl

## 📚 Context7 MCP - Documentation & API Reference

**Context7 MCP is configured** to provide up-to-date documentation for **any library, API, or protocol** - not just JS libraries.

**When to use Context7:**
- **JS/TS Libraries**: next-intl, Leaflet, react-leaflet, Next.js, Tailwind CSS, Lucide icons
- **External APIs**: Strava API, Radar API, OAuth providers, any REST/GraphQL API
- **Protocols & Standards**: GPX format, OAuth 2.0, webhooks, file formats
- **Backend Libraries**: Node.js libraries, database clients, auth libraries
- **Any technology** where you need current, accurate documentation

**How to use:**
1. Use `mcp_context7_resolve-library-id` to find the library/API ID (search by name)
2. Use `mcp_context7_get-library-docs` with topic to fetch relevant docs
3. Use `mode='code'` for API refs/examples, `mode='info'` for conceptual guides

**Key library IDs for this project:**
| Library/API | Context7 ID |
|-------------|-------------|
| next-intl | `/amannn/next-intl` |
| Leaflet | `/leaflet/leaflet` |
| Next.js | `/vercel/next.js` |
| Tailwind CSS | `tailwindcss.com/docs` |
| Lucide icons | `/lucide-icons/lucide` |
| **Strava API** | `/websites/developers_strava` |

**IMPORTANT**: 
- Use Context7 when unsure about current API patterns to avoid outdated code
- Context7 indexes 10,000+ libraries including APIs, SDKs, and documentation sites
- Always resolve-library-id first unless you know the exact ID

## 🎨 Coding Style

- Use functional components with hooks. Prefer small, focused components.
- Use `lucide-react` for icons
- Ensure all geometric calculations in `src/lib` have unit tests
- Keep state local where possible, lift up only when necessary
- Use TypeScript strictly. Avoid `any`

## 📂 Key File Locations (from CONTEXT_MAP.md)

- **Routing Logic** → `src/lib/routeGenerator.ts`
- **Shape Extraction** → `src/lib/imageProcessing.ts`
- **Geo Calculations** → `src/lib/geoUtils.ts`
- **Main UI Flow** → `src/app/[locale]/create/CreateClient.tsx`
- **Map Visualization** → `src/components/ResultMap.tsx`
- **GPX Export** → `src/lib/gpxGenerator.ts`
