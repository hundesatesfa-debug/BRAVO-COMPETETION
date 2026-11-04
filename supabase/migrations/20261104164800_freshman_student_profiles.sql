-- Student onboarding for Ethiopian university freshmen.
-- Profile details remain private under the existing profiles RLS policy.

alter table public.profiles
  alter column stream drop not null,
  add column university text,
  add column department text,
  add column academic_year smallint,
  add column student_id text,
  add constraint profiles_university_length_check
    check (university is null or char_length(trim(university)) between 2 and 150),
  add constraint profiles_department_length_check
    check (department is null or char_length(trim(department)) between 2 and 120),
  add constraint profiles_academic_year_check
    check (academic_year is null or academic_year between 1 and 8),
  add constraint profiles_student_id_length_check
    check (student_id is null or char_length(trim(student_id)) between 1 and 80);

create index profiles_university_year_idx
  on public.profiles (university, academic_year);

-- Keep the earlier free sign-up path closed until enrollment is linked to
-- manual payment verification in the competition phase.
drop policy "Eligible users can register for published competitions"
  on public.competition_registrations;
revoke insert, delete on table public.competition_registrations from authenticated;

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
  requested_university text := trim(coalesce(new.raw_user_meta_data ->> 'university', ''));
  requested_department text := trim(coalesce(new.raw_user_meta_data ->> 'department', ''));
  requested_year_text text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'academic_year'), ''), '1');
  requested_student_id text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'student_id', '')), '');
  requested_year smallint;
begin
  if char_length(requested_name) not between 1 and 100 then
    raise exception 'Please enter a valid full name.';
  end if;
  if requested_level <> 'freshman' then
    raise exception 'BRAVO Academy registration is for university freshmen.';
  end if;
  if requested_stream is not null and requested_stream not in ('natural_science', 'social_science') then
    raise exception 'Please select a valid academic stream.';
  end if;
  if char_length(requested_university) not between 2 and 150 then
    raise exception 'Please enter a valid university name.';
  end if;
  if char_length(requested_department) not between 2 and 120 then
    raise exception 'Please enter a valid department.';
  end if;
  if requested_year_text !~ '^[1-8]$' then
    raise exception 'Academic year must be between 1 and 8.';
  end if;
  requested_year := requested_year_text::smallint;
  if requested_student_id is not null and char_length(requested_student_id) not between 1 and 80 then
    raise exception 'Student ID must be 80 characters or fewer.';
  end if;
  if requested_phone is not null and requested_phone !~ '^\+251[79][0-9]{8}$' then
    raise exception 'Please enter a valid Ethiopian mobile number.';
  end if;

  insert into public.profiles (
    id, full_name, academic_level, stream, phone_number,
    university, department, academic_year, student_id
  )
  values (
    new.id, requested_name, requested_level, requested_stream, requested_phone,
    requested_university, requested_department, requested_year, requested_student_id
  );

  -- Never derive authorization roles from user-controlled metadata.
  insert into public.user_roles (user_id, role)
  values (new.id, 'student');

  return new;
end;
$$;
