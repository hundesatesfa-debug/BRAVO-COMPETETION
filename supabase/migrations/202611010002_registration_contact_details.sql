-- Collect Ethiopian mobile and CBE account details during registration.
-- Existing profiles remain nullable; the auth trigger requires both for new accounts.

alter table public.profiles
  add column phone_number text,
  add column cbe_account_number text,
  add constraint profiles_phone_number_ethiopian_mobile_check
    check (phone_number is null or phone_number ~ '^\+251[79][0-9]{8}$'),
  add constraint profiles_cbe_account_number_check
    check (cbe_account_number is null or cbe_account_number ~ '^[0-9]{13}$');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_level text := coalesce(new.raw_user_meta_data ->> 'academic_level', '');
  requested_stream text := coalesce(new.raw_user_meta_data ->> 'stream', '');
  requested_name text := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  requested_phone text := trim(coalesce(new.raw_user_meta_data ->> 'phone_number', ''));
  requested_cbe_account text := trim(coalesce(new.raw_user_meta_data ->> 'cbe_account_number', ''));
begin
  if requested_level not in ('grade_12', 'freshman') then
    raise exception 'Please select a valid academic level.';
  end if;
  if requested_stream not in ('natural_science', 'social_science') then
    raise exception 'Please select a valid academic stream.';
  end if;
  if char_length(requested_name) not between 1 and 100 then
    raise exception 'Please enter a valid full name.';
  end if;
  if requested_phone !~ '^\+251[79][0-9]{8}$' then
    raise exception 'Please enter a valid Ethiopian mobile number.';
  end if;
  if requested_cbe_account !~ '^[0-9]{13}$' then
    raise exception 'Please enter a valid 13-digit CBE account number.';
  end if;

  insert into public.profiles (
    id, full_name, academic_level, stream, phone_number, cbe_account_number
  )
  values (
    new.id, requested_name, requested_level, requested_stream,
    requested_phone, requested_cbe_account
  );

  insert into public.user_roles (user_id, role)
  values (new.id, 'student');

  return new;
end;
$$;
