# Automated Browser Testing Guide

This document describes the automated browser testing infrastructure in Routista. The application has been enhanced to support browser automation tools (like Puppeteer, Playwright, or Antigravity) without requiring interaction with OS-level file picker dialogs.

## Overview

Routista's create flow involves uploading an image, which traditionally requires OS file picker dialogs that can't be automated by browser tools. To solve this, we've added:

1. **Programmatic image loading** via hidden test buttons
2. **Test identifiers** (`data-testid` attributes) on all interactive elements
3. **Status indicators** to monitor application state during automation

## Architecture

### Programmatic Image Upload

Instead of simulating OS file picker interactions, the application provides hidden test controls that programmatically load images from the `public/` folder. This is implemented via the `loadTestImage` helper function in `CreateClient.tsx`.

**How it works:**
1. Test images are stored in `public/` directory (star.png, heart.png, circle.png)
2. Hidden buttons trigger the `loadTestImage` function
3. The function fetches the image, converts it to a File object, and processes it through the normal upload flow
4. The UI updates as if the user had uploaded the file manually

### Uploading Arbitrary Images

For bug reproduction with user-reported images, you can upload ANY image file programmatically (not just predefined ones). The application exposes global helper functions accessible via `window.__routistaTestHelpers`:

#### Method 1: Using Data URLs (Recommended)

Convert your image file to a base64 data URL and call the helper function:

```javascript
// Read image file as base64
const imageBuffer = fs.readFileSync('./user-reported-bug-image.png');
const base64Image = imageBuffer.toString('base64');
const dataURL = `data:image/png;base64,${base64Image}`;

// Or if you already have the image in browser context
const dataURL = await new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.readAsDataURL(imageFile);
});

// Upload via automation
await page.evaluate((dataURL) => {
  window.__routistaTestHelpers.loadImageFromDataURL(dataURL, 'bug-report-123.png');
}, dataURL);
```

#### Method 2: Using Blob URLs

If you have image data in memory:

```javascript
// Create a blob from image data
const blob = new Blob([imageData], { type: 'image/png' });
const blobURL = URL.createObjectURL(blob);

// Upload via automation
await page.evaluate((blobURL) => {
  window.__routistaTestHelpers.loadImageFromDataURL(blobURL, 'test-image.png');
}, blobURL);
```

#### Method 3: From URL (if image is hosted)

```javascript
// If the user-reported image is available at a URL
await page.evaluate(async (imageURL) => {
  const response = await fetch(imageURL);
  const blob = await response.blob();
  const reader = new FileReader();
  reader.onload = () => {
    window.__routistaTestHelpers.loadImageFromDataURL(reader.result, 'bug-image.png');
  };
  reader.readAsDataURL(blob);
}, 'https://example.com/user-uploaded-image.png');
```

### Predefined vs Arbitrary Images

| Use Case | Method | Best For |
|----------|--------|----------|
| **Regression Testing** | Predefined test buttons (`test-load-star`, etc.) | Automated CI/CD pipelines, consistent baseline tests |
| **Bug Reproduction** | `loadImageFromDataURL()` with arbitrary image | Debugging user-reported issues with specific images |
| **Manual Testing** | Standard file upload UI | User acceptance testing, exploratory testing |

### Test Controls Location

All test controls are located in a hidden `<div>` at the bottom of the create page (`src/app/[locale]/create/CreateClient.tsx`). They are hidden using `display: none` but remain accessible to browser automation tools.

The global test helpers are automatically exposed when the page loads and can be accessed via `window.__routistaTestHelpers`.

## Available Test Controls

### Image Loaders

Use these buttons to programmatically load test images:

| Test ID | Element ID | Purpose | Image |
|---------|------------|---------|-------|
| `test-load-star` | `test-load-star` | Load star.png | Star shape |
| `test-load-heart` | `test-load-heart` | Load heart.png | Heart shape |
| `test-load-circle` | `test-load-circle` | Load circle.png | Circle shape |

**Usage Example:**
```javascript
// Click the button to load star.png
await page.click('[data-testid="test-load-star"]');
// or using ID
await page.click('#test-load-star');
```

### Status Indicators

These hidden elements report the current application state:

| Test ID | Purpose | Values |
|---------|---------|--------|
| `current-step` | Current wizard step | `upload`, `area`, `mode`, `processing`, `result` |
| `has-image` | Whether an image is loaded | `true`, `false` |
| `has-shape-points` | Whether shape extraction succeeded | `true`, `false` |
| `selected-mode` | Currently selected transport mode | `foot-walking`, `cycling-regular`, `driving-car`, `none` |
| `has-route` | Whether a route has been generated | `true`, `false` |

**Usage Example:**
```javascript
// Wait for image processing to complete
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="has-shape-points"]');
  return el?.getAttribute('data-value') === 'true';
});

// Check current step
const step = await page.$eval('[data-testid="current-step"]', el => el.getAttribute('data-value'));
console.log('Current step:', step); // e.g., "upload"
```

## UI Element Test IDs

All interactive elements in the create flow have `data-testid` attributes for reliable selection.

### Image Upload Component

| Test ID | Element | Purpose |
|---------|---------|---------|
| `create-image-upload-dropzone` | Drag-drop area | The entire clickable upload area |
| `create-image-upload-button` | Upload button | "Choose File" button |
| `create-image-upload-input` | File input | The hidden file input element |
| `create-image-upload-preview` | Preview container | Container shown when image is loaded |
| `create-image-upload-clear` | Clear button | X button to remove uploaded image |

### Navigation Buttons

| Test ID | Element | Purpose |
|---------|---------|---------|
| `upload-next-button` | Next (Upload → Area) | Proceed after uploading image |
| `area-back-button` | Back (Area → Upload) | Return to upload step |
| `area-next-button` | Next (Area → Mode) | Proceed after selecting area |
| `mode-back-button` | Back (Mode → Area) | Return to area selection |
| `mode-generate-button` | Generate Route | Start route generation |
| `result-back-button` | Back (Result → Mode) | Return to mode selection |
| `result-download-button` | Download GPX | Download the generated route |

## Bug Reproduction Example

Here's a complete example of reproducing a user-reported bug with their specific image:

```javascript
// Scenario: User reports bug with a specific image attached to GitHub issue
// The image is available at: https://github.com/user/repo/issues/123/image.png

// 1. Navigate to create page
await page.goto('http://localhost:3000/en/create');

// 2. Load the user's problematic image
const userImageURL = 'https://github.com/user/repo/issues/123/image.png';

await page.evaluate(async (imageURL) => {
  // Fetch the image
  const response = await fetch(imageURL);
  const blob = await response.blob();
  
  // Convert to data URL
  const reader = new FileReader();
  const dataURL = await new Promise((resolve) => {
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  
  // Upload using test helper
  window.__routistaTestHelpers.loadImageFromDataURL(dataURL, 'github-issue-123.png');
}, userImageURL);

// 3. Wait for processing
await page.waitForFunction(() => {
  return document.querySelector('[data-testid="has-shape-points"]')
    ?.getAttribute('data-value') === 'true';
}, { timeout: 10000 });

// 4. Continue with the rest of the flow to reproduce the bug...
await page.click('[data-testid="upload-next-button"]');
// ... rest of the test
```

### Alternative: Using Local Files

If the user sent you an image file directly:

```javascript
const fs = require('fs');

// Read the user's image file
const imageBuffer = fs.readFileSync('./user-bug-reports/issue-123-image.png');
const base64 = imageBuffer.toString('base64');
const mimeType = 'image/png'; // or detect from file extension
const dataURL = `data:${mimeType};base64,${base64}`;

// Navigate and upload
await page.goto('http://localhost:3000/en/create');

await page.evaluate((dataURL) => {
  window.__routistaTestHelpers.loadImageFromDataURL(dataURL, 'user-issue-123.png');
}, dataURL);

// Continue testing...
```

## Complete E2E Test Example

Here's a complete example using Antigravity browser subagent (adaptable to Puppeteer/Playwright):

```javascript
// 1. Navigate to create page
await page.goto('http://localhost:3000/en/create');

// 2. Load test image programmatically
await page.click('[data-testid="test-load-star"]');

// 3. Wait for shape processing
await page.waitForFunction(() => {
  return document.querySelector('[data-testid="has-shape-points"]')
    ?.getAttribute('data-value') === 'true';
}, { timeout: 10000 });

// 4. Verify we can proceed
const nextButton = await page.$('[data-testid="upload-next-button"]');
const isDisabled = await nextButton.evaluate(el => el.disabled);
console.assert(!isDisabled, 'Next button should be enabled');

// 5. Go to area selection
await page.click('[data-testid="upload-next-button"]');

// 6. Wait for step change
await page.waitForFunction(() => {
  return document.querySelector('[data-testid="current-step"]')
    ?.getAttribute('data-value') === 'area';
});

// 7. Proceed to mode selection (area is auto-configured)
await page.click('[data-testid="area-next-button"]');

// 8. Wait for mode step
await page.waitForFunction(() => {
  return document.querySelector('[data-testid="current-step"]')
    ?.getAttribute('data-value') === 'mode';
});

// 9. Select a transport mode
// (ModeSelector has its own buttons - click one of the mode cards)
await page.click('button:has-text("Walking")'); // or use more specific selector

// 10. Generate route
await page.click('[data-testid="mode-generate-button"]');

// 11. Wait for processing to complete
await page.waitForFunction(() => {
  return document.querySelector('[data-testid="current-step"]')
    ?.getAttribute('data-value') === 'result';
}, { timeout: 60000 }); // Route generation can take time

// 12. Verify route was generated
const hasRoute = await page.$eval(
  '[data-testid="has-route"]',
  el => el.getAttribute('data-value')
);
console.assert(hasRoute === 'true', 'Route should be generated');

// 13. Download GPX
await page.click('[data-testid="result-download-button"]');
```

## Test Image Files

Test images are available in two locations:

### Public Folder (`public/`)
These images are used by the test controls:
- `star.png`
- `heart.png`
- `circle.png`

### Test Images Folder (`docs/test images/`)
Additional test images for unit testing:
- `circle.png`
- `heart.png`
- `square.png`
- `star.png`
- `triangle.png`

The public folder images are used for browser automation, while the test images folder is used for Node.js-based unit tests.

## Best Practices

### 1. Use Status Indicators
Always wait for status indicators rather than arbitrary timeouts:
```javascript
// ✅ Good
await page.waitForFunction(() => {
  return document.querySelector('[data-testid="has-image"]')?.getAttribute('data-value') === 'true';
});

// ❌ Bad
await page.waitForTimeout(3000);
```

### 2. Check Button States
Verify buttons are enabled before clicking:
```javascript
const button = await page.$('[data-testid="upload-next-button"]');
const isDisabled = await button.evaluate(el => el.disabled);
if (!isDisabled) {
  await button.click();
}
```

### 3. Handle Route Generation Timeouts
Route generation calls external APIs and may take time. Use generous timeouts:
```javascript
await page.waitForFunction(() => {
  return document.querySelector('[data-testid="current-step"]')?.getAttribute('data-value') === 'result';
}, { timeout: 60000 }); // 60 seconds
```

### 4. Use Test Images
Always use the programmatic image loaders rather than attempting to interact with file pickers:
```javascript
// ✅ Good
await page.click('[data-testid="test-load-circle"]');

// ❌ Bad - won't work with browser automation
await page.setInputFiles('[data-testid="create-image-upload-input"]', './my-image.png');
```

## Debugging Tips

### Inspect Hidden Elements
While the test controls are hidden, you can inspect them in browser DevTools:
1. Open DevTools (F12)
2. Console tab
3. Run: `document.querySelector('[data-testid="test-controls"]').style.display = 'block'`

### Check Current State
You can query the application state at any time:
```javascript
// In browser console or automation script
console.log({
  step: document.querySelector('[data-testid="current-step"]')?.getAttribute('data-value'),
  hasImage: document.querySelector('[data-testid="has-image"]')?.getAttribute('data-value'),
  hasPoints: document.querySelector('[data-testid="has-shape-points"]')?.getAttribute('data-value'),
  mode: document.querySelector('[data-testid="selected-mode"]')?.getAttribute('data-value'),
  hasRoute: document.querySelector('[data-testid="has-route"]')?.getAttribute('data-value'),
});
```

## Extending Test Coverage

To add support for more test images:

1. **Add image to public folder**: Copy image to `public/my-image.png`
2. **Add test button**: Edit `CreateClient.tsx`, add a new button in the test controls section:
   ```tsx
   <button 
     id="test-load-myimage" 
     data-testid="test-load-myimage" 
     onClick={() => loadTestImage("my-image.png")}
   >
     Load My Image
   </button>
   ```
3. **Document it**: Update this file with the new test button details

## Related Files

- [`src/components/ImageUpload.tsx`](file:///Users/jakubanderwald/code/routista.antigravity/src/components/ImageUpload.tsx) - Image upload component with test IDs
- [`src/app/[locale]/create/CreateClient.tsx`](file:///Users/jakubanderwald/code/routista.antigravity/src/app/[locale]/create/CreateClient.tsx) - Main create flow with test controls
- [`tests/routeAccuracy.test.ts`](file:///Users/jakubanderwald/code/routista.antigravity/tests/routeAccuracy.test.ts) - Node.js unit tests example
- [`docs/ARCHITECTURE.md`](file:///Users/jakubanderwald/code/routista.antigravity/docs/ARCHITECTURE.md) - System architecture overview
