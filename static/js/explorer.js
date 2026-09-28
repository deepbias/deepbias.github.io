// Interactive "direct vs. reframed" explorer for Olmo-3-7B-SFT. Data: static/js/explorer-data.js
(function () {
  var DATA = window.EXPLORER_DATA;
  var root = document.getElementById('explorer');
  if (!DATA || !root) return;

  var N = 30;
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DOT_STEP = REDUCED ? 0 : 22;     // ms between sample dots
  var BAR_DELAY = REDUCED ? 0 : 350;   // ms before bars start growing
  var TYPE = {
    deep: {label: 'Deep bias', cls: 'is-deep', why: 'The top answer survives reframing (π > 0.40).'},
    shallow: {label: 'Shallow bias', cls: 'is-shallow', why: 'The top answer does not survive reframing (π ≤ 0.40).'}
  };
  var GROUPS = [['deep', 'Deep bias'], ['shallow', 'Shallow bias']];
  var current = 0;
  var shownPi = 0;
  var selected = null;   // framed answer highlighted in the reframing list
  var listOpen = false;  // the list stays hidden until the reader asks for it

  function $(sel) { return root.querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function fmt(x) { return x.toFixed(2); }

  // Animate a number from `from` to `to`, calling `draw` on every frame.
  function countTo(from, to, ms, draw) {
    if (REDUCED) { draw(to); return; }
    var t0 = null;
    function step(t) {
      if (t0 === null) t0 = t;
      var k = Math.min(1, (t - t0) / ms);
      var e = 1 - Math.pow(1 - k, 3);
      draw(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    // Guarantee the exact final value even if frames are throttled (background tabs).
    setTimeout(function () { draw(to); }, ms + 60);
  }

  // Prompt selector and navigation.
  var select = $('#ex-prompt');
  GROUPS.forEach(function (g) {
    var og = document.createElement('optgroup');
    og.label = g[1];
    DATA.prompts.forEach(function (p, i) {
      if (p.group !== g[0]) return;
      var o = el('option', null, p.prompt);
      o.value = i;
      og.appendChild(o);
    });
    select.appendChild(og);
  });
  select.addEventListener('change', function () { current = +select.value; render(); });
  $('#ex-shuffle').addEventListener('click', function () {
    var next = current;
    while (next === current) next = Math.floor(Math.random() * DATA.prompts.length);
    current = next;
    render();
  });

  $('#ex-toggle').addEventListener('click', function () {
    if (listOpen) {
      selected = null;
      highlight(null);
      setOpen(false);
    } else {
      setOpen(true);
    }
  });

  function colorFor(answer, top, framedTop, framed) {
    if (answer === null) return 'is-other';
    if (answer === top) return 'is-top';
    return framed && answer === framedTop ? 'is-shift' : 'is-rest';
  }

  // One dot per sample, grouped by answer, popping in one after another.
  function drawDots(container, bars, colorOf, onPick) {
    container.innerHTML = '';
    var i = 0;
    bars.forEach(function (b) {
      for (var k = 0; k < b[1]; k++) {
        var d = el('span', 'ex-dot ' + colorOf(b[0]));
        d.style.animationDelay = (i * DOT_STEP) + 'ms';
        d.title = b[0] === null ? 'other answer' : b[0];
        d.dataset.answer = b[0] === null ? '' : b[0];
        if (onPick && b[0] !== null) {
          d.classList.add('is-clickable');
          d.addEventListener('click', onPick.bind(null, b[0]));
        }
        container.appendChild(d);
        i++;
      }
    });
  }

  function drawBars(container, bars, rows, colorOf, onPick) {
    container.innerHTML = '';
    var fills = [];
    for (var i = 0; i < rows; i++) {
      var b = bars[i];
      var row = el('div', 'ex-row' + (b ? '' : ' is-empty'));
      if (b) {
        var name = b[0] === null ? 'others' : b[0];
        var label = el('span', 'ex-label' + (b[0] === null ? ' is-others' : ''), name);
        label.title = name;
        var track = el('span', 'ex-track');
        var fill = el('span', 'ex-fill ' + colorOf(b[0]));
        fill.style.transitionDelay = (BAR_DELAY + i * 90) + 'ms';
        track.appendChild(fill);
        row.appendChild(label);
        row.appendChild(track);
        row.appendChild(el('span', 'ex-count', b[1]));
        row.dataset.answer = b[0] === null ? '' : b[0];
        if (onPick && b[0] !== null) {
          row.classList.add('is-clickable');
          row.setAttribute('role', 'button');
          row.setAttribute('tabindex', '0');
          row.setAttribute('aria-label', 'Show reframings answered ' + b[0]);
          row.addEventListener('click', onPick.bind(null, b[0]));
          row.addEventListener('keydown', function (answer, e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(answer); }
          }.bind(null, b[0]));
        }
        fills.push([fill, b[1]]);
      }
      container.appendChild(row);
    }
    // Start from zero width, then grow on the next frames so the transition runs.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        fills.forEach(function (f) { f[0].style.width = (100 * f[1] / N) + '%'; });
      });
    });
  }

  // Highlight one answer's bar and dots in the reframing panel (null clears it).
  function highlight(answer) {
    [].forEach.call(root.querySelectorAll('#ex-framed .ex-row, #ex-framed-dots .ex-dot'), function (n) {
      var on = answer !== null && n.dataset.answer === answer;
      n.classList.toggle('is-selected', on);
      n.classList.toggle('is-dimmed', answer !== null && !on);
    });
  }

  function setOpen(open) {
    listOpen = open;
    $('#ex-behind').hidden = !open;
    var btn = $('#ex-toggle');
    btn.setAttribute('aria-expanded', open);
    btn.querySelector('span').textContent = open ? 'Hide reframings' : 'Show all 30 reframings';
    btn.classList.toggle('is-open', open);
  }

  // Fill the list with all 30 reframings and the model's answer to each.
  function drawList(p, colorOf) {
    var n = selected === null ? 0 : p.reframings.filter(function (x) { return x[2] === selected; }).length;
    var title = $('#ex-behind-title');
    title.innerHTML = '';
    title.appendChild(document.createTextNode('All 30 reframings and the model\u2019s answer'));
    if (selected !== null) {
      title.appendChild(document.createTextNode(' \u00b7 highlighting '));
      title.appendChild(el('span', 'ex-chip ' + colorOf(selected), selected));
      title.appendChild(document.createTextNode(' (' + n + ' of 30)'));
    }
    var ol = $('#ex-behind-list');
    ol.innerHTML = '';
    var first = null;
    p.reframings.forEach(function (x, i) {
      var li = el('li', 'ex-item');
      if (selected !== null) li.classList.add(x[2] === selected ? 'is-selected' : 'is-dimmed');
      li.style.animationDelay = (REDUCED ? 0 : Math.min(i, 20) * 20) + 'ms';
      li.appendChild(el('span', 'ex-item-text', x[0]));
      var ans = el('span', 'ex-chip ' + colorOf(x[2]), x[1]);
      ans.title = x[1];
      li.appendChild(ans);
      ol.appendChild(li);
      if (first === null && selected !== null && x[2] === selected) first = li;
    });
    ol.scrollTop = 0;
    if (first) ol.scrollTop = first.offsetTop - ol.offsetTop - 6;
  }

  function render() {
    var p = DATA.prompts[current];
    select.value = current;
    var named = p.f.filter(function (b) { return b[0] !== null; });
    var framedTop = named.length ? named[0][0] : null;
    var direct = function (a) { return colorFor(a, p.top, framedTop, false); };
    var framed = function (a) { return colorFor(a, p.top, framedTop, true); };

    $('#ex-prompt-text').textContent = '“' + p.prompt + '.”';
    $('#ex-framing').textContent = '“' + p.framing + '”';

    var pick = function (answer) {
      selected = selected === answer ? null : answer;  // clicking again clears the highlight
      highlight(selected);
      setOpen(true);
      drawList(p, framed);
    };
    drawDots($('#ex-direct-dots'), p.d, direct);
    drawDots($('#ex-framed-dots'), p.f, framed, pick);
    // Pad both panels to the same number of rows so the bars line up side by side.
    var rows = Math.max(p.d.length, p.f.length);
    drawBars($('#ex-direct'), p.d, rows, direct);
    drawBars($('#ex-framed'), p.f, rows, framed, pick);
    // New question: clear the highlight; keep the list open if the reader opened it.
    selected = null;
    drawList(p, framed);

    var drN = Math.round(p.dr * N), frN = Math.round(p.fr * N);
    countTo(0, drN, 700, function (v) {
      $('#ex-dr').textContent = 'DR = ' + Math.round(v) + '/30 = ' + fmt(Math.round(v) / N);
    });
    countTo(0, frN, 700, function (v) {
      $('#ex-fr').textContent = 'FR = ' + Math.round(v) + '/30 = ' + fmt(Math.round(v) / N);
    });
    $('#ex-pi').textContent = 'π = DR × FR = ' + fmt(p.dr) + ' × ' + fmt(p.fr) + ' = ' + fmt(p.pi);

    // Slide the gauge needle from the previous score to the new one.
    var needle = $('#ex-needle');
    var t = TYPE[p.type];
    needle.className = 'ex-needle ' + t.cls;
    needle.style.left = (100 * p.pi) + '%';
    var from = shownPi;
    shownPi = p.pi;
    countTo(from, p.pi, 900, function (v) { $('#ex-needle-val').textContent = fmt(v); });

    var tag = $('#ex-type');
    tag.textContent = t.label;
    tag.className = 'tag is-medium ex-type ' + t.cls;
    // Restart the pop animation on the label.
    tag.classList.remove('is-popping');
    void tag.offsetWidth;
    tag.classList.add('is-popping');
    $('#ex-why').textContent = t.why;
  }

  render();
})();
