# Agent Development Rules

## 🚨 CRITICAL: Start Here First

**BEFORE starting ANY task, you MUST:**

1. **Read `docs/CONTEXT_MAP.md`** - This maps all concepts to their source files
2. **Check `docs/ARCHITECTURE.md`** - Understand the system architecture
3. **Review relevant docs** - Check `docs/` for task-specific guides (AUTOMATED_TESTING.md, DEBUGGING.md, etc.)

**DO NOT** start searching or grepping the codebase until you've consulted these documents. They will save you time and context window.

## 📁 Project Structure Quick Reference

- **Pages**: `src/app/[locale]/[page-name]/page.tsx` (e.g., `/en/about`, `/de/create`)
- **Translations**: `messages/{en,de,pl,da}.json` - ALL locales must be updated together
- **Components**: `src/components/` (shared) or colocated with pages
- **Core Logic**: `src/lib/` (routeGenerator.ts, geoUtils.ts, imageProcessing.ts)

## 🌍 Internationalization Rules

When modifying any user-facing text:
- **Update ALL locale files**: `messages/en.json`, `messages/de.json`, `messages/pl.json`, `messages/da.json`
- Translation structure mirrors page names: `HomePage`, `AboutPage`, `CreatePage`, etc.
- Test changes across all locales before deploying

## 🧪 Testing Requirements

Before any commit:
- Run `npm run lint` - Must pass with zero errors
- Run `npm test` - All tests must pass
- For UI changes: Test in browser across relevant locales

## 📝 Post-Work Verification Rules

After completing any code changes:
1. **Check if README.md needs updating** - Does your change affect features, setup, or usage?
2. **Update documentation** - If you added new patterns or features, update relevant docs in `docs/`
3. **Commit message format**: Use conventional commits (feat:, fix:, docs:, etc.)
4. **Link to issues**: Include "Fixes #N" in commit messages to auto-close issues

## 🚫 Never Do This

- **Never** try to interact with OS file picker dialogs - use test helpers instead (see `docs/AUTOMATED_TESTING.md`)
- **Never** commit without running linting and tests
- **Never** update only one translation file - update all locales
- **Never** skip reading CONTEXT_MAP.md at the start of a task

## 📚 Documentation Index

- `docs/CONTEXT_MAP.md` - **START HERE** - Maps concepts to files
- `docs/ARCHITECTURE.md` - System design and data flow
- `docs/AUTOMATED_TESTING.md` - How to write E2E tests
- `docs/DEBUGGING.md` - Common issues and solutions
- `docs/PRD.md` - Product requirements and features
