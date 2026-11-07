-- Require a valid CBE account number during student registration.

alter table public.profiles
  add column if not exists cbe_account_number text,
  add column if not exists school_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_cbe_account_number_check'
  ) then
    alter table public.profiles
      add constraint profiles_cbe_account_number_check
      check (cbe_account_number is null or cbe_account_number ~ '^[0-9]{13}$')
      not valid;
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_school_name_length_check'
  ) then
    alter table public.profiles
      add constraint profiles_school_name_length_check
      check (school_name is null or char_length(trim(school_name)) between 2 and 150)
      not valid;
  end if;
end
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  requested_level text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'academic_level'), ''), 'freshman');
  requested_stream text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'stream', '')), '');
  requested_phone text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone_number', new.phone, '')), '');
  requested_cbe_account text := trim(coalesce(new.raw_user_meta_data ->> 'cbe_account_number', ''));
  requested_school text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'school_name', '')), '');
  requested_university text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'university', '')), '');
  requested_department text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'department', '')), '');
  requested_year_text text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'academic_year', '')), '');
  requested_student_id text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'student_id', '')), '');
  requested_year smallint;
begin
  if char_length(requested_name) not between 1 and 100 then
    raise exception 'Please enter a valid full name.';
  end if;
  if requested_level not in ('grade_12', 'freshman') then
    raise exception 'Please select a valid academic level.';
  end if;
  if requested_stream is not null and requested_stream not in ('natural_science', 'social_science') then
    raise exception 'Please select a valid academic stream.';
  end if;
  if requested_level = 'grade_12' and (requested_school is null or char_length(requested_school) not between 2 and 150) then
    raise exception 'Please enter a valid school name.';
  end if;
  if requested_level = 'freshman' then
    requested_school := null;
  end if;
  if requested_university is not null and char_length(requested_university) not between 2 and 150 then
    raise exception 'Please enter a valid university name.';
  end if;
  if requested_department is not null and char_length(requested_department) not between 2 and 120 then
    raise exception 'Please enter a valid department.';
  end if;
  if requested_year_text is not null and requested_year_text !~ '^[1-8]$' then
    raise exception 'Academic year must be between 1 and 8.';
  end if;
  if requested_year_text is not null then
    requested_year := requested_year_text::smallint;
  end if;
  if requested_student_id is not null and char_length(requested_student_id) not between 1 and 80 then
    raise exception 'Student ID must be 80 characters or fewer.';
  end if;
  if requested_phone is not null and requested_phone !~ '^\+251[79][0-9]{8}$' then
    raise exception 'Please enter a valid Ethiopian mobile number.';
  end if;
  if requested_cbe_account !~ '^[0-9]{13}$' then
    raise exception 'Please enter a valid 13-digit CBE account number.';
  end if;

  insert into public.profiles (
    id, full_name, academic_level, stream, phone_number, cbe_account_number, school_name,
    university, department, academic_year, student_id
  )
  values (
    new.id, requested_name, requested_level, requested_stream, requested_phone,
    requested_cbe_account, requested_school, requested_university, requested_department,
    requested_year, requested_student_id
  );

  -- New accounts are always students. Promote admins separately as a trusted owner.
  insert into public.user_roles (user_id, role)
  values (new.id, 'student');

  return new;
end;
$$;
