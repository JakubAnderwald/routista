# Image Upload Feature

Upload images containing shapes to convert into navigable routes.

## Overview

Users upload an image (drawing, logo, symbol) and the system extracts the shape outline for route generation.

## User Flow

1. **Drag & drop** or click to select an image file
2. **Preview** shows the uploaded image
3. **Shape extraction** runs automatically (Canvas API + edge detection)
4. **Clear** button allows removing the image to try another

## Supported Formats

| Format | Extension | Notes |
|--------|-----------|-------|
| PNG | `.png` | Preferred - supports transparency |
| JPEG | `.jpg`, `.jpeg` | Solid backgrounds work well |
| SVG | `.svg` | Rasterized before processing |
| WebP | `.webp` | Supported |
| GIF | `.gif` | First frame used |

## Image Requirements

| Constraint | Value | Reason |
|------------|-------|--------|
| Min dimensions | 100×100 px | Enough detail for shape extraction |
| Max dimensions | 4096×4096 px | Browser memory limits |
| Max file size | 10 MB | Reasonable upload limit |

## Shape Extraction Process

1. **Load to Canvas**: Image drawn to off-screen `<canvas>`
2. **Otsu's Threshold**: Automatic foreground/background separation
3. **Inversion Detection**: Handles both dark-on-light and light-on-dark
4. **Boundary Tracing**: Moore-Neighbor algorithm traces shape edges
5. **Uniform Sampling**: 150 points sampled evenly along boundary
6. **Normalization**: Coordinates normalized to 0-1 range

### Best Practices for Input Images

- **High contrast** between shape and background
- **Solid shapes** work better than complex gradients
- **Simple outlines** produce cleaner routes
- **Avoid text** or very fine details (will be simplified)

## Implementation

### Key Files

| File | Purpose |
|------|---------|
| `src/components/ImageUpload.tsx` | Drag-drop UI, preview, file handling |
| `src/lib/imageProcessing.ts` | Shape extraction, boundary tracing, uniform sampling |
| `src/config/image.ts` | Processing constants (thresholds, limits) |

### Component API

```typescript
interface ImageUploadProps {
    onImageSelect: (file: File) => void;
    className?: string;
    testId?: string;
}
```

### Shape Extraction API

```typescript
interface ShapeExtractionResult {
    points: [number, number][];  // Normalized 0-1 coordinates
    componentCount: number;       // Number of connected components found
    isLikelyNoise: boolean;       // True if shape seems too fragmented
    threshold: number;            // Otsu threshold used
    isInverted: boolean;          // True if light-on-dark detection
}

function extractShapeFromImage(
    imageData: ImageData, 
    numPoints?: number  // Default: 150
): ShapeExtractionResult
```

## Error Handling

| Error | User Message | Cause |
|-------|--------------|-------|
| Invalid file type | "Please upload an image file" | Non-image MIME type |
| File too large | "Image must be under 10MB" | Exceeds size limit |
| Shape not found | "Couldn't detect a shape" | Low contrast or blank image |
| Too noisy | "Shape too complex" | Many small disconnected regions |

## Testing

### Automated Testing

Image upload can't use OS file pickers in automation. Use test helpers:

```javascript
// Load predefined test image
await page.click('[data-testid="test-load-star"]');

// Or load arbitrary image via data URL
window.__routistaTestHelpers.loadImageFromDataURL(dataURL, 'test.png');
```

See `docs/technical/AUTOMATED_TESTING.md` for complete protocol.

### Test IDs

| Test ID | Element |
|---------|---------|
| `create-image-upload-dropzone` | Drop zone area |
| `create-image-upload-button` | "Choose File" button |
| `create-image-upload-input` | Hidden file input |
| `create-image-upload-preview` | Preview container |
| `create-image-upload-clear` | Clear/remove button |

## Translations

Keys in `messages/*.json`:

```json
{
  "ImageUpload": {
    "title": "Upload your shape",
    "description": "...",
    "instruction": "...",
    "button": "Choose File",
    "selected": "Image selected"
  }
}
```

