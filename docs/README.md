# Routista Documentation

Documentation for the Routista GPS art route generator.

## Quick Links

| I want to... | Document |
|--------------|----------|
| **Set up my dev environment** | [Dev Setup Guide](technical/DEV_SETUP.md) |
| Understand the system architecture | [Architecture](technical/ARCHITECTURE.md) |
| Find where code lives for a feature | [Context Map](technical/CONTEXT_MAP.md) |
| Debug an issue | [Debugging Guide](technical/DEBUGGING.md) |
| Write automated tests | [Automated Testing](technical/AUTOMATED_TESTING.md) |

## Feature Documentation

Detailed documentation for each user-facing feature:

| Feature | Description | Document |
|---------|-------------|----------|
| **Image Upload** | Upload shapes, format requirements, extraction process | [IMAGE_UPLOAD.md](features/IMAGE_UPLOAD.md) |
| **Area Selection** | Choose location, search, radius presets | [AREA_SELECTION.md](features/AREA_SELECTION.md) |
| **Transport Modes** | Walking, cycling, driving options | [TRANSPORT_MODES.md](features/TRANSPORT_MODES.md) |
| **Route Generation** | Shape-to-route algorithm, API integration | [ROUTE_GENERATION.md](features/ROUTE_GENERATION.md) |
| **Route Export** | GPX download, format support | [ROUTE_EXPORT.md](features/ROUTE_EXPORT.md) |
| **Social Sharing** | Share to Instagram, Facebook, Twitter | [SHARE.md](features/SHARE.md) |
| **UI Variants** | A/B test configuration | [UI_VARIANTS.md](features/UI_VARIANTS.md) |

## Technical Documentation

Architecture, infrastructure, and developer guides:

| Topic | Description | Document |
|-------|-------------|----------|
| **Architecture** | System overview, data flow, deployment | [ARCHITECTURE.md](technical/ARCHITECTURE.md) |
| **Context Map** | Concept-to-file mapping for quick navigation | [CONTEXT_MAP.md](technical/CONTEXT_MAP.md) |
| **Debugging** | Console logs, troubleshooting common issues | [DEBUGGING.md](technical/DEBUGGING.md) |
| **Automated Testing** | Browser automation, test helpers, E2E examples | [AUTOMATED_TESTING.md](technical/AUTOMATED_TESTING.md) |

## Project Overview

### What is Routista?

Routista transforms any shape or image into a real-world navigable route. Users upload an image (e.g., a heart, star, logo), select a location, and get a downloadable GPS route that traces that shape using actual roads.

### Core User Flow

```
Upload Image → Select Area → Choose Mode → Generate Route → Download GPX
```

### Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS 4
- **Maps**: React-Leaflet / Leaflet
- **Routing API**: Radar
- **Testing**: Vitest
- **Deployment**: Vercel
- **i18n**: next-intl (EN, DE, PL, DA)
- **Error Tracking**: Sentry
- **Caching**: Upstash Redis

### Key Directories

```
src/
├── app/           # Next.js App Router pages
├── components/    # React components
├── lib/           # Core logic (routing, geo, image processing)
├── config/        # Configuration modules
messages/          # i18n translation files
docs/
├── features/      # Feature documentation
├── technical/     # Technical documentation
tests/             # Test files
```

## For AI Agents

If you're an AI assistant working on this codebase:

1. **Start with** `docs/technical/CONTEXT_MAP.md` to find relevant files
2. **Read** `docs/technical/ARCHITECTURE.md` to understand data flow
3. **Check** feature docs in `docs/features/` for specific feature details
4. **For testing**, see `docs/technical/AUTOMATED_TESTING.md` - never use OS file pickers
5. **Follow** `.agent/rules/project_rules.md` for development rules

## Test Images

Test images are available in:
- `public/` - star.png, heart-v2.png, circle.png
- `public/examples/` - Additional shapes (lightning, anchor, dino, etc.)
- `docs/test images/` - Reference images for documentation

## Contributing

When adding new features:
1. Update relevant feature doc in `docs/features/`
2. Update `docs/technical/CONTEXT_MAP.md` if adding new files
3. Update `docs/technical/ARCHITECTURE.md` if changing data flow
4. Add translations to all locale files in `messages/`

