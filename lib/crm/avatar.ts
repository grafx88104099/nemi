/**
 * crm_team_roster, staff_chat_* функцүүдийн avatar_url талбарт агентын зураггүй
 * бол үсгэн товчлол (agents.avatar, ж: «БЭ») ирдэг тул шууд <img src>-д өгч болохгүй.
 */
export function personAvatar(value: string | null, name: string): { src: string | null; initials: string } {
  const isUrl = !!value && /^(https?:\/\/|\/)/.test(value);
  return {
    src: isUrl ? value : null,
    initials: !isUrl && value ? value : name.trim().slice(0, 2).toUpperCase(),
  };
}
