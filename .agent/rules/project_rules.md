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

## ✅ Pre-Deployment Checks

Before pushing any changes to GitHub, you MUST run these checks locally:

1. **Security Audit**: `npm audit --audit-level=high`
2. **Linting**: `npm run lint`
3. **Tests**: `npm test`
4. **TypeScript**: `npx tsc --noEmit` (catches type errors in ALL .ts files including configs)
5. **Lockfile sync** (if packages changed): `rm -rf node_modules package-lock.json && npm install`

**CRITICAL**: If any check fails, fix issues before pushing. The CI/CD pipeline will fail otherwise.

**Why TypeScript check is needed**: `npm test` and `npm run lint` do NOT type-check config files like `vitest.config.ts`. Only `next build` or `tsc` will catch type errors in these files.

### After Adding/Removing Packages

When you run `npm install <package>` or modify `package.json`:
1. Regenerate lockfile: `rm -rf node_modules package-lock.json && npm install`
2. Commit both `package.json` AND `package-lock.json` together
3. This ensures CI's `npm ci` won't fail due to npm version differences

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
git worktree add ../routista-[feature-name] -b feature/[feature-name] main
cd ../routista-[feature-name]
npm install
vercel env pull .env.local
```

### Worktree Naming Convention
- **Location**: Sibling to main repo (`../routista-[feature-name]`)
- **Branch**: `feature/[descriptive-name]`
- **Example**: `../routista-dark-mode` with branch `feature/dark-mode`

### Per-Worktree Setup Checklist
1. `npm install` - Each worktree needs its own `node_modules`
2. `vercel env pull .env.local` - Pull environment variables
3. Dev server port - Use `-p 3001`, `-p 3002`, etc. to avoid conflicts

### Working in a Worktree

Once set up, follow the normal PR workflow:
```bash
# Work and commit
git add -A && git commit -m "descriptive message"

# Push and create PR
git push origin HEAD
gh pr create --fill

# After PR merged, cleanup
gh pr merge --squash --delete-branch
```

### Cleanup After Merge

From the main repo directory:
```bash
git worktree remove ../routista-[feature-name]
```

### Listing Active Worktrees

```bash
git worktree list
```

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

## 📝 Post-Work Verification

After completing any coding task:

1. **Run All Tests** - Ensure full test suite passes
2. **Check README.md** - Update if changes affect features/setup/usage (max 200 lines)
3. **Update Documentation**:
   - Architecture changes → update `docs/technical/ARCHITECTURE.md`
   - New dependencies/complex logic → update `docs/technical/DEBUGGING.md`
   - New features → add/update doc in `docs/features/`
   - New files → update `docs/technical/CONTEXT_MAP.md`
   - New/modified exports in `src/lib` → add JSDoc comments

## 🧪 Testing & Automation

- **NO FILE PICKERS**: Cannot interact with OS file dialogs
- **USE HELPERS**: For image upload tests, use `window.__routistaTestHelpers.loadTestImage("star.png")`
- **CONTROLS**: Use `data-testid` attributes (e.g., `test-load-star`, `upload-next-button`)
- **REFERENCE**: See `docs/technical/AUTOMATED_TESTING.md` for complete automation protocol

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
