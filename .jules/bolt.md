## 2024-03-20 - Memoizing MapPiece
**Learning:** Components heavily reused inside dynamic SVG maps (like MapPiece rendered for every unit) are a massive source of re-renders if left unmemoized.
**Action:** Always memoize these lower-level render components in interactive canvases.