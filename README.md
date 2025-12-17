# Routista 🏃‍♂️🎨

Turn any shape into a real-world GPS route! Routista is a fun, free tool for runners, cyclists, and explorers who want to create GPS art or just spice up their training.

## Features ✨

- **Shape-to-Route Magic**: Upload an image (logo, symbol) or draw shapes manually on an SVG canvas. Routista finds the best matching roads.
- **Ready-to-use Shapes**: Start instantly with built-in examples like a star, heart, lightning bolt, and more.
- **Interactive Mapping**: Powered by Leaflet, select any location in the world to generate your route.
- **GPX Export**: Download your generated route as a GPX file compatible with Strava, Garmin, and other fitness apps.
- **Install as App**: Progressive Web App (PWA) support - install Routista on your mobile device for an app-like experience.
- **Privacy Focused**: All processing happens in your browser (client-side) or securely.
- **Completely Free**: No paywalls or subscriptions. Supported by coffee! ☕

## 📚 For Developers & AI Agents

**🚨 START HERE before working on this codebase:**

1. **Read [`docs/CONTEXT_MAP.md`](docs/CONTEXT_MAP.md)** - Maps all concepts to their source files
2. **Check [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** - System architecture overview

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

### Testing

```bash
# Run automated tests
npm test

# Run browser automation tests (see docs/AUTOMATED_TESTING.md)
npm run test:e2e
```

## Contributing 🤝

Contributions are welcome! Feel free to open issues or submit pull requests.

## Support ❤️

If you enjoy using Routista, consider [buying me a coffee](https://buymeacoffee.com/jakubanderwald)!

---

*Built with ❤️ by Jakub Anderwald*
