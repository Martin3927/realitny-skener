#!/bin/bash
# SQL ako prihlásený maklér: sqlas.sh email "select ..."
uid=$(psql -h 127.0.0.1 -p 54322 -U postgres -d typek -tAc "select id from auth.users where email='$1'")
psql -h 127.0.0.1 -p 54322 -U postgres -d typek -tA -v ON_ERROR_STOP=1 <<SQL
\set QUIET on
begin;
set local role authenticated;
\o /dev/null
select set_config('request.jwt.claims', '{"sub":"$uid","role":"authenticated"}', true) \gset x
\o
$2;
commit;
SQL
