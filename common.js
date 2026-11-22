// Shared helpers for the voting page and the host page.
var Ballot = (function () {
  "use strict";
  var scriptUrl = String((window.BALLOT_CONFIG || {}).scriptUrl || "").trim();

  function ready() { return /^https:\/\/script\.google\.com\/.+\/exec$/.test(scriptUrl); }

  // Element builder. Text always goes in as text nodes, never as HTML.
  function h(tag, attrs) {
    var e = document.createElement(tag), k, v;
    if (attrs) for (k in attrs) {
      v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else if (k === "value" || k === "checked" || k === "disabled" || k === "readOnly" || k === "selected") e[k] = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    (function add(list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c == null || c === false) continue;
        if (Array.isArray(c)) add(c);
        else e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
      }
    })(Array.prototype.slice.call(arguments, 2));
    return e;
  }
  function str(x) { return typeof x === "string" ? x.trim() : (typeof x === "number" ? String(x) : ""); }
  function num(x) { var n = typeof x === "number" ? x : parseInt(x, 10); return isFinite(n) && n > 0 ? n : null; }
  function rid() { return Math.random().toString(36).slice(2, 10); }
  function scoreOf(label) { var m = /^\s*(-?\d+(?:\.\d+)?)/.exec(String(label || "")); return m ? parseFloat(m[1]) : null; }

  function asJson(r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }
  function get(action) { return fetch(scriptUrl + "?action=" + encodeURIComponent(action), { redirect: "follow" }).then(asJson); }
  // Sent as plain text on purpose: Apps Script web apps cannot answer the browser's pre-flight check for JSON posts.
  function post(body) { return fetch(scriptUrl, { method: "POST", redirect: "follow", body: JSON.stringify(body) }).then(asJson); }

  function posterUrl(m, size) { return /^\/[\w.\-]+$/.test(m.poster || "") ? "https://image.tmdb.org/t/p/" + (size || "w342") + m.poster : ""; }
  function trailerKey(m) { return /^[\w\-]{6,20}$/.test(m.trailer || "") ? m.trailer : ""; }
  function trailerSearch(m) { return "https://www.youtube.com/results?search_query=" + encodeURIComponent(m.title + (m.year ? " " + m.year : "") + " official trailer"); }
  function facts(m) {
    var a = [];
    if (m.year) a.push(m.year);
    if (m.kind === "tv") a.push("Series" + (m.seasons ? ", " + m.seasons + (m.seasons === 1 ? " season" : " seasons") : ""));
    if (m.runtime) a.push(m.runtime + " min");
    if (m.genre) a.push(m.genre);
    return a.join(" · ");
  }
  function byline(m) { return m.director ? (m.kind === "tv" ? "Created by " : "Directed by ") + m.director : ""; }
  // Compact strip of faces: director or creator first, then lead cast. Falls back to plain text for titles saved without people.
  function peopleStrip(m) {
    var list = Array.isArray(m.people) ? m.people.filter(function (p) { return p && str(p.name); }) : [];
    if (!list.length) {
      var line = [byline(m), m.cast ? "With " + m.cast : ""].filter(Boolean).join(" · ");
      return line ? h("div", { class: "facts" }, line) : null;
    }
    return h("div", { class: "people" }, list.map(function (p) {
      var name = str(p.name), initials = name.split(/\s+/).map(function (w) { return w.charAt(0); }).slice(0, 2).join("").toUpperCase();
      var photo = /^\/[\w.\-]+$/.test(p.photo || "") ? "https://image.tmdb.org/t/p/w185" + p.photo : "";
      return h("div", { class: "person" },
        h("span", { class: "face" }, photo ? h("img", { src: photo, alt: "", loading: "lazy" }) : initials),
        h("span", { class: "person-text" }, h("span", { class: "person-name" }, name), h("span", { class: "person-role" }, str(p.role) || "Cast")));
    }));
  }
  function reel(i) { return (i < 9 ? "0" : "") + (i + 1); }
  function posterTile(m, i, cls) {
    var u = posterUrl(m);
    return h("div", { class: "poster" + (cls ? " " + cls : "") }, u ? h("img", { src: u, alt: "Poster for " + m.title, loading: "lazy" }) : h("span", { class: "reel", "aria-hidden": "true" }, reel(i)));
  }

  function tally(poll, votes) {
    var rows = poll.movies.map(function (m) {
      var counts = {}, sum = 0, n = 0;
      votes.forEach(function (v) {
        var a = v.answers && v.answers[m.id]; if (!a) return;
        counts[a] = (counts[a] || 0) + 1;
        var s = scoreOf(a); if (s != null) { sum += s; n++; }
      });
      return { m: m, counts: counts, n: n, avg: n ? sum / n : null };
    });
    rows.sort(function (a, b) { if (a.avg == null && b.avg == null) return 0; if (a.avg == null) return 1; if (b.avg == null) return -1; return b.avg - a.avg; });
    return rows;
  }

  // Results block used by both pages. opts.onRemove(vote, button) adds a Remove column for the host.
  function resultsNodes(poll, votes, opts) {
    opts = opts || {};
    var out = [], rows = tally(poll, votes), items = {};
    poll.movies.forEach(function (m) { items[m.id] = { key: (m.title + " " + (m.year || "")).toLowerCase(), els: [] }; });
    var track = function (m, el) { items[m.id].els.push(el); return el; };
    var scores = poll.scale.map(scoreOf).filter(function (x) { return x != null; });
    var max = scores.length ? Math.max.apply(null, scores) : null;
    out.push(h("div", { class: "row" }, h("h2", null, votes.length + (votes.length === 1 ? " response" : " responses")),
      max != null ? h("span", { class: "muted small" }, "Ranked by average rating, out of " + max) : null));
    if (opts.search && poll.movies.length > 1) {
      var count = h("span", { class: "muted small", role: "status" });
      out.push(h("div", { class: "row" },
        h("label", { class: "f", for: "result-filter", style: "flex:1;min-width:220px" }, "Find a title",
          h("input", { type: "text", id: "result-filter", placeholder: "Type part of a title", autocomplete: "off", oninput: function (e) {
            var words = e.target.value.toLowerCase().split(/\s+/).filter(Boolean), shown = 0, id;
            for (id in items) {
              var ok = words.every(function (w) { return items[id].key.indexOf(w) >= 0; });
              items[id].els.forEach(function (el) { el.hidden = !ok; });
              if (ok) shown++;
            }
            count.textContent = words.length ? shown + " of " + poll.movies.length + " titles match" : "";
          } })),
        count));
    }
    rows.forEach(function (r, i) {
      var chips = [];
      poll.scale.forEach(function (l) { if (r.counts[l]) chips.push(h("span", { class: "chip" }, l + " × " + r.counts[l])); });
      out.push(track(r.m, h("article", { class: "card rank" },
        h("div", { class: "reel", "aria-hidden": "true" }, reel(i)),
        h("div", { class: "film-body" },
          h("h3", null, r.m.title + (r.m.year ? " (" + r.m.year + ")" : "")),
          (max && r.avg != null) ? h("div", { class: "bar", role: "img", "aria-label": "Average " + r.avg.toFixed(1) + " out of " + max }, h("i", { style: "width:" + Math.max(0, Math.min(100, r.avg / max * 100)).toFixed(1) + "%" })) : null,
          chips.length ? h("div", { class: "chips" }, chips) : h("div", { class: "muted small" }, "No ratings yet")),
        h("div", null, h("div", { class: "avg" }, r.avg != null ? r.avg.toFixed(1) : "–"), h("div", { class: "muted small" }, r.n + " rated")))));
    });
    if (votes.length) {
      out.push(h("h2", null, "Everyone’s ratings"));
      out.push(h("div", { class: "card scroll" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "Name"), poll.movies.map(function (m) { return track(m, h("th", null, m.title)); }), opts.onRemove ? h("th", null, "") : null)),
        h("tbody", null, votes.map(function (v) {
          return h("tr", null, h("td", null, str(v.name) || "Someone"),
            poll.movies.map(function (m) { return track(m, h("td", { class: "n" }, str(v.answers && v.answers[m.id]) || "–")); }),
            opts.onRemove ? h("td", null, h("button", { class: "btn ghost small", type: "button", onclick: function (e) { opts.onRemove(v, e.target); } }, "Remove")) : null);
        })))));
      var notes = votes.filter(function (v) { return str(v.comment); });
      if (notes.length) {
        out.push(h("h2", null, "Comments"));
        out.push(h("div", { class: "card stack" }, notes.map(function (v) { return h("p", { class: "blurb" }, h("strong", null, (str(v.name) || "Someone") + ": "), str(v.comment)); })));
      }
    }
    return out;
  }

  function credit() {
    return h("footer", null, "Film details, posters and trailers come from ", h("a", { href: "https://www.themoviedb.org/", target: "_blank", rel: "noopener noreferrer" }, "TMDB"),
      ". This product uses the TMDB API but is not endorsed or certified by TMDB.");
  }

  return { ready: ready, h: h, str: str, num: num, rid: rid, scoreOf: scoreOf, get: get, post: post, posterUrl: posterUrl, trailerKey: trailerKey,
    trailerSearch: trailerSearch, facts: facts, byline: byline, peopleStrip: peopleStrip, reel: reel, posterTile: posterTile, resultsNodes: resultsNodes, credit: credit };
})();
