# Browser Resources + Shared Inspector — Design System

Production visual reference: `browser-resources-concept.png` (1586 × 992).

## Intent

Extend the existing wallpaper-led bookmark desktop. The desktop remains visually dominant outside windows. New UI is compact, readable, neutral, and code-native; it must feel like an OS utility rather than a dashboard or marketing page.

## First viewport composition

- Existing bookmark/folder/document icons remain in their current desktop positions.
- Resource launcher dock is fixed at bottom center and stays above the desktop but below active windows.
- Resource windows use the existing movable/resizable window system with improved chrome.
- Open Tabs opens centered slightly to the right at roughly 72–76% viewport width and 70–74% viewport height, capped for large displays.
- Content is split into a main list and an inspector pane. Inspector is hidden by default in the product; the concept shows the expanded state.
- On narrow viewports, the dock becomes horizontally scrollable and the inspector overlays or stacks rather than compressing rows below usability.

## Color lock

- Desktop wallpaper: unchanged and untinted.
- Window title bar: `#25282c` to `#303338`, with white title/icons.
- Window surface: `#f7f8fa`.
- Primary row surface: `#ffffff`.
- Selected row: `#e6f0ff` with `#8bb8f5` border.
- Primary text: `#24272c`.
- Muted text: `#646b75`.
- Border/divider: `#d7dbe1`.
- Link/focus accent: `#2176d2`.
- Success/current signal: `#26a269`.
- Dock: `rgba(31, 33, 35, 0.94)` with a light translucent border.
- Shadow: cool black at low opacity; no glow.

## Typography

- UI family: `Inter`, `Segoe UI`, system sans-serif fallbacks. Do not affect legacy desktop icon labels.
- Window title: 14px, 600, 1.2 line-height.
- Toolbar controls: 13px, 600.
- Group headings: 14px, 650.
- Row title: 13px, 500.
- Row host and metadata: 12px, 400–500.
- Inspector section title: 13px, 650.
- Inspector label/value: 12px, 450/500, 1.35.
- Dock labels: 12px, 550.

## Spacing and geometry

- Base spacing: 4px; common steps 8, 12, 16, 20, 24.
- Window radius: 9px; title bar top corners inherit.
- Dock radius: 11px.
- Buttons/inputs: 7px radius.
- Rows: 44–48px minimum height.
- Toolbar: 52px.
- Title bar: 42px.
- Inspector: 32–36% of expanded window, minimum 300px.
- Borders: 1px.
- Focus ring: 2px solid accent with 2px offset.

## Component inventory

- `resourceDock`
- `resourceLauncher` with default, hover, focus, active variants
- existing `window` with `systemWindow` visual variant
- `resourceToolbar`
- `resourceSearch`
- `inspectorToggle`
- `resourceGroup`
- `resourceRow` with default, hover, selected, current variants
- `faviconFrame`
- `windowSummary`
- `inspectorPane`
- `inspectorSection` with expanded/collapsed states
- `metadataList`
- `resourceActionButton` primary/neutral/danger variants
- empty, permission-denied, and loading states

## Icon treatment

Use small code-native inline SVGs with `viewBox="0 0 24 24"`, `currentColor`, 1.7–1.9px round strokes, and no decorative containers except the selected launcher. Required metaphors:

- Bookmarks: bookmark outline.
- Open Tabs: stacked browser rectangles.
- History: clock with counter-clockwise arc.
- Search: magnifier.
- Settings: gear.
- Inspector: sliders/panel.
- Browser window group: monitor.
- Focus tab: target/crosshair.
- Close tab: `x` icon.
- Refresh: circular arrow.
- Section disclosure: chevron.

## Visible copy allow-list

Static product copy allowed above the fold:

- Bookmarks
- Open Tabs
- History
- Search
- Settings
- Search open tabs
- Search history
- Inspector
- Details
- Tab / Session
- Domain
- Actions
- Opened
- Opened From
- Opened by Search
- First Opened
- Last Opened / Used
- Title
- URL
- Visits
- Folder
- Window
- Status
- Active
- Unknown
- Not available
- Not tracked
- Open
- Loading…
- Recent history
- Local browser history
- Chrome bookmarks
- Focus Tab
- Close Tab
- Open
- Open in new tab
- Current
- Window
- windows
- tabs
- Tabs update automatically

Dynamic browser titles, URLs, hostnames, window numbers, counts, and timestamps are data, not fixed concept copy.

## Media treatment

The wallpaper has no overlay or tint. Window and dock shadows may darken only the pixels immediately behind their own surfaces. Favicons are browser-provided or use a neutral globe fallback; no generated raster UI asset is required.

## Interaction contract

- Launcher click opens or focuses the corresponding internal window.
- Resource windows remain independently movable/resizable and can coexist.
- Row click selects and updates the shared inspector.
- Row double click opens/focuses the resource.
- Inspector toggle preserves selection when hidden/shown.
- Section headers collapse/expand without losing data.
- Search filters locally and does not trigger navigation.
- Focus Tab activates the browser window and tab.
- Close Tab requires no confirmation but is visually a danger action and updates the list.
- Escape clears selection/inspector before closing the active window where practical.
- Respect `prefers-reduced-motion`.

## Responsive rules

- Desktop-first native target: 1440 × 900 and concept-native 1586 × 992.
- At widths under 860px, the inspector becomes an overlay pane within the window.
- At widths under 620px, resource rows hide secondary hostname text before truncating titles.
- Dock stays within 12px side gutters and scrolls horizontally if needed.
- No horizontal document overflow.
