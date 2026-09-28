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

  function colorFor(answer, top, framedTop, framed) {
    if (answer === null) return 'is-other';
    if (answer === top) return 'is-top';
    return framed && answer === framedTop ? 'is-shift' : 'is-rest';
  }

  // One dot per sample, grouped by answer, popping in one after another.
  function drawDots(container, bars, colorOf) {
    container.innerHTML = '';
    var i = 0;
    bars.forEach(function (b) {
      for (var k = 0; k < b[1]; k++) {
        var d = el('span', 'ex-dot ' + colorOf(b[0]));
        d.style.animationDelay = (i * DOT_STEP) + 'ms';
        d.title = b[0] === null ? 'other answer' : b[0];
        container.appendChild(d);
        i++;
      }
    });
  }

  function drawBars(container, bars, rows, colorOf) {
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

  function render() {
    var p = DATA.prompts[current];
    select.value = current;
    var named = p.f.filter(function (b) { return b[0] !== null; });
    var framedTop = named.length ? named[0][0] : null;
    var direct = function (a) { return colorFor(a, p.top, framedTop, false); };
    var framed = function (a) { return colorFor(a, p.top, framedTop, true); };

    $('#ex-prompt-text').textContent = '“' + p.prompt + '.”';
    $('#ex-framing').textContent = '“' + p.framing + '”';

    drawDots($('#ex-direct-dots'), p.d, direct);
    drawDots($('#ex-framed-dots'), p.f, framed);
    // Pad both panels to the same number of rows so the bars line up side by side.
    var rows = Math.max(p.d.length, p.f.length);
    drawBars($('#ex-direct'), p.d, rows, direct);
    drawBars($('#ex-framed'), p.f, rows, framed);

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
