# Routista Development Rules

## 🚨 CRITICAL: Start Here First

**BEFORE starting ANY task in the Routista codebase, you MUST:**

1. **Read `docs/CONTEXT_MAP.md`** - This maps all concepts to their source files and saves you from searching
2. **Check `docs/ARCHITECTURE.md`** - Understand the system architecture and data flow  
3. **Review relevant docs** - Check `docs/` for task-specific guides (AUTOMATED_TESTING.md, DEBUGGING.md, etc.)

**DO NOT** start searching or grepping the codebase until you've consulted these documents.

## Communication style
In all interactions, be extremely concise and sacrifice grammar for the sake of concision.


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

## ✅ Pre-Deployment Checks

Before pushing any changes to GitHub, you MUST run these checks locally:

1. **Security Audit**: `npm audit --audit-level=high`
2. **Linting**: `npm run lint`
3. **Tests**: `npm test`

**CRITICAL**: If any check fails, fix issues before pushing. The CI/CD pipeline will fail otherwise.

## 📝 Post-Work Verification

After completing any coding task:

1. **Run All Tests** - Ensure full test suite passes
2. **Check README.md** - Update if changes affect features/setup/usage (max 200 lines)
3. **Update Documentation**:
   - Architecture changes → update `docs/ARCHITECTURE.md`
   - New dependencies/complex logic → update `docs/DEBUGGING.md`
   - New/modified exports in `src/lib` → add JSDoc comments

## 🧪 Testing & Automation

- **NO FILE PICKERS**: Cannot interact with OS file dialogs
- **USE HELPERS**: For image upload tests, use `window.__routistaTestHelpers.loadTestImage("star.png")`
- **CONTROLS**: Use `data-testid` attributes (e.g., `test-load-star`, `upload-next-button`)
- **REFERENCE**: See `docs/AUTOMATED_TESTING.md` for complete automation protocol

## 💻 Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS 4
- **Maps**: React-Leaflet / Leaflet
- **Testing**: Vitest
- **Deployment**: Vercel
- **Internationalization**: next-intl

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
