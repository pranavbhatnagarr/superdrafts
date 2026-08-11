alter table characters enable row level security;

create policy "Public read access"
on characters
for select
to anon
using (true);