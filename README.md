# Dig a Hole — Where Would You Come Up?

An interactive holographic 3D Earth. Drag to rotate, scroll to zoom, and click anywhere on the globe to spear a line through the planet's core — the app shows the lat/long where you'd emerge on the other side, plus a best-effort country/ocean label for both ends.

Built with [Three.js](https://threejs.org/) loaded from a CDN — no build step.

## Run

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Or open `index.html` directly in any modern browser (a local server is recommended so the import map and texture CORS resolve cleanly).

## How it works

- The globe is a textured sphere with an additive-blended Fresnel atmosphere shader for the holographic glow.
- Clicking raycasts onto the sphere, converts the hit point to (lat, lon), and computes the antipode as `(-lat, lon ± 180)`.
- A glowing magenta cylinder is drawn from the entry point to the antipode, passing through the origin.
- Reverse geocoding uses BigDataCloud's free client endpoint; ocean clicks fall back to "Open Ocean".
