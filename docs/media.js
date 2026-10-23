// Videá a virtuálne prehliadky – spoločné pre aplikáciu maklérov aj verejnú stránku ponuky.
// Videá sa ukladajú v stĺpci `video` – každé na novom riadku (staré ponuky s jedným odkazom fungujú ďalej).
(function () {
  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function upravUrl(u) {
    u = String(u || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u) && /^[\w-]+(\.[\w-]+)+(\/|$)/.test(u)) u = "https://" + u;
    return u;
  }
  // len odkazy http(s); javascript: a data: sa nikdy nedostanú do iframe ani videa
  function parsuj(u) { try { var x = new URL(u); return /^https?:$/.test(x.protocol) ? x : null; } catch (e) { return null; } }
  function host(x) { return x ? x.hostname.replace(/^(www|m)\./, "").toLowerCase() : ""; }

  // text zo stĺpca → zoznam odkazov
  function zoznam(v) {
    var arr = Array.isArray(v) ? v : String(v || "").split(/[\r\n]+|\s+(?=https?:\/\/)/);
    return arr.map(upravUrl).filter(Boolean);
  }
  function spoj(arr) { return (arr || []).map(upravUrl).filter(Boolean).join("\n"); }

  // čas začiatku z YouTube odkazu (t=90, t=1m30s)
  function zaciatok(x) {
    var t = x.searchParams.get("t") || x.searchParams.get("start") || "";
    if (/^\d+$/.test(t)) return Number(t);
    var m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    return m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0;
  }

  // ---------- video
  function video(url) {
    url = upravUrl(url);
    var x = parsuj(url), h = host(x), m, id;
    var o = { url: url, typ: "odkaz", nazov: "Odkaz", vysoke: false, embed: "", nahlad: "" };
    if (!x) return o;
    if (/(^|\.)(youtube\.com|youtube-nocookie\.com)$/.test(h) || h === "youtu.be") {
      if (h === "youtu.be") id = x.pathname.slice(1, 12);
      else if ((m = x.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/))) id = m[2];
      else id = x.searchParams.get("v");
      if (id && /^[\w-]{11}$/.test(id)) {
        var shorts = /^\/shorts\//.test(x.pathname), st = zaciatok(x);
        return { url: url, typ: "youtube", id: id, vysoke: shorts, istota: shorts, nazov: shorts ? "YouTube Shorts" : "YouTube video",
          embed: "https://www.youtube-nocookie.com/embed/" + id + "?rel=0&modestbranding=1&playsinline=1" + (st ? "&start=" + st : ""),
          nahlad: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg" };
      }
    }
    if (/(^|\.)vimeo\.com$/.test(h) && (m = x.pathname.match(/(?:^|\/)(\d{6,})(?:\/([\da-f]{6,}))?/))) {
      return { url: url, typ: "vimeo", id: m[1], nazov: "Vimeo video", vysoke: false,
        embed: "https://player.vimeo.com/video/" + m[1] + "?dnt=1&title=0&byline=0" + (m[2] ? "&h=" + m[2] : (x.searchParams.get("h") ? "&h=" + x.searchParams.get("h") : "")) };
    }
    if (/(^|\.)tiktok\.com$/.test(h) && (m = x.pathname.match(/\/video\/(\d+)/))) {
      return { url: url, typ: "tiktok", id: m[1], nazov: "TikTok", vysoke: true, istota: true, embed: "https://www.tiktok.com/embed/v2/" + m[1] };
    }
    if (/(^|\.)instagram\.com$/.test(h) && (m = x.pathname.match(/^\/(reels?|p|tv)\/([\w-]+)/))) {
      return { url: url, typ: "instagram", id: m[2], nazov: "Instagram Reels", vysoke: true, istota: true, embed: "https://www.instagram.com/" + (m[1] === "reels" ? "reel" : m[1]) + "/" + m[2] + "/embed" };
    }
    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(x.pathname)) return { url: url, typ: "subor", nazov: "Video súbor", vysoke: false, embed: url };
    return o;
  }

  // ---------- virtuálna prehliadka
  function prehliadka(url) {
    url = upravUrl(url);
    var x = parsuj(url), h = host(x), m;
    if (!x) return null;
    if (/matterport\.com$/.test(h)) {
      var mid = x.searchParams.get("m") || ((m = x.pathname.match(/\/(?:show|models)\/?([\w]+)?/)) && m[1]);
      if (mid) return { url: url, zdroj: "Matterport", embed: "https://my.matterport.com/show/?m=" + mid + "&play=1&qs=1&brand=0&help=0&title=0" };
    }
    if (/kuula\.co$/.test(h)) {
      if ((m = x.pathname.match(/^\/post\/([\w]+)/))) return { url: url, zdroj: "Kuula", embed: "https://kuula.co/share/" + m[1] + "?fs=1&vr=1&thumbs=1&info=0&logo=-1" };
      return { url: url, zdroj: "Kuula", embed: url };
    }
    if ((h === "youtube.com" || h === "youtu.be") && video(url).id) return { url: url, zdroj: "YouTube 360°", embed: video(url).embed };
    var mena = { "my.matterport.com": "Matterport", "momento360.com": "Momento360", "panoee.com": "Panoee", "cloudpano.com": "CloudPano", "eyespy360.com": "EyeSpy360",
      "3dvista.com": "3DVista", "roundme.com": "Roundme", "realsee.ai": "Realsee", "giraffe360.com": "Giraffe360", "ricoh360.com": "RICOH360" };
    var zdroj = Object.keys(mena).find(function (k) { return h === k || h.slice(-k.length - 1) === "." + k; });
    return { url: url, zdroj: zdroj ? mena[zdroj] : h, embed: url };
  }

  // ---------- HTML
  var IK = {
    fs: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    von: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    tour: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3V9Z" fill="currentColor"/></svg>'
  };
  function htmlPrehliadka(url, opt) {
    opt = opt || {};
    var t = prehliadka(url); if (!t) return "";
    return '<div class="tm-okno tm-3d">' +
      '<div class="tm-hlava"><span class="tm-ik">' + IK.tour + '</span><span class="tm-tit"><b>' + esc(opt.nadpis || "Virtuálna prehliadka 3D") + "</b><small>" + esc(t.zdroj) + "</small></span>" +
      '<span class="tm-akcie"><button type="button" class="tm-btn" data-tm-fs title="Na celú obrazovku">' + IK.fs + "<span>Celá obrazovka</span></button>" +
      '<a class="tm-btn" href="' + esc(t.url) + '" target="_blank" rel="noopener" title="Otvoriť v novom okne">' + IK.von + "<span>Otvoriť</span></a></span></div>" +
      '<div class="tm-ramec tm-169 tm-3d-ramec"><div class="tm-nacitava"><span class="tm-spin"></span>Načítavam prehliadku…</div>' +
      '<iframe src="' + esc(t.embed) + '" title="Virtuálna prehliadka" allow="fullscreen; autoplay; xr-spatial-tracking; gyroscope; accelerometer; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div></div>';
  }
  function htmlVideo(v, n, spolu) {
    var titul = spolu > 1 ? "Video " + (n + 1) : "Video";
    var ramec;
    if (v.typ === "subor") ramec = '<video src="' + esc(v.embed) + '" controls preload="metadata" playsinline></video>';
    else if (v.embed) ramec = '<div class="tm-nacitava"><span class="tm-spin"></span>Načítavam video…</div><iframe src="' + esc(v.embed) + '" title="' + esc(titul) + '" loading="lazy" ' +
      'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    else return '<a class="tm-okno tm-video tm-odkaz" href="' + esc(v.url) + '" target="_blank" rel="noopener"><span class="tm-ik">' + IK.play + '</span><span class="tm-tit"><b>' + esc(titul) + "</b><small>" + esc(host(parsuj(v.url)) || v.url) + "</small></span>" + IK.von + "</a>";
    return '<figure class="tm-okno tm-video' + (v.vysoke ? " tm-vysoke" : "") + '"' + (v.typ === "youtube" && !v.istota ? ' data-tm-yt="' + esc(v.id) + '"' : "") + ">" +
      '<div class="tm-ramec ' + (v.vysoke ? "tm-916" : "tm-169") + '">' + ramec + "</div>" +
      '<figcaption><span class="tm-typ">' + IK.play + '<span data-tm-nazov>' + esc(v.nazov) + "</span></span>" +
      '<a href="' + esc(v.url) + '" target="_blank" rel="noopener" class="tm-von">Otvoriť ' + IK.von + "</a></figcaption></figure>";
  }
  function htmlVidea(text) {
    var V = zoznam(text).map(video); if (!V.length) return "";
    return '<div class="tm-videa">' + V.map(function (v, n) { return htmlVideo(v, n, V.length); }).join("") + "</div>";
  }
  function htmlVsetko(p, opt) {
    opt = opt || {};
    var t = p.virtualna_prehliadka ? htmlPrehliadka(p.virtualna_prehliadka) : "", v = htmlVidea(p.video);
    return t || v ? '<div class="tm-media">' + t + v + "</div>" : "";
  }

  // ---------- Shorts aj pri bežnom odkaze: Shorts majú na YouTube náhľad na výšku (oardefault)
  var shortsCache = {};
  function jeShorts(id) {
    if (shortsCache[id]) return shortsCache[id];
    return (shortsCache[id] = new Promise(function (ok) {
      var im = new Image();
      im.onload = function () { ok(im.naturalHeight > im.naturalWidth); };
      im.onerror = function () { ok(false); };
      im.src = "https://i.ytimg.com/vi/" + id + "/oardefault.jpg";
    }));
  }
  function naShorts(fig) {
    fig.classList.add("tm-vysoke");
    var r = fig.querySelector(".tm-ramec"); if (r) { r.classList.remove("tm-169"); r.classList.add("tm-916"); }
    var nz = fig.querySelector("[data-tm-nazov]"); if (nz) nz.textContent = "YouTube Shorts";
  }
  function napoj(root) {
    root = root || document;
    root.querySelectorAll(".tm-ramec iframe").forEach(function (f) {
      f.addEventListener("load", function () { f.parentNode.classList.add("tm-hotovo"); });
    });
    root.querySelectorAll("[data-tm-yt]").forEach(function (fig) {
      var id = fig.getAttribute("data-tm-yt"); fig.removeAttribute("data-tm-yt");
      jeShorts(id).then(function (s) { if (s) naShorts(fig); });
    });
    root.querySelectorAll("[data-tm-fs]").forEach(function (b) {
      b.onclick = function () {
        var okno = b.closest(".tm-okno"), r = okno.querySelector(".tm-ramec");
        var fn = r.requestFullscreen || r.webkitRequestFullscreen;
        if (fn) { var x = fn.call(r); if (x && x.catch) x.catch(function () { window.open(okno.querySelector("a.tm-btn").href, "_blank", "noopener"); }); }
        else window.open(okno.querySelector("a.tm-btn").href, "_blank", "noopener");
      };
    });
  }

  window.TYPEK_MEDIA = { zoznam: zoznam, spoj: spoj, video: video, prehliadka: prehliadka, jeShorts: jeShorts,
    htmlPrehliadka: htmlPrehliadka, htmlVidea: htmlVidea, htmlVsetko: htmlVsetko, napoj: napoj };
})();
