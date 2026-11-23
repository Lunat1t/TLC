-- Require authenticated student/teacher/admin access in tlc_instruction_access
-- even for rank 0 or unmapped instructions so API endpoints match /instructions/* middleware.

create or replace function public.tlc_instruction_access(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_instruction_id uuid;
  v_user_id uuid := auth.uid();
  v_role text;
  v_onboarding boolean;
  v_min_rank integer;
  v_min_kit text;
  v_card record;
  v_current_rank integer := 0;
begin
  select i.id into v_instruction_id
  from public.instructions i
  where i.slug = p_slug and i.status = 'published';

  if v_instruction_id is null then
    return jsonb_build_object('exists', false, 'allowed', false, 'reason', 'not_found');
  end if;

  select c.rank_index, c.kit
  into v_min_rank, v_min_kit
  from tlc_learning.roadmap_cards c
  where c.instruction_id = v_instruction_id
  order by c.rank_index asc, c.kit asc
  limit 1;

  if v_user_id is null then
    return jsonb_build_object(
      'exists', true,
      'allowed', false,
      'reason', 'unauthenticated',
      'required_rank', coalesce(v_min_rank, 0),
      'required_kit', v_min_kit
    );
  end if;

  if public.can_publish_instruction() then
    return jsonb_build_object(
      'exists', true,
      'allowed', true,
      'bypass', true,
      'required_rank', coalesce(v_min_rank, 0)
    );
  end if;

  select p.role, p.onboarding_complete into v_role, v_onboarding
  from public.profiles p where p.id = v_user_id;

  if v_onboarding is not true or v_role <> 'student' then
    return jsonb_build_object(
      'exists', true,
      'allowed', false,
      'reason', 'forbidden',
      'required_rank', coalesce(v_min_rank, 0),
      'required_kit', v_min_kit
    );
  end if;

  if v_min_rank is null or v_min_rank = 0 then
    return jsonb_build_object('exists', true, 'allowed', true, 'required_rank', 0);
  end if;

  for v_card in
    select c.kit, c.rank_index
    from tlc_learning.roadmap_cards c
    where c.instruction_id = v_instruction_id
    order by c.rank_index asc, c.kit asc
  loop
    v_current_rank := tlc_learning.compute_kit_rank(v_user_id, v_card.kit);
    if v_current_rank >= v_card.rank_index then
      return jsonb_build_object(
        'exists', true,
        'allowed', true,
        'required_rank', v_card.rank_index,
        'required_kit', v_card.kit,
        'current_rank', v_current_rank
      );
    end if;
  end loop;

  v_current_rank := tlc_learning.compute_kit_rank(v_user_id, v_min_kit);
  return jsonb_build_object(
    'exists', true,
    'allowed', false,
    'reason', 'rank_locked',
    'required_rank', v_min_rank,
    'required_kit', v_min_kit,
    'current_rank', v_current_rank
  );
end;
$$;

revoke all on function public.tlc_instruction_access(text) from public;
grant execute on function public.tlc_instruction_access(text) to anon, authenticated;
