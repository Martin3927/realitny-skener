-- oslavy (narodeniny, meniny, výročia) do chatu každé ráno o 7:00 slovenského času
select cron.schedule('oslavy-rano', '0 5,6 * * *', 'select public._oslavy_cron()');
