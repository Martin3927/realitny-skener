-- Nová objednávka alebo žiadosť o bezplatnú verziu z predajného webu (realitnytypek.sk, /skener, /osobny-web)
-- → hlavnému správcovi hneď do zvončeka (pripomienka s odkazom na zákazníka v Správe zákazníkov)
--   a upozornenie do mobilu (ťuknutie otvorí zákazníka v Správe zákazníkov).
-- E-mail o objednávke posiela funkcia pripomienky (webZiadosti), keď je nastavené odosielanie e-mailov,
-- preto je pripomienka hneď označená ako vybavená e-mailom (inak by prišiel druhý, všeobecný e-mail).
-- Upozornenie nikdy nezastaví uloženie objednávky.

alter table public.pripomienky add column if not exists zakaznik_id bigint references public.zakaznici(id) on delete set null;

-- staršie žiadosti z webu správca už vidí v Správe zákazníkov – po zapnutí e-mailov sa o nich už nepíše
-- (ani hlavnému správcovi, ani neskoré potvrdenie zákazníkovi)
update public.zakaznici set web_oznamene = now()
 where zdroj = 'web' and web_oznamene is null and vytvorene < now() - interval '1 day';

create or replace function public._objednavka_upozornenie() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_riadky text[] := regexp_split_to_array(btrim(coalesce(new.poznamky, '')), E'\n');
  v_riadok text;
  v_stary text;
  v_obj boolean;
  v_bal text;
  v_det text;
  v_text text;
  v_kto uuid[] := '{}';
  v_komu uuid;
begin
  v_riadok := btrim(coalesce(v_riadky[array_upper(v_riadky, 1)], ''));
  if v_riadok !~ '^(Objednávka z webu|Žiadosť o bezplatnú verziu z webu)' then return new; end if;
  if tg_op = 'UPDATE' then
    v_riadky := regexp_split_to_array(btrim(coalesce(old.poznamky, '')), E'\n');
    v_stary := btrim(coalesce(v_riadky[array_upper(v_riadky, 1)], ''));
    if v_stary = v_riadok then return new; end if;
  end if;

  v_obj := v_riadok ~ '^Objednávka';
  v_bal := case
    when tg_op = 'UPDATE' then 'opakovaná objednávka'
    when 'kancelaria' = any(new.moduly) then 'Realitná kancelária'
    when 'skener' = any(new.moduly) and 'web' = any(new.moduly) then 'Skener + osobný web'
    when 'skener' = any(new.moduly) then 'Realitný skener'
    when 'web' = any(new.moduly) then 'Osobný web'
  end;
  -- z poznámky ostanú okresy, moduly navyše a platba (kontakt je v texte zvlášť)
  v_det := coalesce(substring(v_riadok from '[0-9]{2}:[0-9]{2}\.\s*(.*)$'), '');
  v_det := btrim(regexp_replace(v_det, '\s*Kontakt: .*$', ''));
  v_text := concat_ws(' · ', v_bal, nullif(btrim(coalesce(new.kontakt_meno, '')), ''), nullif(btrim(coalesce(new.telefon, '')), ''), new.email)
            || case when v_det <> '' then '. ' || v_det else '' end;

  for v_komu in select m.id from hlavni_spravcovia h join makleri m on m.id = h.user_id where m.aktivny order by h.vytvorene loop
    v_kto := v_kto || v_komu;
  end loop;
  if cardinality(v_kto) = 0 then
    select array_agg(id) into v_kto from (select id from makleri where aktivny and rola = 'admin' order by vytvorene limit 1) a;
  end if;
  if coalesce(cardinality(v_kto), 0) = 0 then return new; end if;

  insert into pripomienky (makler_id, cas, poznamka, druh, zakaznik_id, email_odoslany)
  select k, now(), left(case when v_obj then 'Nová objednávka z webu – ' else 'Nová žiadosť o bezplatnú verziu – ' end || v_text, 500),
         'web', new.id, now()
  from unnest(v_kto) k;

  perform _push_zaradit(v_kto, 'kontakty',
    case when v_obj then '🛒 Nová objednávka z webu' else '🆕 Nová žiadosť o bezplatnú verziu' end,
    v_text, 'sprava.html#z/' || new.id, 'typek-zakaznik-' || new.id);
  return new;
exception when others then
  return new;
end $$;
revoke execute on function public._objednavka_upozornenie() from public, anon, authenticated;

drop trigger if exists objednavka_upozornenie on public.zakaznici;
create trigger objednavka_upozornenie after insert or update of poznamky on public.zakaznici
  for each row when (new.zdroj = 'web') execute function public._objednavka_upozornenie();
