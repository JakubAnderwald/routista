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

**CRITICAL**: If any check fails, fix issues before pushing. The CI/CD pipeline will fail otherwise.

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

## 📚 Context7 MCP - Library Documentation

**Context7 MCP is configured** to provide up-to-date documentation for libraries used in this project.

**When to use Context7:**
- Working with **next-intl** (i18n patterns, useTranslations, App Router setup)
- Working with **Leaflet/react-leaflet** (map components, markers, events)
- Working with **Next.js 16** (App Router, server components, middleware)
- Working with **Tailwind CSS 4** (new utility classes, config syntax)
- Working with **Lucide icons** (icon names, usage patterns)

**How to use:**
1. Use `mcp_context7_resolve-library-id` to find the library ID
2. Use `mcp_context7_get-library-docs` with topic to fetch relevant docs
3. Key library IDs:
   - next-intl: `/amannn/next-intl`
   - Leaflet: `/leaflet/leaflet`
   - Next.js: `/vercel/next.js`
   - Tailwind: `tailwindcss.com/docs`
   - Lucide: `/lucide-icons/lucide`

**IMPORTANT**: Use Context7 when unsure about current API patterns to avoid outdated code.

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
