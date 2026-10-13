// ============================================================
// PMC CRM — тохиргооны seed (U1 foundation).
// Урсгал PL-1…PL-6, шат/шилжилт/гейт, Д-дүрмүүд, мэдэгдлийн матриц,
// дугаарлалт, салбар, лавлах, тохиргооны анхны утгууд.
// Ажиллуулах:  node scripts/seed-crm.mjs   (SUPABASE_DB_URL шаардана)
// Оффис: CRM_OFFICE_ID env эсвэл offices-ийн эхний мөр.
// Дахин ажиллуулж болно (on conflict — идемпотент; settings-д нээлттэй
// хувилбар байвал шинээр үүсгэхгүй).
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function loadEnv() {
  const p = path.join(ROOT, ".env.local");
  if (!fs.existsSync(p)) return;
  const txt = fs.readFileSync(p, "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();
const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) throw new Error(".env.local-д SUPABASE_DB_URL алга — миграци хэрэглэсний дараа ажиллуулна.");

const J = (v) => JSON.stringify(v);

async function main() {
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const q = (text, params) => client.query(text, params);

  try {
    await q("begin");

    // ── Оффис ──
    let officeId = process.env.CRM_OFFICE_ID ?? null;
    if (!officeId) {
      const r = await q("select id from offices order by created_at limit 1");
      officeId = r.rows[0]?.id ?? null;
    }
    if (!officeId) throw new Error("Оффис олдсонгүй — эхлээд оффис үүсгэнэ.");
    console.log("Оффис:", officeId);

    // created_by/tokens-д хэрэглэх profile (оффисын админ, үгүй бол дурын).
    const pr = await q(
      "select id from profiles where office_id = $1 and role = 'office_admin' limit 1",
      [officeId]
    );
    const adminProfileId = pr.rows[0]?.id ?? (await q("select id from profiles limit 1")).rows[0]?.id;
    if (!adminProfileId) throw new Error("profiles хоосон — эхлээд хэрэглэгч үүсгэнэ.");

    // ── Салбарууд ──
    const branches = [
      { code: "central", name: "Төв" },
      { code: "yarmag", name: "Яармаг-Нисэх" },
    ];
    for (const b of branches) {
      await q(
        `insert into crm_branches (office_id, code, name)
         values ($1, $2, $3)
         on conflict (office_id, code) do update set name = excluded.name`,
        [officeId, b.code, b.name]
      );
    }

    // ── Дугаарлалт ──
    const sequences = [
      ["contact", "C-"],
      ["property", "P-"],
      ["txn_sale", "TS-"],
      ["txn_standard_rental", "TR-"],
      ["txn_managed_rental", "TM-"],
      ["txn_international_sale", "TI-"],
      ["txn_replacement", "TX-"],
      ["invoice", "INV-"],
      ["lease", "L-"],
      ["mgmt_agreement", "MA-"],
    ];
    for (const [kind, prefix] of sequences) {
      await q(
        `insert into crm_sequences (office_id, kind, prefix)
         values ($1, $2, $3) on conflict (office_id, kind) do nothing`,
        [officeId, kind, prefix]
      );
    }

    // ── Урсгал, шат, шилжилт ──
    // stages: [code, name, prob, gate, terminal, closing]
    const SALES_STAGES = [
      ["new", "Шинэ сэжим", 5, "g0", null, false],
      ["qualified", "Чанаржуулсан", 15, "g1", null, false],
      ["matched", "Тохируулга", 25, null, null, false],
      ["showing", "Үзлэг", 40, null, null, false],
      ["offer", "Санал/хэлэлцээр", 60, "g2", null, false],
      ["contract", "Гэрээ", 80, "g4", null, true],
      ["closed_won", "Хаагдсан — амжилттай", 100, "g5", "won", true],
      ["closed_lost", "Алдсан", 0, null, "lost", false],
    ];
    const LISTING_STAGES = [
      ["new", "Шинэ хүсэлт", 5, "g0", null, false],
      ["consult", "Зөвлөгөө/үнэлгээ", 20, "g1", null, false],
      ["agreement", "Листингийн гэрээ", 50, "g3", null, false],
      ["active_listing", "Идэвхтэй листинг", 70, null, null, false],
      ["closed_won", "Хаагдсан — амжилттай", 100, null, "won", true],
      ["closed_lost", "Алдсан", 0, null, "lost", false],
    ];
    const RENTAL_STAGES = [
      ["new", "Шинэ сэжим", 5, "g0", null, false],
      ["qualified", "Чанаржуулсан", 20, "g1", null, false],
      ["showing", "Үзлэг", 40, null, null, false],
      ["offer", "Санал/нөхцөл", 60, "g2", null, false],
      ["contract", "Гэрээ", 85, "g4", null, true],
      ["closed_won", "Хаагдсан — амжилттай", 100, "g5", "won", true],
      ["closed_lost", "Алдсан", 0, null, "lost", false],
    ];
    const RECRUIT_STAGES = [
      ["new", "Шинэ горилогч", 10, null, null, false],
      ["interview", "Ярилцлага", 40, null, null, false],
      ["trial", "Туршилтын хугацаа", 70, null, null, false],
      ["hired", "Ажилд орсон", 100, null, "won", false],
      ["rejected", "Татгалзсан", 0, null, "lost", false],
    ];
    const pipelines = [
      { code: "PL-1", name: "Худалдан авалт", restricted: false, stages: SALES_STAGES },
      { code: "PL-2", name: "Листинг авах", restricted: false, stages: LISTING_STAGES },
      { code: "PL-3", name: "Энгийн түрээс", restricted: false, stages: RENTAL_STAGES },
      { code: "PL-4", name: "Менежменттэй түрээс", restricted: false, stages: RENTAL_STAGES },
      { code: "PL-5", name: "Олон улсын худалдаа", restricted: false, stages: SALES_STAGES },
      { code: "PL-6", name: "Горилогч", restricted: true, stages: RECRUIT_STAGES },
    ];

    for (let pi = 0; pi < pipelines.length; pi++) {
      const p = pipelines[pi];
      const pr2 = await q(
        `insert into crm_pipelines (office_id, code, name, restricted, sort_order)
         values ($1, $2, $3, $4, $5)
         on conflict (office_id, code) do update set name = excluded.name, restricted = excluded.restricted, sort_order = excluded.sort_order
         returning id`,
        [officeId, p.code, p.name, p.restricted, pi]
      );
      const pipelineId = pr2.rows[0].id;

      const stageIds = {};
      for (let si = 0; si < p.stages.length; si++) {
        const [code, name, prob, gate, terminal, closing] = p.stages[si];
        const sr = await q(
          `insert into crm_stages (office_id, pipeline_id, code, name, sort_order, probability, gate_code, is_terminal, terminal_state, is_closing_direction)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           on conflict (pipeline_id, code) do update set
             name = excluded.name, sort_order = excluded.sort_order, probability = excluded.probability,
             gate_code = excluded.gate_code, is_terminal = excluded.is_terminal,
             terminal_state = excluded.terminal_state, is_closing_direction = excluded.is_closing_direction
           returning id`,
          [officeId, pipelineId, code, name, si, prob, gate, terminal !== null, terminal, closing]
        );
        stageIds[code] = sr.rows[0].id;
      }

      // Шилжилтүүд: урагш дараалсан (agent+); буцаалт шалтгаантай (team_lead+);
      // алгасалт зөвхөн sales_director; терминал lost руу дурын идэвхтэй шатнаас.
      const seq = p.stages.filter(([, , , , t]) => t === null).map(([c]) => c);
      const wonCode = p.stages.find(([, , , , t]) => t === "won")?.[0];
      const lostCode = p.stages.find(([, , , , t]) => t === "lost")?.[0];
      const addTransition = async (from, to, kind, roles, reason) => {
        await q(
          `insert into crm_stage_transitions (office_id, pipeline_id, from_stage_id, to_stage_id, kind, allowed_roles, requires_reason)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (from_stage_id, to_stage_id) do update set
             kind = excluded.kind, allowed_roles = excluded.allowed_roles, requires_reason = excluded.requires_reason`,
          [officeId, pipelineId, stageIds[from], stageIds[to], kind, roles, reason]
        );
      };
      const FWD = "{agent,team_lead,sales_director,ops_qc,property_manager}";
      const BWD = "{team_lead,sales_director,ops_qc}";
      const SKIP = "{sales_director}";
      for (let i = 0; i < seq.length - 1; i++) {
        await addTransition(seq[i], seq[i + 1], "forward", FWD, false);
        await addTransition(seq[i + 1], seq[i], "backward", BWD, true);
      }
      // Сүүлийн идэвхтэй шат → won.
      if (wonCode && seq.length) {
        await addTransition(seq[seq.length - 1], wonCode, "forward", FWD, false);
      }
      // Дурын идэвхтэй шат → lost (шалтгаан заавал — F-356).
      if (lostCode) {
        for (const c of seq) await addTransition(c, lostCode, "forward", FWD, true);
      }
      // Алгасалт: 2 шат урагш — зөвхөн sales_director.
      for (let i = 0; i + 2 < seq.length; i++) {
        await addTransition(seq[i], seq[i + 2], "skip", SKIP, true);
      }
    }

    // ── Гейтийн шаардлагууд (бүх урсгалд — pipeline_id null) ──
    const gateReqs = [
      ["g0", "owner_set", {}],
      ["g0", "next_step_set", {}],
      ["g1", "need_profile_complete", { min_pct: 100 }],
      ["g1", "next_step_set", {}],
      ["g2", "offer_recorded", {}],
      ["g3", "listing_agreement", {}],
      ["g4", "kyc_verified", {}],
      ["g4", "aml_not_held", {}],
      ["g4", "docs_complete", { min_pct: 50 }],
      ["g5", "payment_proof", {}],
      ["g5", "handover_done", {}],
      ["g5", "aml_not_held", {}],
      ["g5", "docs_complete", { min_pct: 100 }],
      ["g6", "post_sale_tasks", {}],
    ];
    for (const [gate, checker, params] of gateReqs) {
      const ex = await q(
        `select id from crm_gate_requirements
         where office_id = $1 and gate_code = $2 and checker_kind = $3 and pipeline_id is null`,
        [officeId, gate, checker]
      );
      if (ex.rows.length === 0) {
        await q(
          `insert into crm_gate_requirements (office_id, gate_code, checker_kind, params)
           values ($1, $2, $3, $4)`,
          [officeId, gate, checker, J(params)]
        );
      } else {
        await q(`update crm_gate_requirements set params = $2, is_active = true where id = $1`, [
          ex.rows[0].id,
          J(params),
        ]);
      }
    }

    // ── Тохиргооны анхны утгууд (нээлттэй хувилбар байвал алгасна) ──
    const settings = [
      ["lead_score_weights", { budget_fit: 25, timeline: 20, financing: 15, engagement: 20, source_quality: 10, profile_complete: 10 }],
      ["lead_grade_thresholds", { a: 80, b: 60, c: 40 }],
      // Каноник бүтэц (lib/crm/matching.ts DEFAULT_MATCH_WEIGHTS): 25/25/20/10/15/5 = 100.
      ["match_weights", { location: 25, budget: 25, type_size: 20, timeline: 10, must_haves: 15, nice_to_haves: 5 }],
      ["match_thresholds", { strong: 80, possible: 65 }],
      // Зэргэлдээ бүсийн зураглал {байршлын_код: [зэргэлдээ кодууд]} — хоосон бол
      // зэргэлдээ бүсийн хэсэгчилсэн оноо (adjacent_pct) идэвхгүй.
      ["adjacent_zones", {}],
      ["aml_weights", { customer: 30, geography: 25, product: 20, channel: 15, behavior: 10 }],
      ["aml_threshold_mnt", 20000000],
      ["sla_first_contact_min", 15],
      ["arrears_ladder", { steps: [
        { step: 1, days: 1, role: "agent" },
        { step: 2, days: 4, role: "property_manager" },
        { step: 3, days: 8, role: "sales_director" },
        { step: 4, days: 15, role: "ceo" },
      ] }],
      ["renewal_days", { lease: [60, 30], listing_agreement: [30, 14], management_agreement: [60, 30] }],
      ["photo_min_count", 5],
      ["lead_assignment", { mode: "round_robin", load_cap: 15, rules: [], after_hours: "queue" }],
      ["rental_fee_tiers", { tiers: [
        { code: "12m_plus", min_months: 12, fee_pct: 100 },
        { code: "6_11m", min_months: 6, fee_pct: 70 },
        { code: "1_5m", min_months: 1, fee_pct: 50 },
      ] }],
      ["quiet_hours", { start: "21:00", end: "09:00" }],
      ["maintenance_sla", {
        urgent: { respond_hours: 2, resolve_hours: 24 },
        normal: { respond_hours: 24, resolve_hours: 72 },
        planned: { respond_hours: 72, resolve_hours: 336 },
      }],
      ["fx_rates", {}],
      ["doc_upload_policy", {
        default: { allowed_mime: ["application/pdf", "image/jpeg", "image/png"], max_bytes: 20971520 },
        photo: { allowed_mime: ["image/jpeg", "image/png", "image/webp"], max_bytes: 10485760 },
      }],
      ["property_status_transitions", { transitions: [
        { from: "draft", to: "active", roles: ["agent", "team_lead", "sales_director", "property_manager"], check: "activation" },
        { from: "active", to: "reserved", roles: ["agent", "team_lead", "sales_director", "property_manager"] },
        { from: "reserved", to: "active", roles: ["agent", "team_lead", "sales_director", "property_manager"], reason: true },
        { from: "reserved", to: "sold", roles: ["sales_director", "ops_qc"] },
        { from: "reserved", to: "rented", roles: ["sales_director", "ops_qc", "property_manager"] },
        { from: "active", to: "withdrawn", roles: ["sales_director", "ops_qc"], reason: true },
        { from: "rented", to: "active", roles: ["property_manager", "sales_director"] },
        { from: "withdrawn", to: "draft", roles: ["sales_director", "ops_qc"], reason: true },
      ] }],
      ["aml_doc_retention_years", 5],
      ["aml_report_business_days", 5],
      ["activity_edit_window_hours", 24],
      // Шимтгэл (U7): татвар/суутгал — БОДИТ хувиа оффис заавал тохируулна (F-455).
      ["commission_tax", { pct: 0 }],
      // Post-sale (U8): NPS босго/хоцроолт, дахин холбоо, идэвхгүйн босго (Д-27/28/29, F-127/128).
      ["nps_low_threshold", 6],
      ["nps_send_delay_days", 3],
      ["invoice_reminder_days", 3],
      ["monthly_record_reminder_day", 25],
      ["recontact_frequency", { a: 3, b: 7, c: 21, d: 60 }],
      ["inactivity_thresholds", { a: 14, b: 30, c: 60, d: 90 }],
      // Тайлан (U9): R-05 агентын оноо, R-11 маркетингийн зардал, R-10 тайлангийн хугацаа.
      ["agent_score_weights", { activity: 20, pipeline: 20, progress: 20, closing: 20, followup: 10, quality: 10 }],
      ["weekly_targets", { material: 25, qualified: 3, progress: 5, closings: 1 }],
      ["marketing_costs", {}],
      ["statement_due_days", 10],
    ];
    for (const [key, value] of settings) {
      const ex = await q(
        `select id from crm_settings where office_id = $1 and key = $2 and valid_to is null`,
        [officeId, key]
      );
      if (ex.rows.length === 0) {
        await q(
          `insert into crm_settings (office_id, key, value, created_by, note)
           values ($1, $2, $3, $4, 'seed — анхны утга')`,
          [officeId, key, J(value), adminProfileId]
        );
      }
    }

    // ── Автомат дүрмүүд Д-01…Д-30 ──
    const rules = [
      ["D-01", "Шинэ сэжимийн автомат хуваарилалт + эхний холболтын даалгавар", "event:lead.created", { after_hours: "queue" }, [{ kind: "create_task" }, { kind: "notify", params: { event: "lead_assigned" } }]],
      ["D-02", "Эхний холболтын SLA (15 мин) сануулга", "cron:sla", { setting: "sla_first_contact_min" }, [{ kind: "notify", params: { event: "lead_sla_breach" } }]],
      ["D-03", "24 цагт дахин оролдлогын даалгавар", "cron:sla", { hours: 24 }, [{ kind: "create_task" }]],
      ["D-04", "48 цагт багийн ахлагчид эскалаци", "cron:sla", { hours: 48 }, [{ kind: "notify", params: { role: "team_lead" } }]],
      ["D-05", "Үзлэгийн 24 цагийн саналын даалгавар", "event:activity.showing", { hours: 24 }, [{ kind: "create_task" }]],
      ["D-06", "Санал бүртгэгдмэгц эргэн холбогдох сануулга", "event:offer.created", {}, [{ kind: "create_task" }, { kind: "notify", params: { event: "offer_recorded" } }]],
      ["D-07", "Листинг идэвхжмэгц урвуу тохируулга", "event:property.activated", {}, [{ kind: "create_record", params: { entity: "matches" } }]],
      ["D-08", "Гейт хаалттай шилжилтийг хориглох", "event:opportunity.stage", {}, [{ kind: "block" }]],
      ["D-09", "Хэлцэл хаагдмагц post-sale багц даалгавар", "event:transaction.closed", {}, [{ kind: "create_task", params: { checklist: "post_sale" } }]],
      ["D-10", "Хэлцлийн бүрдэл дутуу бол хаалт хориглох", "event:transaction.status", {}, [{ kind: "block" }]],
      ["D-11", "Гарах ажилтны хүлээлцэх багц", "event:staff.offboarding", {}, [{ kind: "create_task" }, { kind: "notify", params: { event: "offboarding_started" } }]],
      ["D-12", "AML hold үед хаалтын чиглэлийн шилжилт хориглох", "event:opportunity.stage", {}, [{ kind: "block" }]],
      ["D-13", "Сарын нэхэмжлэх автомат үүсгэлт", "cron:monthly", { skip_vacant: true }, [{ kind: "create_record", params: { entity: "invoices" } }]],
      ["D-14", "Сарын менежментийн бүртгэл үүсгэлт", "cron:monthly", {}, [{ kind: "create_record", params: { entity: "monthly_records" } }]],
      ["D-15", "Нэхэмжлэхийн хугацааны сануулга", "cron:daily", {}, [{ kind: "notify", params: { event: "invoice_due" } }]],
      ["D-16", "Хоцролтын шатлалын эскалаци", "cron:daily", { setting: "arrears_ladder" }, [{ kind: "create_task" }, { kind: "notify", params: { event: "arrears_step" } }]],
      ["D-17", "Гэрээний сунгалт — 60 хоногийн сануулга", "cron:daily", { days: 60 }, [{ kind: "create_task" }]],
      ["D-18", "Гэрээний сунгалт — 30 хоногийн сануулга", "cron:daily", { days: 30 }, [{ kind: "create_task" }, { kind: "notify", params: { event: "lease_renewal_due" } }]],
      ["D-19", "Гарах мэдэгдэлд make-ready урсгал", "event:lease.notice", {}, [{ kind: "create_task" }]],
      ["D-20", "Засварын SLA хэтрэлтийн эскалаци", "cron:sla", { setting: "maintenance_sla" }, [{ kind: "notify", params: { event: "maintenance_sla" } }, { kind: "create_task" }]],
      ["D-21", "Сарын бүртгэл дутуугийн сануулга", "cron:daily", {}, [{ kind: "notify", params: { event: "monthly_record_due" } }]],
      ["D-22", "Өмчлөгчийн тайлангийн даалгавар", "cron:monthly", {}, [{ kind: "create_task" }]],
      ["D-23", "Барьцаа буцаалтын хяналтын даалгавар", "event:lease.terminated", {}, [{ kind: "create_task" }]],
      ["D-24", "Сунгалтын гинжин холболт", "event:lease.renewed", {}, [{ kind: "set_field" }]],
      ["D-25", "20 сая ₮ босго — автомат дохио + 5 ажлын өдрийн тоолуур", "event:payment.created", { setting: "aml_threshold_mnt", methods: ["cash", "foreign", "virtual"] }, [{ kind: "create_record", params: { entity: "aml_alerts" } }]],
      ["D-26", "СГТ 24 цагийн тоолуурын эскалаци", "cron:sla", { hours: 24 }, [{ kind: "notify", params: { role: "aml_officer" } }]],
      ["D-27", "Оноо/ангиллын өдөр тутмын refresh", "cron:daily", {}, [{ kind: "set_field" }]],
      ["D-28", "Идэвхгүй харилцагчийн эргэн холбогдолт", "cron:daily", { setting: "recontact_days" }, [{ kind: "create_task" }]],
      ["D-29", "Эргэлтэд орсон сэжимийн дахин идэвхжүүлэлт", "cron:daily", { setting: "recontact_days" }, [{ kind: "create_task" }]],
      ["D-30", "Салбар зөрсөн бүртгэлд хамтран ажиллах даалгавар", "event:property.created", {}, [{ kind: "create_task" }]],
    ];
    for (const [code, name, trigger, condition, actions] of rules) {
      await q(
        `insert into crm_automation_rules (office_id, code, name, trigger_kind, condition, actions)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (office_id, code) do update set
           name = excluded.name, trigger_kind = excluded.trigger_kind`,
        [officeId, code, name, trigger, J(condition), J(actions)]
      );
    }

    // ── Мэдэгдлийн матриц (ACC-25: AML үйл явдалд агент/харилцагчид мэдэгдэл ҮГҮЙ) ──
    const matrix = [
      ["lead_assigned", "{agent,team_lead}", "{app}", true, false],
      ["lead_sla_breach", "{agent,team_lead}", "{app}", true, true],
      ["next_step_overdue", "{agent,team_lead}", "{app}", true, false],
      ["match_found", "{agent}", "{app}", false, false],
      ["showing_feedback_due", "{agent}", "{app}", false, false],
      ["offer_recorded", "{agent,team_lead,sales_director}", "{app}", false, false],
      ["stage_moved", "{agent,team_lead}", "{app}", false, false],
      ["gate_blocked", "{agent}", "{app}", false, false],
      ["txn_status_changed", "{agent,sales_director,finance}", "{app}", false, false],
      ["arrears_step", "{agent,property_manager,finance}", "{app}", true, false],
      ["invoice_due", "{property_manager,finance}", "{app}", false, false],
      ["lease_renewal_due", "{agent,property_manager}", "{app}", false, false],
      ["maintenance_sla", "{property_manager,ops_qc}", "{app}", true, true],
      ["commission_status", "{agent,finance}", "{app}", false, false],
      ["monthly_record_due", "{property_manager}", "{app}", true, false],
      ["owner_statement_due", "{property_manager}", "{app}", false, false],
      ["offboarding_started", "{sales_director,ops_qc,sysadmin}", "{app}", true, false],
      ["rule_error", "{sysadmin}", "{app}", true, true],
      // U8 post-sale + AML SLA үйл явдлууд (ACC-25: AML мөрүүд ЗӨВХӨН aml_officer/ceo).
      ["complaint_created", "{sales_director,ops_qc}", "{app}", true, false],
      ["nps_answered", "{agent,marketing}", "{app}", false, false],
      ["deposit_return_due", "{property_manager,finance}", "{app}", false, false],
      ["aml_threshold_due", "{aml_officer,ceo}", "{app}", true, true],
      ["aml_str_due", "{aml_officer,ceo}", "{app}", true, true],
    ];
    for (const [event, roles, channels, mandatory, exempt] of matrix) {
      await q(
        `insert into crm_notification_matrix (office_id, event_code, recipient_roles, channels, mandatory, quiet_hours_exempt)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (office_id, event_code) do update set
           recipient_roles = excluded.recipient_roles, channels = excluded.channels,
           mandatory = excluded.mandatory, quiet_hours_exempt = excluded.quiet_hours_exempt`,
        [officeId, event, roles, channels, mandatory, exempt]
      );
    }

    // ── Лавлахууд ──
    const lookups = {
      lead_source: [
        ["website", "Вэбсайт"],
        ["facebook", "Фэйсбүүк"],
        ["instagram", "Инстаграм"],
        ["referral", "Санал болголт"],
        ["walk_in", "Шууд ирсэн"],
        ["phone", "Утсаар"],
        ["partner", "Түнш байгууллага"],
        ["other", "Бусад", true],
      ],
      lost_reason: [
        ["price", "Үнэ тохироогүй"],
        ["competitor", "Өрсөлдөгчийг сонгосон"],
        ["postponed", "Хойшлуулсан"],
        ["financing", "Санхүүжилт бүрдээгүй"],
        ["no_contact", "Холбоо тасарсан"],
        ["other", "Бусад", true],
      ],
      objection: [
        ["price_high", "Үнэ өндөр"],
        ["location", "Байршил тохирохгүй"],
        ["condition", "Нөхцөл байдал"],
        ["timing", "Цаг хугацаа"],
        ["other", "Бусад", true],
      ],
      maintenance_category: [
        ["plumbing", "Сантехник"],
        ["electric", "Цахилгаан"],
        ["heating", "Халаалт"],
        ["appliance", "Тоног төхөөрөмж"],
        ["structural", "Барилгын"],
        ["other", "Бусад", true],
      ],
      tag: [
        ["vip", "VIP"],
        ["investor", "Хөрөнгө оруулагч"],
        ["repeat", "Давтан үйлчлүүлэгч"],
        ["intl", "Олон улсын"],
      ],
      goal: [
        ["live", "Амьдрах"],
        ["invest", "Хөрөнгө оруулалт"],
        ["business", "Бизнесийн зориулалт"],
        ["other", "Бусад", true],
      ],
      blocker: [
        ["loan", "Зээл хүлээгдэж буй"],
        ["sale_first", "Эхлээд зарах шаардлагатай"],
        ["docs", "Бичиг баримт дутуу"],
        ["other", "Бусад", true],
      ],
      decision_maker: [
        ["self", "Өөрөө"],
        ["spouse", "Гэр бүл хамт"],
        ["company", "Байгууллагын шийдвэр"],
        ["other", "Бусад", true],
      ],
      condition: [
        ["furnished", "Тавилгатай"],
        ["parking", "Зогсоолтой"],
        ["pet_ok", "Амьтан зөвшөөрнө"],
        ["balcony", "Тагттай"],
      ],
    };
    for (const [kind, values] of Object.entries(lookups)) {
      for (let i = 0; i < values.length; i++) {
        const [code, label, requiresNote] = values[i];
        await q(
          `insert into crm_lookups (office_id, kind, code, label, requires_note, sort_order)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (office_id, kind, code) do update set
             label = excluded.label, requires_note = excluded.requires_note, sort_order = excluded.sort_order`,
          [officeId, kind, code, label, requiresNote === true, i]
        );
      }
    }

    // ── Хуваарилалтын төлөвийн эхний мөр ──
    await q(
      `insert into crm_assignment_state (office_id, scope) values ($1, 'default')
       on conflict (office_id, scope) do nothing`,
      [officeId]
    );

    await q("commit");
    console.log("CRM seed амжилттай:", {
      pipelines: pipelines.length,
      rules: rules.length,
      matrix: matrix.length,
      settings: settings.length,
    });
  } catch (e) {
    await q("rollback");
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("seed-crm алдаа:", e.message);
  process.exit(1);
});
