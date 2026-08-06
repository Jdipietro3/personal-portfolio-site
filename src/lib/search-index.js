// ESM wrapper — see ./hero-grid.js for why the source stays a root classic script.
// SearchIndex's scoring tunables (K1, B, SEM_GATE, ...) are likewise documented as
// console-mutable, which the retained global preserves.
import '../../search-index.js';

export const SearchIndex = window.SearchIndex;
