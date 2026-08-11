alter table characters drop constraint characters_tier_check;
alter table characters add constraint characters_tier_check check (tier in ('S','A','B','C','D','E'));