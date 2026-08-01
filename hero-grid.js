// HeroGrid — pure logic for the shared name/swirl character grid.
// No DOM, no canvas, no window reads: every input arrives as an argument.
(function () {
  'use strict';

  var NAME_ASCII = [
    "     __                  __     ___  _ ___  _     __         ",
    " __ / /__  ___ ___ ___  / /    / _ \\(_) _ \\(_)__ / /________ ",
    "/ // / _ \\(_-</ -_) _ \\/ _ \\  / // / / ___/ / -_) __/ __/ _ \\",
    "\\___/\\___/___/\\__/ .__/_//_/ /____/_/_/  /_/\\__/\\__/_/  \\___/",
    "                /_/                                          "
  ].join('\n');

  var HeroGrid = {
    // tunables — mutable at runtime from the devtools console for visual tuning
    BASE_FONT: 18,
    DOCKED_FONT: 4.2,
    ADVANCE: 0.6,
    HALO_X: 0,         // no breathing gap — the swirl runs right up to the letters
    HALO_Y: 0,
    PHASE_A: 1.2,
    PHASE_B: 380,
    FIELD_R: 0.78,     // field radius as a fraction of the viewport diagonal
    FALLOFF_POW: 0.85, // lower = more even coverage out to the edges
    CULL: 0.15,        // brightness below this draws nothing
    PALETTE: [' ', '.', ':', '-', '+', '*', 'x', '%', '#', '@'],
    TOKENS: ['01', '10', 'fn', 'if', '{}', '=>', '&&', '::', 'λ', '0x'],
    NAME_ASCII: NAME_ASCII,

    lerp: function (a, b, t) {
      return a + (b - a) * t;
    },

    clamp: function (v, a, b) {
      return Math.max(a, Math.min(b, v));
    },

    geometry: function (w, h, nameRows) {
      var nameCols = 0;
      for (var i = 0; i < nameRows.length; i++) {
        if (nameRows[i].length > nameCols) nameCols = nameRows[i].length;
      }
      var nameRowCount = nameRows.length;

      // min() is only a narrow-screen guard; on a normal desktop this equals BASE_FONT
      var fontSize = Math.min(HeroGrid.BASE_FONT, (w * 0.94) / (nameCols * HeroGrid.ADVANCE));
      var cellW = fontSize * HeroGrid.ADVANCE;
      var cellH = fontSize; // <pre> uses line-height:1, so a row is exactly one font-size tall

      var cols = Math.ceil(w / cellW);
      var rows = Math.ceil(h / cellH);

      // integer so the DOM <pre> (positioned at col0*cellW, row0*cellH) lines up with the canvas grid
      var col0 = Math.max(0, Math.round((cols - nameCols) / 2));
      var row0 = Math.max(0, Math.round(Math.min(h * 0.44, 440) / cellH - nameRowCount / 2));

      var nameW = nameCols * cellW;
      var nameH = nameRowCount * cellH;

      return {
        w: w,
        h: h,
        nameCols: nameCols,
        nameRowCount: nameRowCount,
        fontSize: fontSize,
        cellW: cellW,
        cellH: cellH,
        cols: cols,
        rows: rows,
        col0: col0,
        row0: row0,
        nameW: nameW,
        nameH: nameH
      };
    },

    buildMask: function (nameRows, geom) {
      var nameCols = geom.nameCols;
      var nameRowCount = geom.nameRowCount;

      // 1. glyph grid — true where the name has ink
      var glyph = [];
      for (var r = 0; r < nameRowCount; r++) {
        var row = nameRows[r] || '';
        var rowArr = [];
        for (var c = 0; c < nameCols; c++) {
          var ch = c < row.length ? row[c] : ' ';
          rowArr.push(ch !== ' ');
        }
        glyph.push(rowArr);
      }

      // 2. flood fill from every border space cell over !glyph cells (4-connectivity).
      // Any space cell the fill never reaches is enclosed inside a letter (e.g. counters
      // of 'o', 'e', 'a') and must stay blocked so the swirl doesn't bleed into it.
      var reached = [];
      for (var r2 = 0; r2 < nameRowCount; r2++) {
        reached.push(new Array(nameCols).fill(false));
      }
      var stack = [];
      var pushIfSpace = function (r, c) {
        if (r < 0 || r >= nameRowCount || c < 0 || c >= nameCols) return;
        if (glyph[r][c]) return;
        if (reached[r][c]) return;
        reached[r][c] = true;
        stack.push([r, c]);
      };
      for (var c0 = 0; c0 < nameCols; c0++) {
        pushIfSpace(0, c0);
        pushIfSpace(nameRowCount - 1, c0);
      }
      for (var r0 = 0; r0 < nameRowCount; r0++) {
        pushIfSpace(r0, 0);
        pushIfSpace(r0, nameCols - 1);
      }
      while (stack.length) {
        var cur = stack.pop();
        var cr = cur[0], cc = cur[1];
        pushIfSpace(cr - 1, cc);
        pushIfSpace(cr + 1, cc);
        pushIfSpace(cr, cc - 1);
        pushIfSpace(cr, cc + 1);
      }

      // 3. blocked = glyph OR enclosed (space cell never reached by the fill)
      var blocked = [];
      for (var r3 = 0; r3 < nameRowCount; r3++) {
        var brow = [];
        for (var c3 = 0; c3 < nameCols; c3++) {
          brow.push(glyph[r3][c3] || !reached[r3][c3]);
        }
        blocked.push(brow);
      }

      // 4. dilate with an asymmetric rectangular structuring element (wider than tall,
      // since the swirl needs more horizontal breathing room around thin vertical strokes).
      // Read HALO_X/HALO_Y off HeroGrid live so console tuning + rebuild takes effect.
      var haloX = HeroGrid.HALO_X;
      var haloY = HeroGrid.HALO_Y;
      var blockedList = [];
      for (var br = 0; br < nameRowCount; br++) {
        for (var bc = 0; bc < nameCols; bc++) {
          if (blocked[br][bc]) blockedList.push([br, bc]);
        }
      }

      var mask = new Set();
      var minLocalR = -haloY;
      var maxLocalR = nameRowCount - 1 + haloY;
      var minLocalC = -haloX;
      var maxLocalC = nameCols - 1 + haloX;

      for (var lr = minLocalR; lr <= maxLocalR; lr++) {
        for (var lc = minLocalC; lc <= maxLocalC; lc++) {
          var isMasked = false;
          for (var bi = 0; bi < blockedList.length; bi++) {
            var bR = blockedList[bi][0], bC = blockedList[bi][1];
            if (Math.abs(lr - bR) <= haloY && Math.abs(lc - bC) <= haloX) {
              isMasked = true;
              break;
            }
          }
          if (!isMasked) continue;

          // 5. translate to canvas coords, drop out-of-bounds cells
          var canvasRow = geom.row0 + lr;
          var canvasCol = geom.col0 + lc;
          if (canvasRow < 0 || canvasRow >= geom.rows) continue;
          if (canvasCol < 0 || canvasCol >= geom.cols) continue;
          mask.add(canvasRow * geom.cols + canvasCol);
        }
      }

      return mask;
    },

    maxDist: function (geom) {
      return Math.sqrt(geom.w * geom.w + geom.h * geom.h) * HeroGrid.FIELD_R;
    },

    // The swirl fades in place across phase A rather than travelling. pow < 1 holds the
    // field near full strength early on, so it reads as a dissolve rather than a dimmer.
    alphaFor: function (p1) {
      var a = HeroGrid.clamp(1 - p1, 0, 1);
      if (a < 1e-4) return 0; // exact 0 so the draw loop's early-bail actually fires
      return Math.pow(a, 0.8);
    },

    sample: function (col, row, geom, rise, time, swirlAlpha) {
      var PALETTE = HeroGrid.PALETTE;
      var TOKENS = HeroGrid.TOKENS;

      var x = col * geom.cellW + geom.cellW / 2;
      var y = row * geom.cellH + geom.cellH / 2;
      var dx = x - geom.w * 0.5;
      var dy = (y + rise) - geom.h * 0.5; // field-space y: pattern translates up as rise grows

      var dist = Math.sqrt(dx * dx + dy * dy);
      var angle = Math.atan2(dy, dx);
      var swirl = angle * 3 + dist * 0.018 - time * 1.4;
      var value = (Math.sin(swirl) + Math.sin(dist * 0.045 - time * 1.8)) * 0.5;
      var bright = (value + 1) / 2;

      var falloff = Math.max(0, 1 - dist / HeroGrid.maxDist(geom));
      var finalB = bright * Math.pow(falloff, HeroGrid.FALLOFF_POW) * swirlAlpha;

      if (finalB < HeroGrid.CULL) return null;

      var ch = PALETTE[Math.min(PALETTE.length - 1, Math.floor(finalB * PALETTE.length))];
      if (finalB > 0.55 && (col + row * 3 + Math.floor(time * 3)) % 37 === 0) {
        ch = TOKENS[(col + row) % TOKENS.length];
      }

      return { ch: ch, alpha: finalB * 0.9 };
    }
  };

  window.HeroGrid = HeroGrid;
})();
