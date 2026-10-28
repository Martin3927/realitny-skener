-- =====================================================================
-- 070: Web kancelárie v žiadostiach o doménu (administrátor vidí, že ide o web kancelárie, nie o web makléra)
-- =====================================================================

create or replace function public.weby_ziadosti() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _over_aktivny();
  if not ja_admin() then raise exception 'Len pre administrátora.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('web_id', w.id, 'makler_id', w.makler_id, 'kancelaria', w.kancelaria,
      'meno', case when w.kancelaria then 'Web kancelárie' else m.meno end, 'adresa', w.adresa,
      'adresa_navrh', w.adresa_navrh, 'adresa_navrh_kedy', w.adresa_navrh_kedy, 'domena', w.domena, 'domena_overena', w.domena_overena,
      'domena_smeruje', w.domena_smeruje, 'domena_kontrola', w.domena_kontrola, 'domena_ziadost', w.domena_ziadost, 'domena_pripojena', w.domena_pripojena)
      order by coalesce(w.adresa_navrh_kedy, w.domena_ziadost, w.domena_pripojena) desc nulls last)
    from weby w join makleri m on m.id = w.makler_id
    where w.adresa_navrh is not null or w.domena_ziadost is not null or w.domena_pripojena is not null), '[]'::jsonb);
end $$;

create or replace function public.pripojit_domenu_webu(p_web bigint, p_ok boolean, p_dovod text default null) returns void
language plpgsql security definer set search_path = public as $$
declare w weby;
begin
  perform _over_aktivny();
  if not ja_admin() then raise exception 'Domény pripája administrátor.' using errcode = '42501'; end if;
  select * into w from weby where id = p_web for update;
  if not found or w.domena is null then raise exception 'Web nemá doménu.' using errcode = '22023'; end if;
  if p_ok then
    if w.domena_overena is null then raise exception 'Vlastníctvo domény ešte nie je overené.' using errcode = '22023'; end if;
    update weby set domena_pripojena = now() where id = w.id;
    perform _oznam_maklerovi(w.makler_id, 'Doména ' || w.domena || ' je pripojená. ' ||
      case when w.kancelaria then 'Web kancelárie' else 'Tvoj web' end || ' beží na https://' || w.domena || '/');
  else
    update weby set domena_pripojena = null, domena_ziadost = null where id = w.id;
    perform _oznam_maklerovi(w.makler_id, 'Doménu ' || w.domena || case when w.kancelaria then ' (web kancelárie)' else '' end ||
      ' sa zatiaľ nepodarilo pripojiť' || coalesce(': ' || nullif(left(btrim(p_dovod), 300), ''), '.'));
  end if;
end $$;

revoke execute on function public.weby_ziadosti(), public.pripojit_domenu_webu(bigint, boolean, text) from public, anon;
grant execute on function public.weby_ziadosti(), public.pripojit_domenu_webu(bigint, boolean, text) to authenticated;
