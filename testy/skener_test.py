#!/usr/bin/env python3
"""Testy jadra skenera (skener.py): duplicity medzi portálmi, porovnanie cien, typ predajcu, čítanie ceny a telefónu.

Spustenie:  python3 testy/skener_test.py
Nič nesťahuje a nepotrebuje databázu – volá len funkcie, ktoré rozhodujú nad už načítanými inzerátmi.
Keď niektorá kontrola nesedí, skript skončí chybou (assert) a workflow Testy spadne.
"""
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import skener  # noqa: E402

KONTROLY = 0


def over(podmienka, popis):
    global KONTROLY
    KONTROLY += 1
    assert podmienka, popis


def inz(id_, **kw):
    """Inzerát tak, ako ho skener vedie po načítaní z portálu."""
    z = skener.zaznam(id=id_, portal=id_.split(":")[0], portaly=[id_.split(":")[0]], url="https://x/" + id_, **kw)
    z.setdefault("aktivny", True)
    z.setdefault("duplikat_z", None)
    return z


def byt(id_, cena, plocha=60, obec="Spišská Nová Ves", okres="Spišská Nová Ves", izby=3, nazov="3-izbový byt", **kw):
    return inz(id_, typ="byt", cena=cena, plocha=plocha, obec=obec, okres=okres, izby=izby, nazov=nazov, **kw)


# ---------------------------------------------------------------- duplicity: ten istý inzerát na dvoch portáloch
def test_duplicity():
    a = byt("bazos:1", 135000, 68, nazov="Predám 3-izbový byt sídlisko Mier")
    b = byt("nehnutelnosti:1", 135000, 68, nazov="3 izbový byt na predaj, Mier")
    over(skener.kluc_duplicity(a) == skener.kluc_duplicity(b) == ("byt", "Spišská Nová Ves", 135000),
         "rovnaký typ, okres a cena majú mať rovnaký kľúč duplicity")
    over(skener.je_duplikat(a, b), "rovnaký byt s rovnakou plochou na dvoch portáloch má byť duplikát")

    # dva rôzne byty v tom istom dome: rovnaká cena, takmer rovnaká plocha, celkom iný názov
    c = byt("bazos:2", 135000, 68, nazov="Slnečný apartmán po rekonštrukcii pri parku")
    d = byt("reality:2", 135000, 69.5, nazov="Tehlový byt s lodžiou, pôvodný stav, vyššie poschodie")
    over(not skener.je_duplikat(c, d), "dva rôzne byty v jednom dome (iný názov, plocha o 2 % iná) sa nesmú zlúčiť")

    # portály uvádzajú plochu trochu inak, názov je takmer rovnaký
    e = byt("bazos:3", 52000, 21, izby=1, nazov="Garsónka Tarča po rekonštrukcii s balkónom")
    f = byt("topreality:3", 52000, 21.7, izby=1, nazov="Garsónka Tarča po rekonštrukcii, balkón")
    over(skener.je_duplikat(e, f), "plocha 21 a 21,7 m² pri takmer rovnakom názve je ten istý inzerát")

    over(not skener.je_duplikat(a, byt("reality:4", 135000, 68, obec="Smižany", nazov=a["nazov"])),
         "inzeráty v rôznych obciach nie sú duplikát")
    over(not skener.je_duplikat(a, byt("reality:5", 135000, 68, izby=2, nazov=a["nazov"])),
         "inzeráty s rôznym počtom izieb nie sú duplikát")

    # bez plochy rozhoduje názov: všeobecný nestačí, treba aspoň 3 spoločné významové slová
    g = byt("bazos:6", 99000, None, nazov="3-izbový byt")
    h = byt("reality:6", 99000, None, nazov="3-izbový byt")
    over(not skener.je_duplikat(g, h), "všeobecný názov bez plochy nestačí na zlúčenie")
    i = byt("bazos:7", 99000, None, nazov="Byt Levočská ulica tehlový dom s garážou")
    j = byt("reality:7", 99000, None, nazov="Byt, Levočská ulica, tehlový dom, garáž")
    over(skener.je_duplikat(i, j), "bez plochy, ale s takmer rovnakým konkrétnym názvom je to duplikát")


def test_duplicity_bez_ceny():
    a = byt("bazos:10", 120000, 71, nazov="Byt Levočská ulica tehlový dom", predajca_typ="sukromny")
    b = byt("reality:10", None, 71, nazov="Byt Levočská ulica tehlový dom", predajca_typ="sukromny")
    over(skener.kluc_duplicity(b) is not None and skener.kluc_duplicity(a) != skener.kluc_duplicity(b),
         "inzerát bez ceny má iný kľúč – spája ho len prísnejšie porovnanie")
    over(skener.je_duplikat_bez_ceny(a, b), "bez ceny: rovnaká plocha, obec aj názov = ten istý inzerát")
    over(not skener.je_duplikat_bez_ceny(a, dict(b, obec="Smižany")), "bez ceny: iná obec = iný inzerát")
    over(not skener.je_duplikat_bez_ceny(a, dict(b, plocha=73)), "bez ceny: plocha o 3 % iná = iný inzerát")
    over(not skener.je_duplikat_bez_ceny(a, dict(b, nazov="Pekný byt v centre mesta")), "bez ceny: iný názov = iný inzerát")
    over(not skener.je_duplikat_bez_ceny(a, dict(b, predajca_typ="rk")),
         "bez ceny: súkromník sa nesmie schovať pod realitku len podľa plochy")
    over(skener.kluc_duplicity(byt("bazos:11", None, 60, nazov="Byt")) is None, "bez ceny a s krátkym názvom sa nespája nič")

    # pozemky: okrúhla plocha (600 m²) je slabý znak, nezaokrúhlená (4 473 m²) silný
    p1 = inz("bazos:12", typ="pozemok", cena=30000, plocha=600, obec="Levoča", okres="Levoča", nazov="Stavebný pozemok Levoča juh")
    p2 = inz("reality:12", typ="pozemok", cena=None, plocha=600, obec="Levoča", okres="Levoča", nazov="Pozemok Levoča pri lese výhľad")
    over(not skener.je_duplikat_bez_ceny(p1, p2), "okrúhla plocha pozemku a málo podobný názov nestačia")
    over(skener.je_duplikat_bez_ceny(dict(p1, plocha=4473), dict(p2, plocha=4473)),
         "nezaokrúhlená plocha pozemku a čiastočne podobný názov = ten istý pozemok")


# ---------------------------------------------------------------- porovnanie cien (podhodnotené ponuky)
def test_ceny():
    min_n = skener.CONFIG["min_porovnatelnych"]
    prah = skener.CONFIG["podhodnotene_o_percent_podla_typu"].get("byt", skener.CONFIG["podhodnotene_o_percent"])
    over(min_n == 5 and prah == 15, "test počíta s nastavením z config.json (5 porovnateľných, prah 15 % pri bytoch)")

    # 6 bežných 3-izbových bytov v SNV okolo 2 000 €/m² + jeden lacný a jeden len mierne lacnejší
    ceny = [118000, 119000, 120000, 121000, 122000, 123000]
    d = {f"bazos:b{i}": byt(f"bazos:b{i}", c) for i, c in enumerate(ceny)}
    d["bazos:lacny"] = byt("bazos:lacny", 90000)          # 1 500 €/m²
    d["bazos:mierne"] = byt("bazos:mierne", 114000)       # 1 900 €/m²
    d["bazos:rezerv"] = byt("bazos:rezerv", 90000, nazov="3-izbový byt REZERVOVANÉ")
    d["bazos:podiel"] = byt("bazos:podiel", 40000, nazov="3-izbový byt, podiel 1/2")
    d["bazos:neaktivny"] = byt("bazos:neaktivny", 60000, aktivny=False)
    d["reality:dupl"] = byt("reality:dupl", 30000, duplikat_z="bazos:b0")
    skener.vyhodnot_ceny(d)

    lacny = d["bazos:lacny"]
    # porovnáva sa s ostatnými platnými bytmi v obci: 6 bežných, „mierne“ a „rezervovaný“ (duplikát, podiel a neaktívny nie)
    ostatne = [c / 60 for c in ceny] + [114000 / 60, 90000 / 60]
    med = statistics.median(round(x, 1) for x in ostatne)
    over(lacny["odhad"] is not None, "lacný byt má mať odhad")
    over(lacny["odhad"]["skupina"] == "byt 3-izb, Spišská Nová Ves", "najprv sa porovnáva s rovnakými bytmi v obci")
    over(lacny["odhad"]["n"] == len(ostatne), f"počet porovnaných má byť {len(ostatne)}, je {lacny['odhad']['n']}")
    over(lacny["odhad"]["median"] == round(med, 1), "medián ceny za m² nesedí")
    over(lacny["odhad"]["rozdiel_pct"] == round((1500.0 - med) / med * 100, 1), "rozdiel oproti mediánu nesedí")
    over(lacny["odhad"]["jednotka"] == "€/m²", "byty sa porovnávajú cenou za m²")
    over(lacny["podhodnotene"] is True, "byt o štvrtinu lacnejší než medián má byť podhodnotený")
    over(d["bazos:mierne"]["podhodnotene"] is False, "byt o 5 % lacnejší nie je podhodnotený")
    over(d["bazos:b3"]["odhad"] is not None and d["bazos:b3"]["podhodnotene"] is False, "bežný byt má odhad a nie je podhodnotený")
    over(d["bazos:rezerv"]["odhad"] is not None and d["bazos:rezerv"]["podhodnotene"] is False,
         "rezervovaný byt sa ako podhodnotený neoznačuje, aj keď je lacný")
    over(d["bazos:podiel"]["odhad"] is None and d["bazos:podiel"]["podhodnotene"] is False, "predaj podielu sa neporovnáva")
    over(d["bazos:neaktivny"]["odhad"] is None, "neaktívny inzerát sa nehodnotí")

    # málo porovnateľných v obci → porovná sa s okresom; primálo aj v okrese → bez odhadu
    e = {f"bazos:s{i}": byt(f"bazos:s{i}", c, obec="Smižany") for i, c in enumerate([118000, 120000, 122000])}
    e.update({f"bazos:h{i}": byt(f"bazos:h{i}", c, obec="Harichovce") for i, c in enumerate([119000, 121000, 90000])})
    e["bazos:lev"] = byt("bazos:lev", 100000, obec="Levoča", okres="Levoča")
    e["bazos:bezobce"] = byt("bazos:bezobce", 120000, obec=None)
    skener.vyhodnot_ceny(e)
    over(e["bazos:h2"]["odhad"]["skupina"] == "byt 3-izb, okres Spišská Nová Ves", "pri malom počte v obci sa porovnáva s okresom")
    over(e["bazos:h2"]["odhad"]["n"] == 6 and e["bazos:h2"]["podhodnotene"] is True, "lacný byt v malej obci: 6 porovnaných v okrese")
    over(e["bazos:bezobce"]["odhad"]["skupina"] == "byt 3-izb, okres Spišská Nová Ves", "bez obce sa porovnáva rovno s okresom")
    over(e["bazos:lev"]["odhad"] is None, "jediný byt v okrese nemá s čím porovnať")

    # pozemky: len rovnaký podtyp a veľkostné pásmo; susedný okres (Levoča) sa ráta ako okolie
    over("Levoča" in skener.susedne_okresy("Spišská Nová Ves"), "Levoča je v okolí Spišskej Novej Vsi")
    over("Bratislava I" not in skener.susedne_okresy("Spišská Nová Ves"), "Bratislava nie je v okolí Spišskej Novej Vsi")

    def poz(id_, cena, plocha, okres, obec, podtyp="stavebny"):
        return inz(id_, typ="pozemok", cena=cena, plocha=plocha, okres=okres, obec=obec, podtyp=podtyp, nazov="Pozemok")
    p = {f"bazos:l{i}": poz(f"bazos:l{i}", c, 800, "Levoča", f"Obec {i}") for i, c in enumerate([40000, 41000, 42000, 43000, 44000])}
    p["bazos:snv"] = poz("bazos:snv", 20000, 800, "Spišská Nová Ves", "Smižany")
    p["bazos:velky"] = poz("bazos:velky", 20000, 6000, "Spišská Nová Ves", "Smižany")
    p["bazos:poda"] = poz("bazos:poda", 20000, 800, "Spišská Nová Ves", "Smižany", podtyp="poda")
    skener.vyhodnot_ceny(p)
    over(p["bazos:snv"]["odhad"]["skupina"] == "stavebné pozemky do 1 500 m², okolie" and p["bazos:snv"]["odhad"]["n"] == 5,
         "pozemok bez porovnania v okrese sa porovná s okolím")
    over(p["bazos:snv"]["podhodnotene"] is True, "pozemok za polovicu mediánu okolia je podhodnotený")
    over(p["bazos:velky"]["odhad"] is None, "veľký pozemok sa neporovnáva s malými")
    over(p["bazos:poda"]["odhad"] is None, "poľnohospodárska pôda sa neporovnáva so stavebnými pozemkami")

    # garáže sa porovnávajú celou cenou, parkovacie státia vôbec
    g = {f"bazos:g{i}": inz(f"bazos:g{i}", typ="garaz", cena=c, plocha=18, okres="Levoča", obec="Levoča", nazov="Garáž")
         for i, c in enumerate([14000, 15000, 16000, 17000, 18000, 9000])}
    g["bazos:statie"] = inz("bazos:statie", typ="garaz", cena=5000, plocha=12, okres="Levoča", obec="Levoča", nazov="Parkovacie státie")
    skener.vyhodnot_ceny(g)
    over(g["bazos:g5"]["odhad"]["jednotka"] == "€" and g["bazos:g5"]["odhad"]["median"] == 16000, "garáže: medián celej ceny")
    over(g["bazos:g5"]["podhodnotene"] is True, "garáž za 9 000 € pri mediáne 16 000 € je podhodnotená")
    over(g["bazos:statie"]["odhad"] is None, "parkovacie státie sa s garážami neporovnáva")

    over(skener.izby_skupina({"izby": 4}) == skener.izby_skupina({"izby": 6}) == "4+" and skener.izby_skupina({"izby": None}) == "?",
         "byty so 4 a viac izbami sú jedna skupina")
    over([skener.velkost_pozemku(x) for x in (1499, 1500, 4999, 5000)]
         == ["do 1 500 m²", "1 500–5 000 m²", "1 500–5 000 m²", "nad 5 000 m²"], "hranice veľkostných pásiem pozemkov")


# ---------------------------------------------------------------- typ predajcu, cena a telefón z textu
def test_texty():
    over(skener.klasifikuj_text("Predám svoj byt, RK nevolať!")[0] == "sukromny", "„RK nevolať“ = súkromník")
    over(skener.klasifikuj_text("Realitná kancelária ponúka na predaj")[0] == "rk", "„realitná kancelária“ = RK")
    over(skener.klasifikuj_text("Ponúkame na predaj pekný byt")[0] == "slabe", "„ponúkame“ je len slabý znak RK")
    over(skener.klasifikuj_text("Predám byt v centre") == (None, None), "bez znakov sa typ predajcu z textu neurčí")
    silna = {"predajca_typ": "rk", "predajca_dovod": "v texte: „realitna kancel“"}
    prenesena = {"predajca_typ": "rk", "predajca_dovod": "na reality inzeruje RK (XY reality)"}
    over(skener.je_silne_rk(silna) and not skener.je_silne_rk(prenesena), "RK prenesená z duplikátu nie je silný znak")

    over(skener.cena_z_textu("137 950 €") == 137950 and skener.cena_z_textu("137,950 €") == 137950, "cena s medzerou aj čiarkou")
    over(skener.cena_z_textu("Cena dohodou") is None and skener.cena_z_textu("1 €") is None, "dohodou a zástupná cena = bez ceny")
    over(skener.zaznam(typ="byt", cena=111_111_111_111, plocha=60)["cena"] is None, "nezmyselná cena sa zahodí")
    over(skener.zaznam(typ="byt", cena=120000, plocha=60)["cena_m2"] == 2000.0, "cena za m² sa dopočíta")
    over(skener.zaznam(typ="byt", cena=120000, plocha=5)["plocha"] is None, "nezmyselná plocha bytu sa zahodí")

    over(skener.najdi_telefon("volajte 0905 111 222 alebo +421 907 333 444") == "0905 111 222, 0907 333 444", "mobilné čísla z textu")
    over(skener.najdi_telefon("cena 120000 eur, plocha 68 m2") is None, "cena ani plocha nie sú telefón")


if __name__ == "__main__":
    for t in (test_duplicity, test_duplicity_bez_ceny, test_ceny, test_texty):
        t()
        print(f"OK   {t.__name__}")
    print(f"Testy skenera prešli ({KONTROLY} kontrol).")
