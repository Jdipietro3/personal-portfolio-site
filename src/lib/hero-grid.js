// ESM wrapper. The real module stays at the repo root as a classic script so that
// hero-grid.test.html, search-index.test.html and build-vectors.html — which load it
// via <script src> — keep working untouched. Adding `export` to the source file
// would make it a module and break those three with "Unexpected token 'export'".
//
// The side-effect import runs the IIFE (which sets window.HeroGrid) before this
// module's body evaluates, so the re-export below is always populated.
//
// Keeping the global also preserves the documented devtools workflow: HeroGrid's
// tunables are meant to be mutated live from the console, and buildMask() reads
// HALO_X/HALO_Y off the object at call time.
import '../../hero-grid.js';

export const HeroGrid = window.HeroGrid;
