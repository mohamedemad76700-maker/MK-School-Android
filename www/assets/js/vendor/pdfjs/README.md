# PDF.js vendored runtime

- Package: `pdfjs-dist` 6.4.299, obtained from the official npm package registry.
- Upstream project and release history: https://github.com/mozilla/pdf.js/releases
- License: Apache-2.0; see `LICENSE`. The `cmaps`, `standard_fonts`, and `wasm` folders include their upstream license notices.
- The application loads the minified legacy browser build and worker from this same-origin folder. No PDF.js executable code is fetched from a CDN at runtime.
