begin;

create or replace function private.broadcast_notification_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'type', 'notification.created',
      'version', 1,
      'notificationId', new.id,
      'recipientId', new.recipient_id,
      'changedAt', now()
    ),
    'notification.created',
    'user:' || new.recipient_id::text || ':notifications',
    true
  );

  return null;
end;
$$;

drop trigger if exists broadcast_notification_signal_after_insert
  on public.notifications;
create trigger broadcast_notification_signal_after_insert
after insert on public.notifications
for each row execute function private.broadcast_notification_signal();

drop policy if exists notification_realtime_receive_own_broadcasts
  on realtime.messages;
create policy notification_realtime_receive_own_broadcasts
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.messages.topic = (select realtime.topic())
  and (select realtime.topic()) =
    ('user:' || (select auth.uid())::text || ':notifications')
  and (select private.current_profile_is_active())
);

revoke execute on function private.broadcast_notification_signal()
  from public, anon, authenticated;

comment on function private.broadcast_notification_signal() is
  'Emits private notification.created Broadcast signals to user:{recipientId}:notifications without exposing notification content.';

commit;
