# Product Requirements Document: Routista.eu - Shape-to-Route Matching System

## Introduction/Overview

Routista.eu is a web application that enables users to transform any shape or image into a real-world navigable route. Users upload an image of a shape (e.g., a heart, star, animal silhouette, or any custom drawing), specify a geographic area, and the application finds roads in the actual world map that best match that shape. The resulting route can be downloaded in standard GPS formats and navigated using bikes, cars, or on foot, allowing users to "draw" the shape in the real world through their movement.

**Problem Solved:** Currently, creating GPS art (drawing shapes with GPS tracking) requires manual route planning or specialized local knowledge. This is time-consuming and often results in imperfect shapes. Routista automates this process, making GPS art accessible to anyone, anywhere.

**Goal:** Create an MVP that allows users to upload a shape image, select a geographic area, and download a navigable route file that matches the shape as closely as possible.

## Goals

1. Enable users to upload any shape image and convert it to a navigable real-world route
2. Provide flexible area selection through both map interface and manual location entry
3. Generate routes optimized for specific transportation modes (walking, cycling, driving)
4. Export routes in multiple industry-standard formats (GPX, KML, TCX)
5. Ensure all generated routes are safe, connected, and practically navigable
6. Deliver a simple, intuitive user experience from upload to download

## User Stories

**As a fitness enthusiast**, I want to upload a heart shape and get a cycling route that traces a heart in my city, so I can create GPS art during my workout and share it on social media.

**As a casual runner**, I want to select my neighborhood on a map and get a running route that matches my uploaded logo shape, so I can create interesting GPS traces instead of running the same boring routes.

**As an adventure cyclist**, I want to upload a complex shape and specify my city center as the search area, so I can explore new streets while creating an artistic GPS trace.

**As a tourist**, I want to walk a route shaped like the country's flag in the city I'm visiting, so I can combine sightseeing with creating a memorable GPS souvenir.

**As a car driver**, I want to drive across a city or off-road trails following a route shaped like the my car's silhouette, so I can combine sightseeing with creating a memorable GPS souvenir for my car association's club.

## Functional Requirements

### 1. Image Upload
1.1. The system must allow users to upload an image file containing a shape (PNG, JPG, JPEG, SVG formats supported)
1.2. The system must validate uploaded images (max file size: 10MB, min dimensions: 100x100px, max dimensions: 4096x4096px)
1.3. The system must display a preview of the uploaded image before processing
1.4. The system must extract the shape outline from the uploaded image, handling both solid shapes and line drawings
1.5. The system must allow users to retry/replace the uploaded image before proceeding

### 2. Area Selection
2.1. The system must provide two methods for users to specify the search area:
   - **Method A (Map Interface):** Interactive map where users can draw a boundary or select a predefined region
   - **Method B (Manual Entry):** Text input for location (city name, address, or coordinates) with adjustable search radius
2.2. The system must display the selected area visually on a map for confirmation
2.3. The system must validate that the selected area is not too large (max: 50km radius or equivalent area) to ensure reasonable processing time
2.4. The system must validate that the selected area is not too small (min: 1km radius) to ensure sufficient roads for matching
2.5. The system must allow users to modify the selected area before processing

### 3. Transportation Mode Selection
3.1. The system must allow users to select one of three transportation modes: Walking, Cycling, or Driving
3.2. The system must apply mode-specific routing rules:
   - **Walking:** Prioritize sidewalks, pedestrian paths, and pedestrian-accessible roads
   - **Cycling:** Prioritize bike lanes, bike paths, and bike-friendly roads
   - **Driving:** Use car-accessible roads only, respect one-way streets and driving restrictions
3.3. The system must display the selected transportation mode in the final route preview

### 4. Shape Matching Algorithm
4.1. The system must analyze the road network within the selected area
4.2. The system must normalize/scale the input shape to fit appropriately within the selected area
4.3. The system must prioritize route navigability (connected paths, no illegal turns, safe passages)
4.4. The system must, given navigability constraints, maximize shape similarity to the input image
4.5. The system must provide a clear starting and end points for the route
4.6. The system must calculate and display the total distance of the matched route

### 5. Route Preview
5.1. The system must display the matched route overlaid on a map
5.2. The system must show the original shape alongside the matched route for comparison
5.3. The system must display route metadata: distance, estimated time, transportation mode, starting point
5.4. The system must mark the starting point clearly on the map

### 6. Route Export
6.1. The system must allow users to download the route in the following formats:
   - GPX (GPS Exchange Format)
   - KML (Keyhole Markup Language)
6.2. The system must include proper metadata in exported files (route name, timestamp, transportation mode)
6.3. The system must name exported files descriptively (e.g., "routista-heart-shape-cycling-2025-11-09.gpx")
6.4. The system must validate that exported files are valid and compatible with standard GPS devices and apps

### 7. Error Handling & User Feedback
7.1. The system must display clear error messages for invalid image uploads
7.2. The system must display informative messages if no suitable match can be found in the selected area
7.3. The system must show loading indicators during processing (image analysis, route matching)
7.4. The system must provide helpful suggestions when matching fails (e.g., "Try a larger area" or "Try a simpler shape")

## Non-Goals (Out of Scope for MVP)

- **User accounts/authentication:** MVP is fully anonymous, no login required
- **Saving routes to profile:** No persistence of user data or route history
- **Social sharing features:** No built-in sharing to social media
- **Route customization:** No manual editing of generated routes
- **Multi-shape/complex compositions:** Only single shape matching per request
- **Elevation/terrain preferences:** No consideration of hills or terrain difficulty
- **Real-time navigation:** No turn-by-turn navigation within the app
- **Mobile native apps:** Web-only for MVP
- **Route rating/quality scoring:** No quantitative shape match percentage displayed
- **Community features:** No sharing, rating, or browsing of other users' routes
- **Payment/monetization:** Fully free for MVP

## Design Considerations

### User Interface Flow
1. **Landing Page:** Hero section explaining the concept with example GPS art images, clear CTA "Create Your Route"
2. **Upload Page:** Drag-and-drop area or file picker with image preview
3. **Area Selection Page:** Split view showing map interface on left, manual entry form on right
4. **Mode Selection:** Simple card-based selection with icons (walking, cycling, driving)
5. **Processing Screen:** Engaging loading animation with progress messages
6. **Results Page:** Side-by-side comparison of original shape and matched route, download buttons for each format
7. **Responsive Design:** Must work well on desktop and tablet (mobile experience can be basic)

### Visual Design
- Modern, clean interface with outdoor/adventure theme
- Use map as a central visual element throughout
- Clear visual hierarchy and prominent CTAs
- Use color coding for transportation modes (e.g., green for cycling, blue for walking, orange for driving)

### UX Priorities
- Minimize steps from upload to download (streamlined flow)
- Provide clear feedback at each step
- Make error recovery easy (back buttons, try again options)
- Set expectations about processing time (e.g., "This may take 30-60 seconds")

## Technical Considerations

### Frontend
- Modern JavaScript framework (React, Vue, or similar) for interactive UI
- Map library: Leaflet.js or Mapbox GL JS for interactive maps and area selection
- Image processing: Client-side or server-side shape extraction (consider Canvas API or dedicated library)

### Backend
- Road network data: OpenStreetMap (via Overpass API or local extract)
- Routing engine: GraphHopper, OSRM, or Valhalla for generating navigable paths
- Shape matching algorithm: Custom algorithm combining graph theory, optimization (e.g., genetic algorithms, simulated annealing), and geometric matching
- File generation: Libraries for GPX/KML creation (ensure valid XML output)

### Performance
- Image processing should complete in <5 seconds
- Route matching should complete in <60 seconds for typical requests
- Consider queuing system if matching takes longer for complex shapes/large areas

### Scalability
- MVP can use synchronous processing
- Plan for async job queue if user base grows (store job status, poll for completion)

### Data & Privacy
- **Images**: Processed client-side only (Canvas API). Images never leave the user's device.
- **Route coordinates**: Sent to server API routes, forwarded to Radar API for routing.
- **Route caching**: Generated routes cached in Redis for 24 hours (keyed by coordinates hash) to reduce API load.
- **Rate limiting**: IP addresses stored temporarily (~60 seconds) using sliding window algorithm.
- **Error tracking**: Errors logged to Sentry for debugging (includes endpoint context, no user-identifiable data except IP on rate limit blocks).
- **No user accounts**: Fully anonymous, no login or registration required.

## Success Metrics

### MVP Launch Metrics
1. **User Engagement:** 50+ unique users create routes in first month
2. **Completion Rate:** >60% of users who upload an image complete the full flow and download a route
3. **Technical Performance:** 95% of route matching requests complete successfully within 90 seconds
4. **Route Quality (Qualitative):** Gather user feedback on route navigability and shape accuracy through informal channels

### Post-MVP Metrics to Consider
- Route download rate per upload
- Return user rate
- Average processing time
- Error rate and error type distribution
- Most popular shapes/types of images uploaded
- Geographic distribution of route requests

## Open Questions

1. **Shape Complexity Limits:** We should not limit the complexity of shapes (e.g., max number of corners/curves), rather handle complexity gracefully with timeout mechanisms.

2. **Starting Point Selection:** In MVP the app should the algorithm automatically determine the optimal starting point

3. **Shape Orientation:** The algorithm should try multiple orientations automatically to find the best match

4. **Road Network Data:** We should use a hosted OSM service called OpenRouteService

5. **Processing Timeout:** The timeout should be 120 seconds if a match cannot be found within a reasonable time

6. **Multiple Match Options:** If the algorithm finds several reasonable matches, we should show the single best one.



## Implementation Phases

### Phase 1: Core MVP (Priority)
- Image upload and validation
- Simple area selection (manual entry with radius)
- Transportation mode selection
- Basic shape matching with navigability priority
- GPX export only
- Basic error handling

### Phase 2: Enhanced MVP
- Map-based area selection (interactive boundary drawing)
- KML and TCX export formats
- Improved shape matching algorithm
- Better loading experience and progress indicators

### Phase 3: Post-MVP (Future)
- Polish and refinements based on user feedback
- Performance optimization
- Consider advanced features from "Non-Goals" list

## Appendix

### Example Use Cases
- **Birthday Surprise:** Create a heart-shaped route for a romantic bike ride
- **Company Event:** Create a route shaped like a company logo for a team building run
- **Tourist Activity:** Walk a route shaped like local landmarks or symbols
- **Fitness Challenge:** Create interesting shaped routes for workout variety
- **GPS Art Community:** Share screenshots of completed GPS traces on social media

### Competitive Analysis
- **Strava Route Builder:** Manual route creation, no shape matching
- **Wandrer.earth:** Route exploration, no shape creation
- **GPS Art Apps:** Limited area coverage, manual drawing required
- **Routista's Unique Value:** Automated shape-to-route matching for any location globally

---

*Document Version: 1.0*  
*Date: November 9, 2025*  
*Status: Approved for Development*

