/* AMIN CHI AI — رندر صفحه شطرنج: تعاملی، انیمیشن، پوسته‌ها */
(function (global) {
  'use strict';

  var U = global.AMIN.util;
  var FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  var RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

  /* نمادهای مهره — یونیکد پر و خالی */
  var GLYPH = {
    filled: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
    outline: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' }
  };

  var PIECE_SETS = {
    classic: { name: 'کلاسیک', white: { glyph: GLYPH.filled, cls: 'pc-w' }, black: { glyph: GLYPH.filled, cls: 'pc-b' } },
    outline: { name: 'خطی', white: { glyph: GLYPH.outline, cls: 'pc-w' }, black: { glyph: GLYPH.outline, cls: 'pc-b' } },
    neo: { name: 'نئون', white: { glyph: GLYPH.filled, cls: 'pc-w pc-neon' }, black: { glyph: GLYPH.filled, cls: 'pc-b pc-neon' } },
    gold: { name: 'طلایی', white: { glyph: GLYPH.filled, cls: 'pc-gold' }, black: { glyph: GLYPH.filled, cls: 'pc-dark-gold' } },
    minimal: { name: 'مینیمال', white: { glyph: GLYPH.filled, cls: 'pc-min-w' }, black: { glyph: GLYPH.filled, cls: 'pc-min-b' } }
  };

  var BOARD_THEMES = {
    nebula: { name: 'سحابی', light: 'var(--sq-l-nebula)', dark: 'var(--sq-d-nebula)' },
    ocean: { name: 'اقیانوس', light: 'var(--sq-l-ocean)', dark: 'var(--sq-d-ocean)' },
    forest: { name: 'جنگل', light: 'var(--sq-l-forest)', dark: 'var(--sq-d-forest)' },
    wood: { name: 'چوب کلاسیک', light: 'var(--sq-l-wood)', dark: 'var(--sq-d-wood)' },
    mono: { name: 'مونوکروم', light: 'var(--sq-l-mono)', dark: 'var(--sq-d-mono)' }
  };

  function idxToSquare(f, r, orientation) {
    /* f: ستون بصری ۰..۷ از چپ، r: ردیف بصری ۰..۷ از بالا */
    var file, rank;
    if (orientation === 'black') { file = f; rank = RANKS[7 - r]; }
    else { file = FILES[f]; rank = RANKS[r]; }
    return file + rank;
  }
  function squareToIdx(sq, orientation) {
    var f = FILES.indexOf(sq[0]);
    var rk = sq[1];
    var r = orientation === 'black' ? 7 - RANKS.indexOf('' + rk) : RANKS.indexOf('' + rk);
    /* چیدمان مهره‌ها باید نسبت به صفحه واقعی باشد نه جهت نمایش */
    var fx = orientation === 'black' ? 7 - f : f;
    return { f: fx, r: r };
  }
  function rankIdx(sq) { return RANKS.indexOf('' + sq[1]); }
  function fileIdx(sq) { return FILES.indexOf(sq[0]); }

  function create(opts) {
    opts = opts || {};
    var orientation = opts.orientation || 'white';
    var interactive = opts.interactive !== false;
    var root = U.el('div.chess-board' + (interactive ? '' : '.static'));

    var squaresLayer = U.el('div.squares');
    var piecesLayer = U.el('div.pieces');
    var coordLayer = U.el('div.coords');
    root.appendChild(squaresLayer);
    root.appendChild(coordLayer);
    root.appendChild(piecesLayer);

    var chessRef = null;
    var selected = null;
    var legalTargets = [];
    var lastMove = null;
    var onMove = opts.onMove || function () {};
    var onNeedPromotion = opts.onNeedPromotion || null;
    var showLegal = opts.showLegal !== false;
    var renderSeq = 0;

    function applyThemeVars() {
      var t = BOARD_THEMES[opts.boardTheme] || BOARD_THEMES.nebula;
      root.style.setProperty('--sq-l', t.light);
      root.style.setProperty('--sq-d', t.dark);
    }
    applyThemeVars();

    function buildSquares() {
      squaresLayer.innerHTML = '';
      coordLayer.innerHTML = '';
      for (var r = 0; r < 8; r++) {
        for (var f = 0; f < 8; f++) {
          var sq = idxToSquare(f, r, orientation);
          var fileI = fileIdx(sq), rankI = rankIdx(sq);
          var isLight = (fileI + rankI) % 2 === 0;
          var node = U.el('div.sq' + (isLight ? '.lt' : '.dk'), { 'data-square': sq });
          squaresLayer.appendChild(node);
        }
      }
      /* مختصات */
      if (opts.showCoords !== false) {
        for (var i = 0; i < 8; i++) {
          var cf = U.el('span.coord.file', { text: FILES[i] });
          cf.style.right = (i * 12.5) + '%';
          cf.style.bottom = orientation === 'black' ? '100%' : '0';
          coordLayer.appendChild(cf);
          var cr = U.el('span.coord.rank', { text: U.faNum(8 - i) });
          cr.style.top = (i * 12.5 + 6.25) + '%';
          cr.style.left = orientation === 'black' ? 'calc(100% + 2px)' : '2px';
          coordLayer.appendChild(cr);
        }
      }
    }

    function pieceAt(sq) {
      if (!chessRef) return null;
      return chessRef.get(sq);
    }

    function makePieceEl(square, piece, hidden) {
      var set = PIECE_SETS[opts.pieceSet] || PIECE_SETS.classic;
      var isWhite = piece.color === 'w';
      var conf = isWhite ? set.white : set.black;
      var p = U.el('span.piece.' + conf.cls, {
        'data-square': square,
        'data-piece': piece.type + piece.color,
        text: conf.glyph[piece.type]
      });
      if (hidden) p.classList.add('hidden');
      return p;
    }

    function positionPiece(node, square) {
      var i = squareToIdx(square, orientation);
      node.style.width = '12.5%';
      node.style.height = '12.5%';
      node.style.transform = 'translate(' + (i.f * 100) + '%, ' + (i.r * 100) + '%)';
    }

    function render(chess, renderOpts) {
      renderOpts = renderOpts || {};
      chessRef = chess;
      lastMove = renderOpts.lastMove || null;
      var seq = ++renderSeq;
      selected = null;
      legalTargets = [];
      piecesLayer.innerHTML = '';
      buildSquares();

      var board = chess.board();
      var anim = renderOpts.animate !== false && (global.AMIN.state ? global.AMIN.state.getSettings().animations : true);
      var animatedEl = null;

      board.forEach(function (row, rIdx) {
        row.forEach(function (piece, fIdx) {
          if (!piece) return;
          var rank = '' + (8 - rIdx);
          var sq = FILES[fIdx] + rank;
          var node = makePieceEl(sq, piece);
          positionPiece(node, sq);
          if (anim && lastMove && lastMove.to === sq) {
            /* انیمیشن حرکت: از خانه مبدأ به مقصد */
            var fromI = squareToIdx(lastMove.from, orientation);
            var toI = squareToIdx(lastMove.to, orientation);
            node.style.transition = 'none';
            node.style.transform = 'translate(' + (fromI.f * 100) + '%, ' + (fromI.r * 100) + '%)';
            animatedEl = { node: node, from: fromI, to: toI };
          }
          piecesLayer.appendChild(node);
        });
      });

      /* هایلایت‌ها */
      if (lastMove) {
        ['from', 'to'].forEach(function (k) {
          var s = squaresLayer.querySelector('[data-square="' + lastMove[k] + '"]');
          if (s) s.classList.add('last');
        });
      }
      if (renderOpts.checkSquare) {
        var cs = squaresLayer.querySelector('[data-square="' + renderOpts.checkSquare + '"]');
        if (cs) cs.classList.add('chk');
      }

      if (animatedEl) {
        requestAnimationFrame(function () {
          if (seq !== renderSeq) return;
          animatedEl.node.style.transition = 'transform .18s ease';
          animatedEl.node.style.transform = 'translate(' + (animatedEl.to.f * 100) + '%, ' + (animatedEl.to.r * 100) + '%)';
          setTimeout(function () { animatedEl.node.style.transition = ''; }, 220);
        });
      }
      attachPointerHandlers();
    }

    /* انتخاب و حرکت */
    function select(square) {
      if (!chessRef) return;
      var piece = pieceAt(square);
      if (!piece) { deselect(); return; }
      if (opts.canSelect && !opts.canSelect(square, piece)) { deselect(); return; }
      selected = square;
      legalTargets = chessRef.moves({ square: square, verbose: true });
      refreshHighlights();
      if (legalTargets.length === 0) {
        /* مهره حرکتی ندارد */
      }
    }

    function deselect() {
      selected = null;
      legalTargets = [];
      refreshHighlights();
    }

    function refreshHighlights() {
      squaresLayer.querySelectorAll('.sq').forEach(function (s) {
        s.classList.remove('sel', 'mv', 'cap', 'hint');
      });
      if (selected) {
        var s0 = squaresLayer.querySelector('[data-square="' + selected + '"]');
        if (s0) s0.classList.add('sel');
        if (showLegal) {
          legalTargets.forEach(function (m) {
            var s = squaresLayer.querySelector('[data-square="' + m.to + '"]');
            if (s) s.classList.add(m.captured || (m.flags && m.flags.indexOf('e') >= 0) ? 'cap' : 'mv');
          });
        }
      }
      if (opts.hintMove) {
        ['from', 'to'].forEach(function (k) {
          var s = squaresLayer.querySelector('[data-square="' + opts.hintMove[k] + '"]');
          if (s) s.classList.add('hint');
        });
      }
    }

    function squareFromPoint(x, y) {
      var rect = root.getBoundingClientRect();
      var fx = Math.floor(((x - rect.left) / rect.width) * 8);
      var fy = Math.floor(((y - rect.top) / rect.height) * 8);
      if (fx < 0 || fx > 7 || fy < 0 || fy > 7) return null;
      return idxToSquare(fx, fy, orientation);
    }

    function tryMove(from, to) {
      var moves = chessRef ? chessRef.moves({ square: from, verbose: true }) : [];
      var matching = moves.filter(function (m) { return m.to === to; });
      if (!matching.length) { global.AMIN.sound.play('click'); deselect(); return false; }
      if (matching.some(function (m) { return m.promotion; })) {
        if (onNeedPromotion) {
          onNeedPromotion(from, to, function (promo) {
            var m = matching.filter(function (x) { return x.promotion === promo; })[0] || matching[0];
            onMove({ from: from, to: to, promotion: promo, san: m.san });
          });
          return true;
        }
        var def = matching[0];
        onMove({ from: from, to: to, promotion: def.promotion, san: def.san });
        return true;
      }
      var mv = matching[0];
      onMove({ from: from, to: to, promotion: null, san: mv.san });
      return true;
    }

    /* رویدادهای pointer (لمس + ماوس) */
    var dragState = null;
    function attachPointerHandlers() {
      if (!interactive || dragState) return;
      root.onpointerdown = function (e) {
        var sq = squareFromPoint(e.clientX, e.clientY);
        if (!sq) return;
        var piece = pieceAt(sq);
        if (selected && legalTargets.some(function (m) { return m.to === sq; })) {
          tryMove(selected, sq);
          e.preventDefault();
          return;
        }
        if (piece && (!opts.canSelect || opts.canSelect(sq, piece))) {
          if (selected === sq) { deselect(); return; }
          select(sq);
          if (legalTargets.length) {
            dragState = { square: sq, node: piecesLayer.querySelector('[data-square="' + sq + '"]'), startX: e.clientX, startY: e.clientY, moved: false };
            try { root.setPointerCapture(e.pointerId); } catch (err) {}
            if (dragState.node) {
              dragState.node.style.transition = 'none';
              dragState.node.classList.add('dragging');
            }
          }
          e.preventDefault();
        } else {
          deselect();
        }
      };
      root.onpointermove = function (e) {
        if (!dragState) return;
        dragState.moved = true;
        var rect = root.getBoundingClientRect();
        var size = rect.width / 8;
        var i = squareToIdx(dragState.square, orientation);
        var dx = (e.clientX - dragState.startX) / size;
        var dy = (e.clientY - dragState.startY) / size;
        if (dragState.node) {
          dragState.node.style.transform = 'translate(' + ((i.f + dx) * 100) + '%, ' + ((i.r + dy) * 100) + '%)';
        }
      };
      root.onpointerup = function (e) {
        if (!dragState) return;
        var st = dragState; dragState = null;
        if (st.node) { st.node.classList.remove('dragging'); st.node.style.transition = ''; }
        var sq = squareFromPoint(e.clientX, e.clientY);
        if (st.moved && sq && sq !== st.square) {
          var ok = tryMove(st.square, sq);
          if (!ok) render(chessRef, { lastMove: lastMove });
        } else if (!st.moved) {
          /* تپ ساده — انتخاب انجام شده است */
        }
      };
      root.onpointercancel = function () {
        if (dragState && dragState.node) { dragState.node.classList.remove('dragging'); dragState.node.style.transition = ''; }
        dragState = null;
      };
    }

    function setOrientation(o) {
      orientation = o;
      if (chessRef) render(chessRef, { lastMove: lastMove });
    }
    function getOrientation() { return orientation; }
    function setHint(move) { opts.hintMove = move; refreshHighlights(); }
    function clearHint() { opts.hintMove = null; refreshHighlights(); }

    /* برای پیش‌نمایش‌ها */
    root.render = render;
    root.setOrientation = setOrientation;
    root.getOrientation = getOrientation;
    root.setHint = setHint;
    root.clearHint = clearHint;
    root.refresh = function () { if (chessRef) render(chessRef, { lastMove: lastMove, checkSquare: currentCheckSquare() }); };
    root.boardThemeName = function (name) { opts.boardTheme = name; applyThemeVars(); buildSquares(); if (chessRef) render(chessRef, { lastMove: lastMove }); };

    function currentCheckSquare() {
      if (!chessRef || !chessRef.in_check()) return null;
      var turn = chessRef.turn();
      var b = chessRef.board();
      for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
        var p = b[r][f];
        if (p && p.type === 'k' && p.color === turn) return FILES[f] + (8 - r);
      }
      return null;
    }

    return {
      el: root, render: render, setOrientation: setOrientation, getOrientation: getOrientation,
      setHint: setHint, clearHint: clearHint, refresh: root.refresh, BOARD_THEMES: BOARD_THEMES, PIECE_SETS: PIECE_SETS
    };
  }

  /* صفحه کوچک استاتیک برای آموزش/پیش‌نمایش */
  function mini(fen, movesSan, opts) {
    opts = opts || {};
    var chess = new global.Chess(fen || undefined);
    var size = opts.size || 'small';
    var b = create({ interactive: false, boardTheme: opts.boardTheme, pieceSet: opts.pieceSet, showCoords: false });
    b.el.classList.add('mini', size);
    b.render(chess, { animate: false });
    var wrap = U.el('div.mini-wrap', b.el);
    wrap.goTo = function (i) {
      chess = new global.Chess(fen || undefined);
      var applied = 0;
      if (movesSan) {
        for (var k = 0; k < Math.min(i, movesSan.length); k++) { chess.move(movesSan[k]); applied++; }
      }
      b.render(chess, { animate: false, lastMove: applied > 0 ? chess.history({ verbose: true }).slice(-1)[0] : null });
    };
    wrap.board = b;
    return wrap;
  }

  global.AMIN = global.AMIN || {};
  global.AMIN.ui = global.AMIN.ui || {};
  global.AMIN.ui.board = { create: create, mini: mini, PIECE_SETS: PIECE_SETS, BOARD_THEMES: BOARD_THEMES };
})(window);
