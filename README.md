# Routista 🏃‍♂️🎨

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=JakubAnderwald_routista&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=JakubAnderwald_routista)

Turn any shape into a real-world GPS route! Routista is a fun, free tool for runners, cyclists, and explorers who want to create GPS art or just spice up their training.

## Features ✨

- **Shape-to-Route Magic**: Upload an image (logo, symbol) or draw shapes manually on an SVG canvas. Routista finds the best matching roads.
- **Ready-to-use Shapes**: Start instantly with built-in examples like a star, heart, lightning bolt, and more.
- **Interactive Mapping**: Powered by Leaflet, select any location in the world to generate your route.
- **GPX Export**: Download your generated route as a GPX file compatible with Strava, Garmin, and other fitness apps.
- **Install as App**: Progressive Web App (PWA) support - install Routista on your mobile device for an app-like experience.
- **Privacy Focused**: All processing happens in your browser (client-side) or securely.
- **Completely Free**: No paywalls or subscriptions. Supported by coffee! ☕

## Privacy & Analytics 🔒

Routista respects your privacy:

- **Images stay on your device**: Shape extraction happens entirely in your browser. Your images are never uploaded to any server.
- **Anonymous analytics**: We use [PostHog](https://posthog.com) to collect anonymous usage data (page views, feature usage) to improve the app. No personal data is collected.
- **No tracking on localhost**: Analytics are disabled during development.
- **EU-hosted**: Analytics data is stored in PostHog's EU region for GDPR compliance.

## 📚 For Developers & AI Agents

**🚨 START HERE before working on this codebase:**

1. **Read [`docs/technical/CONTEXT_MAP.md`](docs/technical/CONTEXT_MAP.md)** - Maps all concepts to their source files
2. **Check [`docs/technical/ARCHITECTURE.md`](docs/technical/ARCHITECTURE.md)** - System architecture overview
3. **Browse [`docs/features/`](docs/features/)** - Feature-specific documentation

These documents will save you significant time by showing exactly where to find what you need.

> **Note for AI Agents**: Development rules are automatically loaded from the Antigravity configuration.

## How It Works 🛠️

1.  **Select Area**: Choose where you want to run or cycle.
2.  **Input Shape**: Upload an image, edit the extracted shape manually, or draw directly on the canvas.
3.  **Generate**: The algorithm processes the shape (simplifying points for better routes) and snaps it to real-world streets.
4.  **Export**: Get your GPX file and go!

## Tech Stack 💻

Built with modern web technologies:

-   **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
-   **UI Library**: [React 19](https://react.dev/)
-   **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
-   **Maps**: [Leaflet](https://leafletjs.com/) & [React-Leaflet](https://react-leaflet.js.org/)
-   **Caching**: [Upstash Redis](https://upstash.com/) (optional)
-   **Error Tracking**: [Sentry](https://sentry.io/) (optional)
-   **Analytics**: [PostHog](https://posthog.com/) (anonymous usage data)
-   **Testing**: [Vitest](https://vitest.dev/) & [Puppeteer](https://pptr.dev/) (E2E)
-   **Deployment**: [Vercel](https://vercel.com/)
-   **Internationalization**: [next-intl](https://next-intl-docs.vercel.app/)

## Getting Started 🚀

### Prerequisites

-   Node.js (v18+)
-   npm

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/routista.antigravity.git

# Install dependencies
npm install
```

### Development

```bash
# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

### Mobile Testing (Preview Deployments)

Push to any branch other than `main` to get a Vercel preview URL accessible from mobile:

```bash
git checkout -b feature/my-feature
git push origin feature/my-feature
# → Vercel creates: https://routista-git-feature-my-feature-*.vercel.app
```

See [`docs/technical/ARCHITECTURE.md`](docs/technical/ARCHITECTURE.md#deployment--hosting) for full deployment details.

### Testing

```bash
# Run automated tests
npm test

# Run browser automation tests (see docs/technical/AUTOMATED_TESTING.md)
npm run test:e2e
```

## Contributing 🤝

Contributions are welcome! Feel free to open issues or submit pull requests.

## Support ❤️

If you enjoy using Routista, consider [buying me a coffee](https://buymeacoffee.com/jakubanderwald)!

---

*Built with ❤️ by Jakub Anderwald*
