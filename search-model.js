// SearchModel — lazy loader and embedding wrapper for the sentence transformer.
//
// This is the only part of search that touches the network. Everything here is
// best-effort: ensureLoaded() resolves false rather than rejecting, so a blocked
// CDN, a missing module loader, or an offline visitor degrades to the keyword
// search in search-index.js instead of breaking the page.
//
// Nothing is fetched until ensureLoaded() is called, which happens the first time
// a visitor opens the search palette — never on page load.
(function () {
  'use strict';

  var SearchModel = {
    // tunables — mutable at runtime from the devtools console
    MODEL_ID: 'Xenova/all-MiniLM-L6-v2',
    DTYPE: 'q8',        // -> onnx/model_quantized.onnx, ~23MB. Omitting this
                        // quadruples the download: v4 does not quantize by default.
    TIMEOUT_MS: 45000,
    BATCH: 8,
    WEIGHTS_MIN_BYTES: 1048576,  // a file this big is the weights, not metadata
    PRE_WEIGHTS_CAP: 0.05,       // ceiling until the weights announce their size

    status: 'idle',     // idle | loading | ready | failed
    progress: 0,        // 0..1, byte-weighted across every file being fetched

    _promise: null,
    _pipe: null,
    _onProgress: null,
    _files: null,       // file -> { loaded, total }

    // The module thunk is defined by an inline <script type="module">, which is
    // implicitly deferred and therefore has NOT run while the classic scripts on
    // the page are executing. Resolving it lazily is what makes the load order
    // work; a browser without module support simply never defines it, and that
    // lands on the same failure path as a blocked CDN.
    _resolveLoader: function () {
      if (typeof window.loadTransformers === 'function') return Promise.resolve(window.loadTransformers);
      if (document.readyState === 'loading') {
        return new Promise(function (res) {
          window.addEventListener('DOMContentLoaded', function () {
            res(typeof window.loadTransformers === 'function' ? window.loadTransformers : null);
          }, { once: true });
        });
      }
      return Promise.resolve(null);
    },

    // transformers.js reports progress per file (config, tokenizer, and the ~23MB
    // onnx weights). Averaging the per-file percentages would let three tiny JSON
    // files show 75% done while the download that actually matters has barely
    // started, so this sums bytes instead — the weights dominate, as they should.
    _trackProgress: function (p) {
      if (!p || !p.file) return;
      if (!SearchModel._files) SearchModel._files = {};

      if (p.status === 'progress' && typeof p.total === 'number' && p.total > 0) {
        SearchModel._files[p.file] = { loaded: p.loaded || 0, total: p.total };
      } else if (p.status === 'done' && SearchModel._files[p.file]) {
        var f = SearchModel._files[p.file];
        f.loaded = f.total;
      } else {
        return;
      }

      var loaded = 0, total = 0, sawWeights = false;
      for (var k in SearchModel._files) {
        if (Object.prototype.hasOwnProperty.call(SearchModel._files, k)) {
          loaded += SearchModel._files[k].loaded;
          total += SearchModel._files[k].total;
          if (SearchModel._files[k].total >= SearchModel.WEIGHTS_MIN_BYTES) sawWeights = true;
        }
      }

      var next;
      if (!sawWeights) {
        // config.json arrives first and completes instantly. Dividing by only the
        // bytes announced so far would read 100% before the download that actually
        // matters has started, so hold at a sliver until the weights declare a size.
        next = Math.min(SearchModel.PRE_WEIGHTS_CAP, total > 0 ? loaded / total : 0);
      } else {
        // Cap just below 1: the last stretch is wasm init and session creation,
        // which report nothing. Claiming 100% then stalling reads worse than 99%.
        next = Math.min(0.99, total > 0 ? loaded / total : 0);
      }
      if (next <= SearchModel.progress) return;   // never let the bar go backwards
      SearchModel.progress = next;
      if (SearchModel._onProgress) {
        try { SearchModel._onProgress(next); } catch (e) { /* caller's problem */ }
      }
    },

    // Resolves true once the pipeline is usable, false if it never will be.
    // Idempotent and memoized; safe to call from anywhere. Never rejects.
    ensureLoaded: function (onProgress) {
      if (onProgress) SearchModel._onProgress = onProgress;
      if (SearchModel.status === 'ready') return Promise.resolve(true);
      if (SearchModel.status === 'failed') return Promise.resolve(false);
      if (SearchModel._promise) return SearchModel._promise;

      SearchModel.status = 'loading';

      var load = SearchModel._resolveLoader().then(function (loader) {
        if (!loader) throw new Error('no module loader (dynamic import unavailable)');
        return loader();
      }).then(function (mod) {
        // Each of these is wrapped independently: the backends namespace moved
        // between major versions, and a missing knob must not sink the load.
        try {
          // Without this the library probes for a same-origin /models/... path
          // first and 404s before reaching the Hub.
          mod.env.allowLocalModels = false;
        } catch (e) { /* older/newer env shape */ }
        try {
          // Multi-threaded wasm needs SharedArrayBuffer, which needs COOP/COEP
          // headers no static host sets. Pin to one thread rather than let it
          // discover that the noisy way.
          mod.env.backends.onnx.wasm.numThreads = 1;
        } catch (e) { /* not fatal */ }

        return mod.pipeline('feature-extraction', SearchModel.MODEL_ID, {
          dtype: SearchModel.DTYPE,
          progress_callback: SearchModel._trackProgress
        });
      });

      // A CDN that accepts the connection and then stalls would otherwise leave
      // the palette showing 'loading' forever.
      var timeout = new Promise(function (_, rej) {
        setTimeout(function () { rej(new Error('timed out after ' + SearchModel.TIMEOUT_MS + 'ms')); }, SearchModel.TIMEOUT_MS);
      });

      SearchModel._promise = Promise.race([load, timeout]).then(function (pipe) {
        SearchModel._pipe = pipe;
        SearchModel.status = 'ready';
        SearchModel.progress = 1;
        return true;
      }).catch(function (err) {
        SearchModel.status = 'failed';
        SearchModel._pipe = null;
        console.warn('[search] semantic model unavailable, falling back to keyword search:', err && err.message);
        return false;
      });

      return SearchModel._promise;
    },

    // Yields to the event loop between batches. Deliberately NOT setTimeout(0):
    // background tabs clamp timers to >=1s, which turned a handful of yields into
    // six seconds of dead waiting whenever the visitor switched away mid-load. A
    // MessageChannel task is not clamped. rAF would be worse still — it stops
    // entirely while hidden.
    _yield: function () {
      return new Promise(function (res) {
        if (typeof MessageChannel === 'undefined') { setTimeout(res, 0); return; }
        var ch = new MessageChannel();
        ch.port1.onmessage = function () { ch.port1.close(); res(); };
        ch.port2.postMessage(0);
      });
    },

    // Returns an array of plain number arrays (384 dims each), or null on failure.
    //
    // Batched with a yield between batches because ONNX runs on the main thread
    // here: the hero's canvas animation loop is live at exactly the moment the
    // corpus gets embedded, and one 47-text call visibly stutters it.
    embed: function (texts) {
      if (SearchModel.status !== 'ready' || !SearchModel._pipe) return Promise.resolve(null);
      var list = Array.isArray(texts) ? texts : [texts];
      if (!list.length) return Promise.resolve([]);

      var out = [];
      var i = 0;

      function step() {
        if (i >= list.length) return Promise.resolve(out);
        var slice = list.slice(i, i + SearchModel.BATCH);
        i += SearchModel.BATCH;
        return SearchModel._pipe(slice, { pooling: 'mean', normalize: true })
          .then(function (res) {
            var arr = res.tolist();
            for (var j = 0; j < arr.length; j++) out.push(arr[j]);
            // Hand the frame back so the hero animation stays smooth.
            return SearchModel._yield().then(step);
          });
      }

      return step().catch(function (err) {
        console.warn('[search] embedding failed:', err && err.message);
        return null;
      });
    },

    // Lets a caller retry after a failure (e.g. the visitor reconnects).
    reset: function () {
      SearchModel.status = 'idle';
      SearchModel.progress = 0;
      SearchModel._promise = null;
      SearchModel._pipe = null;
      SearchModel._files = null;
    }
  };

  window.SearchModel = SearchModel;
})();
