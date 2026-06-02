import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM ?? "Nemi <onboarding@resend.dev>";

type SendResult = { sent: boolean; reason?: string };

/** Агент урих и-мэйл (нууц үг тохируулах линктэй). */
export async function sendAgentInvite(opts: {
  to: string;
  agentName: string;
  officeName: string;
  actionLink: string;
}): Promise<SendResult> {
  if (!apiKey) return { sent: false, reason: "no_api_key" };
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: opts.to,
    subject: `${opts.officeName} танд Нэми дээр агентын бүртгэл үүсгэлээ`,
    html: `
<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0F172A">
  <div style="background:#F97316;color:#fff;padding:24px;border-radius:16px 16px 0 0;text-align:center">
    <div style="font-size:22px;font-weight:800">Нэми</div>
  </div>
  <div style="border:1px solid #E5E7EB;border-top:0;border-radius:0 0 16px 16px;padding:28px">
    <p style="font-size:16px">Сайн байна уу, <b>${opts.agentName}</b>!</p>
    <p style="color:#64748B;line-height:1.6">
      <b>${opts.officeName}</b> танд Нэми платформ дээр агентын бүртгэл үүсгэлээ.
      Доорх товчийг дарж нууц үгээ тохируулан нэвтэрнэ үү.
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="${opts.actionLink}" style="background:#F97316;color:#fff;text-decoration:none;padding:12px 28px;border-radius:12px;font-weight:700;display:inline-block">
        Нууц үг тохируулах
      </a>
    </div>
    <p style="color:#94A3B8;font-size:12px;line-height:1.5">
      Хэрэв товч ажиллахгүй бол энэ холбоосыг хуулна уу:<br>
      <a href="${opts.actionLink}" style="color:#EA580C">${opts.actionLink}</a>
    </p>
  </div>
  <p style="text-align:center;color:#94A3B8;font-size:12px;margin-top:16px">© 2026 Нэми технологи</p>
</div>`,
  });
  if (error) return { sent: false, reason: error.message };
  return { sent: true };
}

/** Оффис нээх хүсэлт батлагдсан и-мэйл (оффисоор нэвтрэх линктэй). */
export async function sendOfficeApproved(opts: {
  to: string;
  officeName: string;
  loginUrl: string;
}): Promise<SendResult> {
  if (!apiKey) return { sent: false, reason: "no_api_key" };
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: opts.to,
    subject: `Таны «${opts.officeName}» оффисын хүсэлт батлагдлаа 🎉`,
    html: `
<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0F172A">
  <div style="background:#F97316;color:#fff;padding:24px;border-radius:16px 16px 0 0;text-align:center">
    <div style="font-size:22px;font-weight:800">Нэми</div>
  </div>
  <div style="border:1px solid #E5E7EB;border-top:0;border-radius:0 0 16px 16px;padding:28px">
    <p style="font-size:16px">Баяр хүргэе! 🎉</p>
    <p style="color:#64748B;line-height:1.6">
      Таны <b>${opts.officeName}</b> нэртэй оффис нээх хүсэлт <b>батлагдлаа</b>.
      Одоо та оффисын удирдлагын самбартаа нэвтэрч, агентуудаа бүртгэх,
      зар оруулах боломжтой боллоо.
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="${opts.loginUrl}" style="background:#F97316;color:#fff;text-decoration:none;padding:12px 28px;border-radius:12px;font-weight:700;display:inline-block">
        Оффисоор нэвтрэх
      </a>
    </div>
    <p style="color:#94A3B8;font-size:12px;line-height:1.5">
      Хэрэв товч ажиллахгүй бол энэ холбоосыг хуулна уу:<br>
      <a href="${opts.loginUrl}" style="color:#EA580C">${opts.loginUrl}</a>
    </p>
    <p style="color:#94A3B8;font-size:12px;line-height:1.5">
      Та өмнө нэвтэрч байсан и-мэйл, нууц үгээрээ нэвтэрнэ.
    </p>
  </div>
  <p style="text-align:center;color:#94A3B8;font-size:12px;margin-top:16px">© 2026 Нэми технологи</p>
</div>`,
  });
  if (error) return { sent: false, reason: error.message };
  return { sent: true };
}
