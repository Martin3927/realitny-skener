// Odpoveď klientovi, ktorý vyplnil formulár na webe makléra: jedným klikom zavolať, poslať SMS,
// WhatsApp alebo e-mail s pripraveným textom (maklér ho pred odoslaním ešte vidí a môže upraviť).
// Používa aplikácia (zvonček) aj editor webu (Prehľad).
(function () {
  "use strict";
  var ZDROJ = { odhad: "Odhad ceny", strazca: "Strážca ponúk", obhliadka: "Obhliadka", callback: "Zavolať späť", dotaznik: "Dotazník", ebook: "E-book", kontakt: "Správa", podobna: "Hľadá podobnú", hypoteka: "Ponuka hypotéky" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function jeEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim()); }
  function cisloTel(v) { return String(v || "").replace(/[^\d+]/g, ""); }
  function medzinarodne(t) {
    t = cisloTel(t);
    if (/^\+/.test(t)) return t.slice(1);
    if (/^00/.test(t)) return t.slice(2);
    if (/^0/.test(t)) return "421" + t.slice(1);
    return t;
  }
  // termín obhliadky, ktorý si klient vybral na stránke ponuky: „v štvrtok 29. 10. o 10:00“
  function terminText(iso) {
    var d = new Date(iso); if (isNaN(d)) return "";
    var o = {}; new Intl.DateTimeFormat("sk-SK", { timeZone: "Europe/Bratislava", weekday: "long", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).forEach(function (x) { o[x.type] = x.value; });
    var den = { pondelok: "v pondelok", utorok: "v utorok", streda: "v stredu", "štvrtok": "vo štvrtok", piatok: "v piatok", sobota: "v sobotu", "nedeľa": "v nedeľu" }[o.weekday] || o.weekday;
    return den + " " + o.day + ". " + o.month + ". o " + Number(o.hour) + ":" + o.minute;
  }
  // m = maklér { meno, telefon, pohlavie }, ponuka = názov ponuky (nepovinné), kratko = pre SMS a WhatsApp
  function text(k, m, ponuka, kratko) {
    m = m || {};
    var z = m.pohlavie === "zena", g = function (muz, zena) { return z ? zena : muz; };
    var o = ponuka ? " o ponuku „" + ponuka + "“" : "";
    var telo = {
      odhad: "ďakujem za žiadosť o odhad ceny cez môj web. " + g("Rád", "Rada") + " vám pomôžem. Kedy sa vám môžem ozvať, prípadne kedy by sme sa mohli stretnúť pri nehnuteľnosti?",
      obhliadka: k.termin ? "ďakujem za záujem" + o + ". Obhliadku " + terminText(k.termin) + " vám potvrdzujem. Ak by sa vám čas nehodil, dajte mi vedieť." : "ďakujem za záujem" + o + ". Kedy by vám vyhovovala obhliadka?",
      callback: "ďakujem za správu cez môj web. Kedy sa vám môžem ozvať?",
      strazca: "ďakujem, že ste si na mojom webe zapli strážcu ponúk. Keď sa objaví vhodná ponuka, ozvem sa vám. Ak mi poviete viac o tom, čo hľadáte, viem vám pomôcť aj s ponukami, ktoré ešte nie sú zverejnené.",
      dotaznik: "ďakujem za vyplnený dotazník na mojom webe. " + g("Pozrel", "Pozrela") + " som si ho a " + g("rád by som sa vám ozval", "rada by som sa vám ozvala") + ". Kedy sa vám to hodí?",
      ebook: "ďakujem za záujem o môj e-book. Ak budete mať k predaju či kúpe nehnuteľnosti akúkoľvek otázku, pokojne sa ozvite.",
      kontakt: "ďakujem za vašu správu z môjho webu" + o + ". " + g("Rád", "Rada") + " vám pomôžem.",
      hypoteka: "ďakujem za záujem o ponuku hypotéky" + (ponuka ? " k nehnuteľnosti „" + ponuka + "“" : "") + ". " + g("Rád", "Rada") + " vám pomôžem s financovaním a pripravím porovnanie podľa vašich čísel. Kedy sa vám môžem ozvať?",
      podobna: "ďakujem za záujem" + (ponuka ? " o „" + ponuka + "“" : "") + ". Táto nehnuteľnosť už nie je voľná, ale " + g("rád", "rada") + " vám pomôžem nájsť podobnú. Čo je pre vás pri hľadaní najdôležitejšie?"
    }[k.zdroj] || "ďakujem za vašu správu z môjho webu.";
    var oslovenie = "Dobrý deň" + (k.meno ? ", " + String(k.meno).trim() : "") + ",";
    if (kratko) return (oslovenie + " " + telo + " " + (m.meno || "")).trim();
    return oslovenie + "\n\n" + telo + "\n\nS pozdravom\n" + (m.meno || "") + (m.telefon ? "\n" + m.telefon : "");
  }
  // zoznam spôsobov odpovede podľa kontaktu klienta (e-mail alebo telefón)
  function odkazy(k, m, ponuka) {
    var v = String(k.kontakt || "").trim(), out = [];
    if (!v) return out;
    if (jeEmail(v)) {
      var predmet = (ZDROJ[k.zdroj] || "Správa") + " – " + (ponuka || "váš dopyt z webu");
      out.push({ druh: "email", label: "Odpísať e-mailom", href: "mailto:" + encodeURIComponent(v).replace(/%40/g, "@") + "?subject=" + encodeURIComponent(predmet) + "&body=" + encodeURIComponent(text(k, m, ponuka)) });
      return out;
    }
    var t = cisloTel(v);
    if (t.replace(/\D/g, "").length < 6) return out;
    out.push({ druh: "tel", label: "Zavolať", href: "tel:" + t });
    out.push({ druh: "sms", label: "SMS", href: "sms:" + t + "?body=" + encodeURIComponent(text(k, m, ponuka, true)) });
    out.push({ druh: "wa", label: "WhatsApp", href: "https://wa.me/" + medzinarodne(t) + "?text=" + encodeURIComponent(text(k, m, ponuka, true)), nove: true });
    return out;
  }
  function html(k, m, ponuka, trieda) {
    return odkazy(k, m, ponuka).map(function (x) {
      return '<a class="' + esc(trieda || "") + '" data-odpoved="' + x.druh + '" href="' + esc(x.href) + '"' + (x.nove ? ' target="_blank" rel="noopener"' : "") + ">" + esc(x.label) + "</a>";
    }).join("");
  }
  window.TYPEK_ODPOVED = { text: text, odkazy: odkazy, html: html, jeEmail: jeEmail, ZDROJ: ZDROJ };
})();
