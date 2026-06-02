-- ============================================================
-- Realtime: messages, notifications, conversations (Phase 8)
-- RLS-ийн дагуу хэрэглэгч зөвхөн өөрийн харилцааны мессежийг
-- realtime-аар хүлээж авна.
-- ============================================================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.notifications;
