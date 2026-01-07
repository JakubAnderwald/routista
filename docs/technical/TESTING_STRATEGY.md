# Testing Strategy

This document describes the complete testing strategy for Routista, including quality gates, test pyramid layers, and detailed guidance for each testing approach.

## Overview & Quality Gates

### SonarCloud Quality Gate

**All new code must have 80% test coverage** (enforced by SonarCloud on every PR).

| Metric | Requirement |
|--------|-------------|
| Coverage on new code | >= 80% |
| Duplicated lines | < 3% |
| Maintainability rating | A |
| Reliability rating | A |
| Security rating | A |

### Test Pyramid Model

We follow the test pyramid approach, with more tests at the bottom (unit) and fewer at the top (E2E):

```
         /\
        /  \       E2E Tests (5-10 tests)
       /----\      - Critical user journeys only
      /      \     - Cursor browser or manual verification
     /--------\
    /          \   Integration/API Tests (~50 tests)
   /            \  - API route handlers
  /--------------\ - Component integration
 /                \
/------------------\ Unit Tests (~300+ tests)
                     - Pure functions in src/lib
                     - Isolated, fast, comprehensive
```

### Coverage Targets by Layer

| Code Location | Target Coverage | Priority |
|---------------|-----------------|----------|
| `src/lib/*.ts` | 90% | P0 - Critical |
| `src/app/api/**` | 80% | P0 - Critical |
| `src/components/*.tsx` | 70% | P1 - Important |
| `src/app/[locale]/**` | 50% | P2 - Nice to have |

---

## Test Pyramid Layers

### Layer 1: Unit Tests (Vitest)

**Purpose:** Test pure functions, algorithms, and business logic in isolation.

**Location:** `tests/unit/`

**Characteristics:**
- Fast execution (< 1s per test)
- No external dependencies (APIs, databases, file system)
- High coverage of edge cases
- Mock all external calls

**What to test:**
- All functions in `src/lib/*.ts`
- Data transformations
- Algorithm correctness
- Error handling paths
- Edge cases (empty arrays, null inputs, boundary values)

**Current unit test files:**

| Test File | Tests | Purpose |
|-----------|-------|---------|
| `geoUtils.test.ts` | Distance, scaling, simplification |
| `gpxGenerator.test.ts` | GPX XML generation |
| `imageProcessingCore.test.ts` | Otsu algorithm, boundary tracing |
| `radarService.test.ts` | API calls, caching, hashing |
| `rateLimit.test.ts` | Rate limiting logic |
| `routeGenerator.test.ts` | Route generation client |
| `shareImageGenerator.test.ts` | Share functionality |
| `stravaService.test.ts` | Strava integration |
| `utils.test.ts` | Utility functions |

---

### Layer 2: Component Tests (React Testing Library)

**Purpose:** Test React components with user interaction simulation.

**Location:** `tests/components/`

**Characteristics:**
- Test user behavior, not implementation details
- Mock API calls and context providers
- Use `jsdom` environment in Vitest
- Focus on critical UI paths

**What to test:**
- User interactions (clicks, typing, drag-drop)
- State changes and UI updates
- Error states and loading states
- Accessibility (ARIA attributes, keyboard navigation)

**Current component test files:**

| Test File | Coverage | Test Focus |
|-----------|----------|------------|
| `ImageUpload.test.tsx` | 97% | Dropzone, file handling, preview, drag-drop, keyboard a11y |
| `ModeSelector.test.tsx` | 100% | Mode selection, selected state styling |
| `ShareModal.test.tsx` | 82% | Platform selection, copy/download, close behavior |
| `StravaButton.test.tsx` | 81% | OAuth flow, upload, error handling, states |

**Priority components (remaining):**

| Component | Priority | Test Focus |
|-----------|----------|------------|
| `AreaSelector.tsx` | P2 | Map interactions, search |
| `ResultMap.tsx` | P2 | Route display |
| `ShapeEditor.tsx` | P2 | Shape manipulation |

**Setup (already configured):**
```bash
npm install -D @testing-library/react @testing-library/jest-dom jsdom
```

**Vitest configuration for components:**
```typescript
// vitest.config.ts
export default defineConfig({
    test: {
        environment: 'jsdom',
        setupFiles: ['./tests/setup.ts'],
    },
});
```

---

### Layer 3: API Route Tests (Vitest)

**Purpose:** Test Next.js API route handlers with mocked external services.

**Location:** `tests/api/`

**Characteristics:**
- Test request validation
- Test error responses
- Mock external APIs (Radar, Strava)
- Verify rate limiting behavior

**What to test:**

| Route | Test Focus |
|-------|------------|
| `/api/radar/directions` | Coordinate validation, chunking, error propagation |
| `/api/radar/autocomplete` | Query validation, empty results |
| `/api/strava/callback` | OAuth exchange, token storage, error handling |
| `/api/strava/upload` | GPX validation, upload flow, error states |

**Testing pattern:**
```typescript
import { POST } from '@/app/api/radar/directions/route';

describe('/api/radar/directions', () => {
    it('should return 400 for invalid coordinates', async () => {
        const request = new Request('http://localhost/api/radar/directions', {
            method: 'POST',
            body: JSON.stringify({ coordinates: [], mode: 'foot-walking' }),
        });
        
        const response = await POST(request);
        expect(response.status).toBe(400);
    });
});
```

---

### Layer 4: E2E Tests (Cursor Browser)

**Purpose:** Verify critical user journeys work end-to-end.

**Tool:** Cursor's built-in browser MCP tools (not Playwright/Puppeteer)

**Characteristics:**
- Test against running dev server
- Use `data-testid` attributes for element selection
- Use `window.__routistaTestHelpers` for image loading
- Manual execution via Cursor agent

**Available Cursor browser tools:**
- `browser_navigate` - Navigate to URL
- `browser_snapshot` - Capture accessibility tree
- `browser_click` - Click elements
- `browser_type` - Type into inputs
- `browser_wait_for` - Wait for text/element

**Critical user journeys to test:**

| Journey | Steps |
|---------|-------|
| **Create route from image** | Navigate → Load image → Select area → Choose mode → Generate → Download |
| **Create route from example** | Navigate → Select example → Generate |
| **Strava integration** | Connect → Upload route |
| **Mobile flow** | Resize viewport → Complete flow |

---

## Writing Tests by Code Type

### For `src/lib` Functions

Every function in `src/lib/*.ts` must have unit tests.

**Pattern:**
```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../../src/lib/myModule';

describe('myModule', () => {
    describe('myFunction', () => {
        it('should handle normal input', () => {
            expect(myFunction('input')).toBe('expected');
        });

        it('should handle empty input', () => {
            expect(myFunction('')).toBe('');
        });

        it('should handle null input', () => {
            // @ts-expect-error - testing null input
            expect(myFunction(null)).toBeNull();
        });

        it('should throw for invalid input', () => {
            expect(() => myFunction(-1)).toThrow('Invalid input');
        });
    });
});
```

**Checklist:**
- [ ] Normal/happy path
- [ ] Empty/null/undefined inputs
- [ ] Boundary values
- [ ] Error cases
- [ ] Edge cases specific to the function

---

### For React Components

Test user behavior, not implementation.

**Pattern:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MyComponent } from '../../src/components/MyComponent';

describe('MyComponent', () => {
    it('should render initial state', () => {
        render(<MyComponent />);
        expect(screen.getByText('Upload')).toBeInTheDocument();
    });

    it('should handle click', async () => {
        const onSubmit = vi.fn();
        render(<MyComponent onSubmit={onSubmit} />);
        
        fireEvent.click(screen.getByRole('button'));
        
        expect(onSubmit).toHaveBeenCalledOnce();
    });

    it('should show error state', () => {
        render(<MyComponent error="Something went wrong" />);
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
});
```

**Checklist:**
- [ ] Initial render
- [ ] User interactions
- [ ] Loading states
- [ ] Error states
- [ ] Accessibility

---

### For API Routes

Test the HTTP contract.

**Pattern:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { POST } from '../../src/app/api/myroute/route';

// Mock external services
vi.mock('../../src/lib/externalService', () => ({
    callExternal: vi.fn().mockResolvedValue({ data: 'mocked' }),
}));

describe('POST /api/myroute', () => {
    it('should return 200 for valid request', async () => {
        const request = new Request('http://localhost/api/myroute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ valid: 'data' }),
        });

        const response = await POST(request);
        
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toHaveProperty('result');
    });

    it('should return 400 for invalid request', async () => {
        const request = new Request('http://localhost/api/myroute', {
            method: 'POST',
            body: JSON.stringify({}),
        });

        const response = await POST(request);
        
        expect(response.status).toBe(400);
    });
});
```

**Checklist:**
- [ ] Valid request → 200
- [ ] Invalid request → 400
- [ ] Unauthorized → 401
- [ ] Server error → 500
- [ ] Rate limited → 429

---

### For E2E Scenarios (Cursor Browser)

Document test scenarios for manual execution with Cursor browser.

**Example test script:**
```markdown
## E2E Test: Create Route from Image

### Prerequisites
- Dev server running: `npm run dev`
- Navigate to: http://localhost:3000/en/create

### Steps
1. Use `browser_snapshot` to verify page loaded
2. Click `[data-testid="test-load-star"]` to load test image
3. Wait for `[data-testid="has-shape-points"]` data-value="true"
4. Click `[data-testid="upload-next-button"]`
5. Click `[data-testid="area-next-button"]`
6. Click walking mode button
7. Click `[data-testid="mode-generate-button"]`
8. Wait for `[data-testid="current-step"]` data-value="result"
9. Verify `[data-testid="has-route"]` data-value="true"

### Expected Result
- Route displayed on map
- Download button enabled
```

---

## Running Tests

### Commands

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/unit/geoUtils.test.ts

# Run tests in watch mode (development)
npx vitest

# Run tests matching pattern
npm test -- --grep "calculateDistance"
```

### Coverage Reports

Coverage reports are generated in `coverage/`:
- `coverage/index.html` - Interactive HTML report
- `coverage/lcov.info` - LCOV format (for SonarCloud)
- `coverage/coverage-summary.json` - JSON summary

### CI/CD Integration

Tests run automatically on:
- Every push (GitHub Actions)
- Every PR (with coverage upload to SonarCloud)

Pre-push checks (`npm run prebuild`):
1. `npm audit --audit-level=high`
2. `npm run lint`
3. `npm test`

---

## Browser Automation Infrastructure

The application includes built-in support for browser automation testing.

### Programmatic Image Upload

OS file picker dialogs cannot be automated. Use these alternatives:

**Method 1: Predefined test buttons**
```javascript
// Click hidden test button to load star.png
await page.click('[data-testid="test-load-star"]');
```

**Method 2: Data URL helper**
```javascript
// Load any image via data URL
window.__routistaTestHelpers.loadImageFromDataURL(dataURL, 'filename.png');
```

### Available Test Controls

#### Image Loaders

| Test ID | Image |
|---------|-------|
| `test-load-star` | star.png |
| `test-load-heart` | heart-v2.png |
| `test-load-circle` | circle.png |
| `test-load-christmas-tree` | christmas-tree.png |
| `test-load-snowflake` | snowflake.png |
| `test-load-gift-box` | gift-box.png |

#### Status Indicators

| Test ID | Values |
|---------|--------|
| `current-step` | `upload`, `area`, `mode`, `processing`, `result` |
| `has-image` | `true`, `false` |
| `has-shape-points` | `true`, `false` |
| `selected-mode` | `foot-walking`, `cycling-regular`, `driving-car`, `none` |
| `has-route` | `true`, `false` |

#### Navigation Buttons

| Test ID | Action |
|---------|--------|
| `upload-next-button` | Proceed from upload |
| `area-back-button` | Return to upload |
| `area-next-button` | Proceed from area |
| `mode-back-button` | Return to area |
| `mode-generate-button` | Generate route |
| `result-back-button` | Return to mode |
| `result-download-button` | Download GPX |

### Best Practices

**Use status indicators instead of timeouts:**
```javascript
// Good
await page.waitForFunction(() => {
    return document.querySelector('[data-testid="has-image"]')
        ?.getAttribute('data-value') === 'true';
});

// Bad
await page.waitForTimeout(3000);
```

**Check button states before clicking:**
```javascript
const button = await page.$('[data-testid="upload-next-button"]');
const isDisabled = await button.evaluate(el => el.disabled);
if (!isDisabled) {
    await button.click();
}
```

### Debugging

**Inspect hidden test controls:**
```javascript
document.querySelector('[data-testid="test-controls"]').style.display = 'block'
```

**Check current application state:**
```javascript
console.log({
    step: document.querySelector('[data-testid="current-step"]')?.getAttribute('data-value'),
    hasImage: document.querySelector('[data-testid="has-image"]')?.getAttribute('data-value'),
    hasPoints: document.querySelector('[data-testid="has-shape-points"]')?.getAttribute('data-value'),
    mode: document.querySelector('[data-testid="selected-mode"]')?.getAttribute('data-value'),
    hasRoute: document.querySelector('[data-testid="has-route"]')?.getAttribute('data-value'),
});
```

---

## Test Image Files

### Public Folder (`public/`)
- `star.png` - Star shape
- `heart-v2.png` - Heart shape
- `circle.png` - Circle shape

### Examples Folder (`public/examples/`)
- `lightning.png`, `note.png`, `anchor.png`, `dino.png`, `paw.png`
- `christmas-tree.png`, `snowflake.png`, `gift-box.png`

---

## Related Files

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Test configuration |
| `tests/unit/` | Unit test files |
| `tests/api/` | API route tests (to be added) |
| `tests/components/` | Component tests (to be added) |
| `tests/e2e/` | E2E test documentation |
| `tests/utils/nodeImageProcessing.ts` | Node.js image processing for tests |
| `coverage/` | Coverage reports |

