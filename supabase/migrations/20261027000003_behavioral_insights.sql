-- Use the project's operating time zone for new accounts; users can still choose their own IANA zone.
alter table public.profiles alter column timezone set default 'Asia/Kolkata';
