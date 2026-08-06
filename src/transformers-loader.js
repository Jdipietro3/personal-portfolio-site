// A thunk, not an import: defining it costs nothing and the ~550KB library plus
// ~23MB of weights are only fetched if a visitor actually opens the search.
//
// This deliberately stays a runtime CDN import rather than an npm dependency —
// bundling it would pull the library into the main chunk and charge every visitor
// for a feature most never use.
//
// @vite-ignore stops Vite from trying to resolve/pre-bundle the remote URL.
//
// SearchModel resolves this global lazily inside ensureLoaded(), which only runs
// when the search palette is first opened, so it is always defined by then.
window.loadTransformers = () =>
  import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0');
