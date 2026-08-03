// SearchIndex — pure retrieval logic for the site search.
// No DOM, no window reads, no fetch, no timers: every input arrives as an argument.
// The embedding model lives in search-model.js; this file works completely without it,
// which is what makes search usable offline and before the model finishes downloading.
(function () {
  'use strict';

  // Words that carry no signal in a corpus this small. Question words are included
  // deliberately — "what has he built with go" should retrieve on "built" and "go".
  var STOP = {};
  ('a an and are as at be but by can did do does for from had has have he her him his how i in is it '
   + 'its me my of on or she that the their them they this to was were what when where which who whom '
   + 'why will with you your there here about into over than then those these s t')
    .split(' ').forEach(function (w) { STOP[w] = true; });

  // Two-letter tokens that are real terms rather than noise.
  var SHORT_OK = { go: true, ai: true, ml: true, os: true, ci: true, db: true, js: true, ts: true, c: true, r: true, dp: true };

  // Résumé bullets are written in the past tense ("Built", "Wrote", "Led") while
  // questions are asked in other forms ("what has he built", "has he taught"). The
  // suffix stemmer can't bridge irregular verbs, so the handful that actually show
  // up in this domain are mapped explicitly. Without 'taught' -> 'teach', a query
  // about teaching has zero lexical overlap with the Teaching Assistant role.
  var IRREGULAR = {
    taught: 'teach', built: 'build', wrote: 'write', written: 'write', led: 'lead',
    ran: 'run', run: 'run', made: 'make', grew: 'grow',
    took: 'take', gave: 'give', held: 'hold', met: 'meet', won: 'win',
    sought: 'seek', began: 'begin', drew: 'draw', shipped: 'ship'
  };

  var SearchIndex = {
    // tunables — mutable at runtime from the devtools console, like HeroGrid's
    K1: 1.2,               // BM25 term-frequency saturation
    B: 0.75,               // BM25 length normalisation
    PHRASE_BONUS: 1.5,     // whole query appears verbatim in the chunk text
    TITLE_BONUS: 1.0,      // a query term appears in the chunk title
    LEX_SQUASH: 6,         // divisor in the 1 - e^(-raw/k) saturation
    SEM_WEIGHT: 0.65,      // semantic share of the blend; lexical gets the rest
    // Calibrated against MiniLM's actual output on this corpus, not guessed. Real
    // queries peak at cos 0.25-0.55; nonsense ("asdfghjkl", "does he know rust")
    // still peaks as high as 0.22, because cosine on short text is never near zero.
    // So the gate and the score scale are separate concerns:
    //   SEM_GATE  — a hard cutoff. A chunk with no keyword hit must clear this to
    //               appear at all. This is what makes "no good match" possible.
    //   BASE/TOP  — the range mapped onto 0..1 for scoring. Deliberately wider than
    //               the gate: scaling from a base sitting at the decision boundary
    //               would crush every genuine-but-modest match to near zero.
    SEM_GATE: 0.26,
    SEM_BASE: 0.20,
    SEM_TOP: 0.60,
    MIN_SHOW_LEX: 0.18,    // threshold while running keyword-only
    MIN_SHOW_BLEND: 0.09,  // low by design — SEM_GATE does the real filtering
    MAX_RESULTS: 5,

    // ---- tokenisation -------------------------------------------------------

    // Splits on everything except the characters that carry meaning inside tech
    // names, so 'c++', 'node.js', 'a*', and 'x86-64' survive as single tokens.
    tokenize: function (str) {
      if (!str) return [];
      var raw = String(str).toLowerCase().split(/[^a-z0-9+#.*_-]+/);
      var out = [];
      for (var i = 0; i < raw.length; i++) {
        var t = raw[i];
        if (!t) continue;
        // trailing sentence punctuation, but not the '.' inside node.js
        t = t.replace(/[.\-_]+$/, '');
        if (!t) continue;
        if (STOP[t]) continue;
        // Very short tokens are noise unless they're a known term ('go', 'ml') or
        // carry a symbol/digit that makes them a real name ('a*', 'c++', 'x86').
        var symbolic = /[^a-z]/.test(t);
        if (t.length < 2 && !SHORT_OK[t] && !symbolic) continue;
        if (t.length === 2 && !SHORT_OK[t] && !symbolic) continue;
        out.push(SearchIndex.stem(t));
        // 'e-commerce' and 'ecommerce' are the same word to a reader, so make them
        // the same term to the index. Emitted at index *and* query time, which is
        // the only property that matters. Restricted to all-alphabetic compounds so
        // 'x86-64' and 'utf-8' aren't turned into junk tokens like 'x8664'.
        if (/^[a-z]+(-[a-z]+)+$/.test(t)) {
          out.push(SearchIndex.stem(t.replace(/-/g, '')));
        }
      }
      return out;
    },

    // Deliberately timid: only tokens long enough that the suffix is unlikely to be
    // load-bearing get stripped, so 'go' and 'grpc' are never touched while
    // 'models' -> 'model' and 'compilers' -> 'compiler'. Applied identically at
    // index time and query time, which is the only property that actually matters.
    stem: function (t) {
      if (IRREGULAR[t]) return IRREGULAR[t];
      if (t.length < 5 || /[^a-z]/.test(t)) return t;
      if (/ies$/.test(t)) return t.slice(0, -3) + 'y';
      if (/(ss|us|is)$/.test(t)) return t;
      if (/es$/.test(t) && /(ch|sh|x|z|s)es$/.test(t)) return t.slice(0, -2);
      if (/s$/.test(t)) return t.slice(0, -1);
      if (/ing$/.test(t) && t.length > 6) return t.slice(0, -3);
      if (/ed$/.test(t) && t.length > 5) return t.slice(0, -2);
      return t;
    },

    // ---- chunking -----------------------------------------------------------

    // A chunk is the smallest unit that reads as an answer on its own.
    //
    // `text` is what gets embedded and scored: it carries context that `snippet`
    // omits, because a highlight like "Hand-written lexer and recursive-descent
    // parser" never mentions toylang, and a query for "compiler project" has to
    // reach it. `snippet` stays verbatim from the source so the result row matches
    // what the visitor sees when they land on the page.
    //
    // `groupId` is the collapse key at rank time — without it, four bullets from
    // one job would fill every slot.
    buildChunks: function (content) {
      var chunks = [];
      var kickerOf = {};
      content.sections.forEach(function (s) { kickerOf[s.id] = s.kicker; });

      function push(c) {
        c.kicker = c.kicker || kickerOf[c.section] || '';
        c.weight = c.weight == null ? 1 : c.weight;
        c.openProject = c.openProject || null;
        chunks.push(c);
      }

      // --- about ---
      content.about.paragraphs.forEach(function (p, i) {
        push({
          id: 'about:' + i, groupId: 'about', kind: 'about', section: 'about', anchorId: 'about',
          title: 'About', snippet: p, text: p, weight: 1.0
        });
      });
      push({
        id: 'about:status', groupId: 'about', kind: 'about', section: 'about', anchorId: 'about',
        title: 'Current status',
        snippet: content.about.status.replace(/^>>\s*/, ''),
        text: content.about.status.replace(/^>>\s*/, '') + ' Currently available, open to internships and new roles.',
        weight: 1.0
      });

      // --- experience ---
      content.experience.forEach(function (job) {
        var head = job.role + ' at ' + job.org + ', ' + job.range + '.';
        var tags = ' Skills: ' + job.tags.join(', ') + '.';
        // Index-only vocabulary for "who does he work for right now" — same trick as
        // the education and contact chunks below. Keyed off the range rather than
        // array position, so it stays correct however the list is ordered, and so a
        // role that ends stops claiming to be current the moment its range changes.
        var current = /present|current/i.test(job.range)
          // Deliberately no 'job' here: it is generic enough that adding it made the
          // current role outrank the About section on "is he looking for a job".
          ? ' Current role, currently working here, present position, where he works now.'
          : '';
        push({
          id: 'exp:' + job.id, groupId: 'exp:' + job.id, kind: 'role', section: 'experience',
          anchorId: 'job-' + job.id, title: job.role, kicker: 'EXPERIENCE · ' + job.org,
          snippet: job.bullets[0],
          text: head + ' ' + job.bullets.join('. ') + '.' + tags + current,
          weight: 1.05
        });
        job.bullets.forEach(function (b, i) {
          push({
            id: 'exp:' + job.id + ':b' + i, groupId: 'exp:' + job.id, kind: 'roleBullet', section: 'experience',
            anchorId: 'job-' + job.id, title: job.role, kicker: 'EXPERIENCE · ' + job.org,
            snippet: b,
            text: head + ' ' + b + '.' + tags,
            weight: 1.0
          });
        });
      });

      // --- education ---
      var edu = content.education;
      push({
        id: 'edu:degree', groupId: 'edu', kind: 'education', section: 'education', anchorId: 'education',
        title: edu.degree,
        snippet: edu.degree + ' — ' + edu.institution + ', ' + edu.graduation + '. GPA ' + edu.gpa + '.',
        // The trailing synonyms are index-only vocabulary: they never display, they
        // exist so "where does he go to school" and "what college" reach this chunk.
        text: edu.degree + ' at ' + edu.institution + ', focus ' + edu.focus + '. Graduating ' + edu.graduation
          + '. GPA ' + edu.gpa + '. Undergraduate student, university degree, school, college, major, studies.',
        weight: 1.0
      });
      // Its own chunk rather than a line appended to the degree text, so a query for
      // "dean's list" surfaces a row that actually says so. groupId keeps it collapsed
      // with the rest of education, so it can never push the degree off the list.
      push({
        id: 'edu:honors', groupId: 'edu', kind: 'education', section: 'education', anchorId: 'education',
        title: 'Honors',
        snippet: edu.honors,
        text: 'Academic honors and awards: ' + edu.honors + '. Scholarship, honor roll, distinction.',
        weight: 1.0
      });
      push({
        id: 'edu:coursework', groupId: 'edu', kind: 'education', section: 'education', anchorId: 'education',
        title: 'Coursework',
        snippet: edu.coursework.join(', '),
        text: 'Relevant coursework and classes taken: ' + edu.coursework.join(', ') + '.',
        weight: 1.0
      });

      // --- projects ---
      content.projects.forEach(function (p) {
        // Deliberately not "Built with": this string is appended to every project
        // chunk, and a verb here becomes a near-stopword. 'build' landed in 26 of
        // 46 chunks that way, collapsing its IDF so "what has he built" scored
        // below the display threshold on every result.
        var tags = ' Tech: ' + p.tags.join(', ') + '.';
        push({
          id: 'proj:' + p.key, groupId: 'proj:' + p.key, kind: 'project', section: 'projects', anchorId: 'projects',
          title: p.name, kicker: 'PROJECT · ' + p.year, openProject: p.key,
          snippet: p.desc,
          text: p.name + ' (' + p.year + '). ' + p.desc + ' ' + p.longDesc + tags,
          weight: 1.05
        });
        p.highlights.forEach(function (h, i) {
          push({
            id: 'proj:' + p.key + ':h' + i, groupId: 'proj:' + p.key, kind: 'projectHighlight', section: 'projects',
            anchorId: 'projects', title: p.name, kicker: 'PROJECT · ' + p.year, openProject: p.key,
            snippet: h,
            text: p.name + ': ' + h + '.' + tags,
            weight: 1.0
          });
        });
      });

      // --- skills ---
      // Down-weighted: a bag of tech names is keyword soup that over-fires on cosine
      // similarity against almost any technical query.
      content.skills.forEach(function (g) {
        push({
          id: 'skills:' + g.id, groupId: 'skills:' + g.id, kind: 'skills', section: 'skills', anchorId: 'skills',
          title: g.title,
          snippet: g.items.join(', '),
          text: 'Skills, ' + g.title.toLowerCase() + ': ' + g.items.join(', ') + '.',
          weight: 0.95
        });
      });

      // --- contact ---
      push({
        id: 'contact', groupId: 'contact', kind: 'contact', section: 'contact', anchorId: 'contact',
        title: 'Get in touch',
        snippet: content.contact.searchBlurb,
        text: content.contact.searchBlurb + ' Email ' + content.contact.email
          + '. Contact, reach out, hire, message, connect, resume, CV.',
        weight: 1.0
      });

      return chunks;
    },

    // ---- index --------------------------------------------------------------

    buildIndex: function (chunks) {
      var tf = [], len = [], df = {}, total = 0;
      for (var i = 0; i < chunks.length; i++) {
        var toks = SearchIndex.tokenize(chunks[i].text);
        var counts = {};
        for (var j = 0; j < toks.length; j++) counts[toks[j]] = (counts[toks[j]] || 0) + 1;
        for (var t in counts) if (Object.prototype.hasOwnProperty.call(counts, t)) df[t] = (df[t] || 0) + 1;
        tf.push(counts);
        len.push(toks.length);
        total += toks.length;
      }
      return {
        chunks: chunks,
        tf: tf,
        df: df,
        len: len,
        N: chunks.length,
        avgdl: chunks.length ? total / chunks.length : 0,
        vocab: Object.keys(df),
        lower: chunks.map(function (c) { return c.text.toLowerCase(); }),
        titleToks: chunks.map(function (c) { return SearchIndex.tokenize(c.title); })
      };
    },

    // ---- lexical scoring ----------------------------------------------------

    lexicalScores: function (index, query) {
      var out = new Float64Array(index.N);
      var q = String(query || '').trim();
      if (!q) return out;

      var toks = SearchIndex.tokenize(q);
      if (!toks.length) return out;

      // As-you-type: expand only the final token by prefix, so "compil" reaches
      // "compiler" while an earlier short token can't match half the vocabulary.
      var terms = [];
      for (var i = 0; i < toks.length; i++) {
        if (i < toks.length - 1) { terms.push({ t: toks[i], boost: 1 }); continue; }
        terms.push({ t: toks[i], boost: 1 });
        if (!index.df[toks[i]]) {
          var pre = toks[i];
          for (var v = 0; v < index.vocab.length; v++) {
            if (index.vocab[v] !== pre && index.vocab[v].indexOf(pre) === 0) {
              terms.push({ t: index.vocab[v], boost: 0.75 });
            }
          }
        }
      }

      var qLower = q.toLowerCase();
      var k1 = SearchIndex.K1, b = SearchIndex.B;

      for (var d = 0; d < index.N; d++) {
        var raw = 0;
        for (var m = 0; m < terms.length; m++) {
          var term = terms[m].t;
          var f = index.tf[d][term];
          if (!f) continue;
          var n = index.df[term] || 0;
          // BM25 IDF, floored at 0 so a term present in every chunk can't score negative
          var idf = Math.max(0, Math.log(1 + (index.N - n + 0.5) / (n + 0.5)));
          var denom = f + k1 * (1 - b + b * (index.len[d] / (index.avgdl || 1)));
          raw += terms[m].boost * idf * (f * (k1 + 1)) / (denom || 1);
        }
        if (raw > 0) {
          if (qLower.length > 2 && index.lower[d].indexOf(qLower) !== -1) raw += SearchIndex.PHRASE_BONUS;
          var titleHit = false;
          for (var ti = 0; ti < toks.length && !titleHit; ti++) {
            if (index.titleToks[d].indexOf(toks[ti]) !== -1) titleHit = true;
          }
          if (titleHit) raw += SearchIndex.TITLE_BONUS;
        }
        // Saturating squash into 0..1. Normalising by the top score instead would
        // make the best hit 1.0 for every query — including nonsense ones — and
        // there would be no such thing as "nothing matched".
        out[d] = raw > 0 ? 1 - Math.exp(-raw / SearchIndex.LEX_SQUASH) : 0;
      }
      return out;
    },

    // ---- semantic scoring ---------------------------------------------------

    cosine: function (a, b) {
      if (!a || !b || a.length !== b.length) return 0;
      var dot = 0, na = 0, nb = 0;
      for (var i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
      if (na === 0 || nb === 0) return 0;
      return dot / (Math.sqrt(na) * Math.sqrt(nb));
    },

    semanticScores: function (embeddings, queryVec) {
      var n = embeddings ? embeddings.length : 0;
      var out = new Float64Array(n);
      if (!queryVec) return out;
      for (var i = 0; i < n; i++) out[i] = SearchIndex.cosine(embeddings[i], queryVec);
      return out;
    },

    // ---- ranking ------------------------------------------------------------

    // sem may be null (keyword-only mode). Returns at most MAX_RESULTS chunks,
    // one per groupId, all above threshold. An empty array is a legitimate answer.
    rank: function (index, lex, sem) {
      var hasSem = !!sem;
      var span = SearchIndex.SEM_TOP - SearchIndex.SEM_BASE;
      var scored = [];

      for (var i = 0; i < index.N; i++) {
        var c = index.chunks[i];
        var score;
        if (hasSem) {
          // A keyword hit is its own proof of relevance, so a chunk with lex > 0
          // is never gated out. A chunk riding on similarity alone has to clear
          // SEM_GATE — that gate is the whole reason nonsense returns nothing.
          if (lex[i] <= 0 && sem[i] < SearchIndex.SEM_GATE) { score = 0; }
          else {
            var semAdj = Math.max(0, Math.min(1, (sem[i] - SearchIndex.SEM_BASE) / span));
            score = (SearchIndex.SEM_WEIGHT * semAdj + (1 - SearchIndex.SEM_WEIGHT) * lex[i]) * c.weight;
          }
        } else {
          score = lex[i] * c.weight;
        }
        if (score > 0) scored.push({ i: i, score: score });
      }

      scored.sort(function (a, b) { return b.score - a.score || a.i - b.i; });

      var min = hasSem ? SearchIndex.MIN_SHOW_BLEND : SearchIndex.MIN_SHOW_LEX;
      var seen = {}, results = [];
      for (var s = 0; s < scored.length && results.length < SearchIndex.MAX_RESULTS; s++) {
        var chunk = index.chunks[scored[s].i];
        if (scored[s].score < min) break;
        if (seen[chunk.groupId]) continue;
        seen[chunk.groupId] = true;
        results.push({
          id: chunk.id,
          groupId: chunk.groupId,
          kind: chunk.kind,
          section: chunk.section,
          anchorId: chunk.anchorId,
          openProject: chunk.openProject,
          title: chunk.title,
          kicker: chunk.kicker,
          snippet: chunk.snippet,
          score: scored[s].score
        });
      }
      return results;
    },

    // ---- precomputed embeddings ---------------------------------------------

    // Identifies exactly what was embedded. search-vectors.js carries the hash it
    // was built from; if the content has changed since, the runtime ignores the
    // stale file and embeds live instead. This is what makes shipping a generated
    // artefact safe while the site's copy is still being written.
    corpusHash: function (chunks, modelId, dtype) {
      var parts = [modelId || '', dtype || ''];
      for (var i = 0; i < chunks.length; i++) parts.push(chunks[i].id, chunks[i].text);
      var str = parts.join(' ');
      var h = 0x811c9dc5;                                   // FNV-1a, 32-bit
      for (var j = 0; j < str.length; j++) {
        h ^= str.charCodeAt(j);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
      }
      return ('0000000' + h.toString(16)).slice(-8);
    },

    // Vectors are stored as int8 rather than JSON floats: 46x384 floats is ~144KB
    // of JSON, the same data as int8 base64 is ~24KB. No scale factor is kept
    // because cosine() normalises both operands, so any per-vector scaling cancels
    // out — only the direction has to survive the round trip.
    encodeVectors: function (vectors) {
      var n = vectors.length, dims = n ? vectors[0].length : 0;
      var bytes = new Uint8Array(n * dims);
      for (var i = 0; i < n; i++) {
        var v = vectors[i], max = 0;
        for (var d = 0; d < dims; d++) { var a = Math.abs(v[d]); if (a > max) max = a; }
        var scale = max > 0 ? 127 / max : 0;
        for (var e = 0; e < dims; e++) {
          var q = Math.round(v[e] * scale);
          if (q > 127) q = 127; else if (q < -127) q = -127;
          bytes[i * dims + e] = q & 0xff;                   // two's complement
        }
      }
      var binary = '';
      for (var k = 0; k < bytes.length; k += 8192) {
        binary += String.fromCharCode.apply(null, bytes.subarray(k, k + 8192));
      }
      return { dims: dims, count: n, data: btoa(binary) };
    },

    decodeVectors: function (payload) {
      if (!payload || !payload.data || !payload.dims || !payload.count) return null;
      var binary;
      try { binary = atob(payload.data); } catch (e) { return null; }
      if (binary.length !== payload.count * payload.dims) return null;
      var out = [];
      for (var i = 0; i < payload.count; i++) {
        var v = new Float32Array(payload.dims);
        for (var d = 0; d < payload.dims; d++) {
          var b = binary.charCodeAt(i * payload.dims + d);
          v[d] = b > 127 ? b - 256 : b;                     // back to signed
        }
        out.push(v);
      }
      return out;
    },

    search: function (index, query, embeddings, queryVec) {
      var lex = SearchIndex.lexicalScores(index, query);
      var sem = (embeddings && queryVec) ? SearchIndex.semanticScores(embeddings, queryVec) : null;
      return SearchIndex.rank(index, lex, sem);
    }
  };

  window.SearchIndex = SearchIndex;
})();
