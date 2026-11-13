begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'academic-materials',
  'academic-materials',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins can upload academic materials" on storage.objects;
create policy "Admins can upload academic materials"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'academic-materials'
  and (select public.has_role((select auth.uid()), 'admin'))
);

drop policy if exists "Students and admins can read academic materials" on storage.objects;
create policy "Students and admins can read academic materials"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'academic-materials'
  and (
    (select public.has_role((select auth.uid()), 'admin'))
    or exists (
      select 1
      from public.academic_materials as material
      join public.courses as course on course.id = material.course_id
      join public.profiles as profile on profile.id = (select auth.uid())
      where material.object_path = storage.objects.name
        and material.active
        and (course.academic_level is null or course.academic_level = profile.academic_level)
        and (course.stream is null or course.stream = profile.stream)
    )
  )
);

drop policy if exists "Admins can delete academic materials" on storage.objects;
create policy "Admins can delete academic materials"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'academic-materials'
  and (select public.has_role((select auth.uid()), 'admin'))
);

commit;