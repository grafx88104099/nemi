// ============================================================
// PMC CRM — тохиргооны seed (PRO-001 v2.1).
// Урсгал PL-1…PL-6, шат/шилжилт/шилжих шалгуур, Д-дүрмүүд, мэдэгдлийн матриц,
// дугаарлалт, салбар, лавлах, тохиргооны анхны утгууд.
// Ажиллуулах:  node scripts/seed-crm.mjs   (SUPABASE_DB_URL шаардана;
// миграци 20261107000100…000400 тавигдсаны дараа)
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


    // ── Урсгал, шат, шилжилт (PRO-001 v2.1 §6.13, §6.14; migration 20261107000200-тэй ижил) ──
    // stages: [code, name, prob, gate, terminal, closing]
    const SALES_STAGES = [
      ["new", "Шинэ", 5, "g0", null, false],
      ["contacted", "Холбогдсон", 10, "g_contact", null, false],
      ["qualified", "Шалгуур хангасан", 15, "g1", null, false],
      ["matched", "Тохируулсан", 25, "g_match", null, false],
      ["showing", "Үзлэг", 40, "g_showing", null, false],
      ["interested", "Сонирхсон", 50, "g_interest", null, false],
      ["offer", "Үнийн санал", 60, "g2", null, false],
      ["negotiation", "Хэлэлцээр", 70, "g_counter", null, false],
      ["contract", "Гэрээ", 80, "g4", null, true],
      ["payment_closing", "Төлбөр / хаалт", 90, null, null, true],
      ["closed_won", "Амжилттай хаагдсан", 100, "g5", "won", true],
      ["closed_lost", "Амжилтгүй хаагдсан", 0, null, "lost", false],
    ];
    const LISTING_STAGES = [
      ["new", "Өмчлөгчийн сэжим", 5, "g0", null, false],
      ["contacted", "Холбогдсон", 10, "g_contact", null, false],
      ["meeting", "Уулзалт", 15, "g_meeting", null, false],
      ["consult", "Үнэлгээ, үнэ тогтоолт", 20, "g_valuation", null, false],
      ["agreement", "Листингийн гэрээ", 50, "g3", null, false],
      ["active_listing", "Идэвхтэй листинг", 60, "g_listing_live", null, false],
      ["showings", "Үзлэгүүд", 65, "g_buyer_activity", null, false],
      ["offer", "Үнийн санал", 70, "g2", null, false],
      ["negotiation", "Хэлэлцээр", 75, "g_counter", null, false],
      ["contract", "Гэрээ", 85, "g4", null, true],
      ["closing", "Хаалт", 95, null, null, true],
      ["closed_won", "Хаагдсан (амжилттай)", 100, "g5", "won", true],
      ["closed_lost", "Хаагдсан (амжилтгүй)", 0, null, "lost", false],
    ];
    // Ш1: түрээсийн урсгалд Холбогдсон, Хэлэлцээр нэмэгдэнэ; бусад хэвээр.
    const RENTAL_STAGES = [
      ["new", "Шинэ", 5, "g0", null, false],
      ["contacted", "Холбогдсон", 10, "g_contact", null, false],
      ["qualified", "Шалгуур хангасан", 20, "g1", null, false],
      ["showing", "Үзлэг", 40, null, null, false],
      ["offer", "Үнийн санал", 60, "g2", null, false],
      ["negotiation", "Хэлэлцээр", 70, "g_counter", null, false],
      ["contract", "Гэрээ", 85, "g4", null, true],
      ["closed_won", "Амжилттай хаагдсан", 100, "g5", "won", true],
      ["closed_lost", "Амжилтгүй хаагдсан", 0, null, "lost", false],
    ];
    const RECRUIT_STAGES = [
      ["new", "Шинэ горилогч", 10, null, null, false],
      ["interview", "Ярилцлага", 40, null, null, false],
      ["trial", "Туршилтын хугацаа", 70, null, null, false],
      ["hired", "Ажилд орсон", 100, null, "won", false],
      ["rejected", "Татгалзсан", 0, null, "lost", false],
    ];
    // rebuild — шилжилтийг бүрэн устгаж дахин үүсгэнэ (v2.1).
    // manualWon — сүүлийн идэвхтэй шатнаас «амжилттай» руу гар шилжилт.
    //   PL-1/2/5-д байхгүй: зөвхөн хэлцэл хаагдахад автоматаар (U3 trigger).
    const pipelines = [
      { code: "PL-1", name: "Худалдан авалт", restricted: false, stages: SALES_STAGES, rebuild: true, manualWon: false },
      { code: "PL-2", name: "Листинг авах", restricted: false, stages: LISTING_STAGES, rebuild: true, manualWon: false },
      { code: "PL-3", name: "Энгийн түрээс", restricted: false, stages: RENTAL_STAGES, rebuild: true, manualWon: true },
      { code: "PL-4", name: "Менежменттэй түрээс", restricted: false, stages: RENTAL_STAGES, rebuild: true, manualWon: true },
      { code: "PL-5", name: "Олон улсын худалдаа", restricted: false, stages: SALES_STAGES, rebuild: true, manualWon: false },
      { code: "PL-6", name: "Горилогч", restricted: true, stages: RECRUIT_STAGES, rebuild: false, manualWon: true },
    ];
    const pipelineIds = {};

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
      pipelineIds[p.code] = pipelineId;

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

      // Шилжилтүүд: урагш дараалсан (агент+); буцаалт шалтгаантай (ахлагч+);
      // алгасалт (2 шат) зөвхөн Борлуулалт хариуцсан захирал; дурын идэвхтэй
      // шатнаас «амжилтгүй» руу шалтгаантай.
      if (p.rebuild) {
        await q(`delete from crm_stage_transitions where pipeline_id = $1`, [pipelineId]);
      }
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
      if (p.manualWon && wonCode && seq.length) {
        await addTransition(seq[seq.length - 1], wonCode, "forward", FWD, false);
      }
      if (lostCode) {
        for (const c of seq) await addTransition(c, lostCode, "forward", FWD, true);
      }
      for (let i = 0; i + 2 < seq.length; i++) {
        await addTransition(seq[i], seq[i + 2], "skip", SKIP, true);
      }
    }

    // ── Шилжих шалгуурын шаардлагууд ──
    // [gate, checker, params, pipelineCode|null]
    // Шинэ checker-ийн DB хэрэгжүүлэлт (crm_check_gate_rec) U3-д. Seed нь
    // функцийн эх текстэд тухайн checker-ийн салбар байгаа эсэхийг шалгаж,
    // байхгүй бол шинэ мөрийг идэвхгүй үүсгэнэ (танигдаагүй checker «дутуу»
    // болж шилжилтийг бүхэлд нь гацаадаг). Байгаа мөрийг идэвхгүй болгохгүй.
    const gateReqs = [
      ["g0", "owner_set", {}, null],
      ["g0", "next_step_set", {}, null],
      ["g_contact", "meaningful_contact", {}, null],
      ["g_contact", "next_step_set", {}, null],
      ["g1", "need_profile_complete", { min_pct: 100 }, null],
      ["g1", "next_step_set", {}, null],
      ["g_match", "match_suggested", {}, null],
      ["g_showing", "showing_logged", {}, null],
      ["g_interest", "interest_confirmed", {}, null],
      ["g2", "offer_recorded", {}, null],
      ["g_counter", "counter_recorded", {}, null],
      ["g_meeting", "meeting_scheduled", {}, null],
      ["g_valuation", "price_analysis", {}, null],
      ["g3", "listing_agreement", {}, null],
      ["g_listing_live", "property_active", {}, null],
      ["g_buyer_activity", "showing_on_property", {}, null],
      ["g4", "kyc_verified", {}, null],
      ["g4", "aml_not_held", {}, null],
      ["g4", "docs_complete", { min_pct: 50 }, null],
      ["g4", "offer_accepted", {}, "PL-1"],
      ["g4", "offer_accepted", {}, "PL-2"],
      ["g4", "offer_accepted", {}, "PL-5"],
      ["g5", "payment_proof", {}, null],
      ["g5", "handover_done", {}, null],
      ["g5", "aml_not_held", {}, null],
      ["g5", "docs_complete", { min_pct: 100 }, null],
      ["g6", "post_sale_tasks", {}, null],
    ];
    const gateFn = await q(
      `select coalesce(string_agg(pg_get_functiondef(p.oid), E'\\n'), '') as src
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'crm_check_gate_rec'`
    );
    const gateSrc = gateFn.rows[0]?.src ?? "";
    const checkerSupported = (kind) =>
      new RegExp(`when '${kind}' then\\s*(\\n|ok\\s*:=)`).test(gateSrc);
    let gatesInactive = 0;
    for (const [gate, checker, params, plCode] of gateReqs) {
      const pipelineId = plCode ? pipelineIds[plCode] : null;
      const supported = checkerSupported(checker);
      const ex = await q(
        `select id from crm_gate_requirements
         where office_id = $1 and gate_code = $2 and checker_kind = $3 and pipeline_id is not distinct from $4`,
        [officeId, gate, checker, pipelineId]
      );
      if (ex.rows.length === 0) {
        await q(
          `insert into crm_gate_requirements (office_id, gate_code, pipeline_id, checker_kind, params, is_active)
           values ($1, $2, $3, $4, $5, $6)`,
          [officeId, gate, pipelineId, checker, J(params), supported]
        );
      } else if (supported) {
        await q(`update crm_gate_requirements set params = $2, is_active = true where id = $1`, [ex.rows[0].id, J(params)]);
      } else {
        await q(`update crm_gate_requirements set params = $2 where id = $1`, [ex.rows[0].id, J(params)]);
      }
      if (!supported) gatesInactive += 1;
    }

    // ── Тохиргооны анхны утгууд (нээлттэй хувилбар байвал алгасна —
    //    утга өөрчлөх бол migration-оор шинэ хувилбар) ──
    const settings = [
      // §6.6: 6 шалгуур 20/25/20/15/10/10 (lib/crm/scoring.ts DEFAULT_SCORE_WEIGHTS).
      ["lead_score_weights", { need_clarity: 20, budget_financing: 25, timeline: 20, decision_maker: 15, engagement: 10, match_readiness: 10 }],
      ["lead_score_factors", {
        timeline: { "0_30": 1, "1_3m": 0.75, "3_12m": 0.4, "12m_plus": 0.15 },
        financing: { cash: 1, mixed: 0.8, loan: 0.6, not_ready: 0.1 },
        budget: { max_and_target: 1, max_only: 0.6 },
        budget_financing_split: { budget: 0.5, financing: 0.5 },
        engagement: { full_activity_count: 8, fresh_days: 3, stale_days: 30 },
        decision_maker: { involved: 1, known: 0.5 },
        must_haves_min: 3,
      }],
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
      // §6.4: ажлын цаг (УБ) ба эх сурвалжаар ялгаатай SLA (lib/crm/calendar.ts leadSlaDeadline).
      ["sla_policy", {
        work_hours: { start: 9, end: 18 },
        by_source: {
          default: { kind: "minutes", minutes: 15 },
          referral: { kind: "same_day" },
          personal_network: { kind: "same_day" },
        },
      }],
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
      // Шимтгэл: татвар/суутгал — БОДИТ хувиа оффис заавал тохируулна.
      ["commission_tax", { pct: 0 }],
      // Борлуулалтын дараах: NPS босго/хоцроолт, дахин холбоо, идэвхгүйн босго (Д-27/28/29).
      ["nps_low_threshold", 6],
      ["nps_send_delay_days", 3],
      ["invoice_reminder_days", 3],
      ["monthly_record_reminder_day", 25],
      ["recontact_frequency", { a: 3, b: 7, c: 21, d: 60 }],
      // §6.5: ангиллын давтамжийн муж ба шатаар (lib/crm/scoring.ts recontactDays).
      ["recontact_ranges", {
        a: { min_days: 1, max_days: 3, default_days: 3,
             stage_days: { interested: 2, offer: 1, negotiation: 1, contract: 1, payment_closing: 1, closing: 1 } },
        b: { min_days: 7, max_days: 7, default_days: 7 },
        c: { min_days: 14, max_days: 28, default_days: 21 },
        d: { min_days: 30, max_days: 90, default_days: 60, via_campaign: true },
      }],
      ["inactivity_thresholds", { a: 14, b: 30, c: 60, d: 90 }],
      // Тайлан: агентын оноо, маркетингийн зардал, тайлангийн хугацаа.
      ["agent_score_weights", { activity: 20, pipeline: 20, progress: 20, closing: 20, followup: 10, quality: 10 }],
      ["weekly_targets", { material: 25, qualified: 3, progress: 5, closings: 1 }],
      ["marketing_costs", {}],
      ["statement_due_days", 10],
      // PRO-001 v2.1 — 20261107000500…002200 миграцийн анхны утгатай ижил (шинэ оффист).
      ["automation_thresholds", {"lead_protection":{"warn_before_days":1,"new_no_contact_days":3},"offer_expiring_days":2,"offer_followup_days":1,"hot_lead_inactive_days":3,"showing_feedback_hours":24,"next_step_overdue_escalate_days":3,"showing_feedback_escalate_hours":48}],
      ["deal_flow", {"export_roles":["sales_director","ops_qc","finance","ceo"],"stage_stale_days":{"new":3,"offer":7,"default":14,"contacted":5,"negotiation":10},"fee_invoice_required":true,"contract_reviewer_roles":["ops_qc","sales_director"],"material_concession_pct":5,"offer_valid_days_default":3,"concession_approver_roles":["sales_director","ceo"],"acceptance_evidence_required":true,"handover_offset_days_default":7,"price_analysis_min_comparables":3}],
      ["lead_accept", {"enabled":true,"window_min":15}],
      ["recycle_thresholds", {"a":14,"b":30,"c":60,"d":90,"new_no_contact_days":3}],
      ["pool_settings", {"max_pending_claims":3}],
      ["lead_dispute", {"appeal_days":5,"response_days":2}],
      ["export_limits", {"direct_max_rows":500,"request_valid_hours":24}],
      ["contact_retention_years", 5],
      ["quality_audit", {"pass_score":90,"fix_due_days":3,"grade_review_days":30,"consent_grace_days":7,"showing_note_hours":48,"profile_complete_pct":100,"sample_per_criterion":10,"commission_quality_min_pct":80}],
      ["kpi_scope", {"sales_pipelines":["PL-1","PL-2","PL-3","PL-4","PL-5"],"funnel_pipelines":["PL-1","PL-3","PL-4","PL-5"]}],
      ["kpi_targets", {"overdue_max_pct":5,"offer_followup_pct":100,"same_day_logging_pct":95,"showing_feedback_pct":95,"hot_lead_frequency_pct":100,"next_step_coverage_pct":100,"showing_feedback_hours":24,"sufficient_pipeline_mnt":null}],
      ["campaign_costs", {}],
      ["weekly_cycle", {"agenda":[{"key":"dashboard","minutes":10},{"key":"agents","minutes":25},{"key":"pipeline","minutes":15},{"key":"coaching","minutes":10}],"review":{"time":"16:00","weekday":5},"anomaly":{"gap_pct":50,"overdue_min":5,"score_below":50},"meeting":{"time":"10:00","weekday":1,"duration_min":60},"coaching":{"score_below":50,"task_due_days":3,"consecutive_weeks":2,"overdue_followups_min":5},"na_policy":"rescale","new_agent":{"days":90,"enabled":false,"weights":{"closing":10,"quality":10,"activity":25,"followup":10,"pipeline":25,"progress":20}},"agent_slot_max":5,"agent_slot_min":3,"default_targets":{"offers":1,"showings":3,"closed_deals":1,"stage_advances":5,"qualified_leads":3,"outbound_contacts":25,"meaningful_conversations":10},"outbound_channels":["call","chat","email"],"plan_reminder_hours":16,"meeting_reminder_min":30,"conversation_channels":["call","chat","meeting"],"approver_fallback_roles":["sales_director"],"final_lock_offset_hours":0}],
      ["today_queue", {"sla_warn_min":10,"snooze_hours":[1,3,24],"day_close_hour":17,"conversion_days":90,"snooze_max_per_day":10}],
      ["daily_rhythm", {"1":["Долоо хоногийн хурал","Урсгалын цэвэрлэгээ","Идэвхтэй хайлт","Уулзалт товлох"],"2":["Идэвхтэй хайлт","Өмчлөгч, худалдан авагчтай уулзалт","Листинг"],"3":["Идэвхтэй хайлт","Үзлэг","Эргэн холбогдолт","Хэлэлцээр"],"4":["Урсгалын хөрвөлт","Үзлэг","Үнийн санал","Листинг"],"5":["Хаалтын шат","Хугацаа хэтэрсэн эргэн холбогдолт","Долоо хоногийн дүн шинжилгээ"],"6":["Үзлэг","Нээлттэй үзлэг","CRM-ийн шинэчлэл"],"7":["Үзлэг","Нээлттэй үзлэг","CRM-ийн шинэчлэл"]}],
      ["daily_norms", {"client_meetings":1,"closing_actions":1,"property_listings":0,"property_showings":1,"prospecting_new_opps":1,"client_meaningful_contacts":8}],
      ["worklists", {"disabled":[],"vitals_warn":3,"vitals_alert":6,"hot_stale_days":3,"warm_stale_days":7,"few_attempts_max":3,"few_attempts_window_days":14,"showing_no_feedback_hours":24}],
      ["leaderboard", {"weights":{"offer":5,"contract":8,"closed_won":13,"showing_done":3,"meaningful_contact":1},"show_zero":false,"tv_refresh_sec":120}],
      ["tracks", {"task_hour":10}],
      ["push_defaults", {"events":["lead_assigned","lead_sla_breach","lead_retry_due","lead_no_contact_48h","hot_lead_inactive","showing_feedback_due","showing_feedback_overdue","offer_expiring","match_found","next_step_overdue"]}],
      ["public_links", {"collection_days":7,"owner_report_days":30,"collection_max_items":7,"collection_min_items":3,"visits_per_event_hour":120,"open_house_early_hours":1,"open_house_grace_hours":4,"visits_per_client_hour":5}],
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
      ["D-02", "Эхний холболтын SLA сануулга (ажлын цагаар)", "cron:sla", { setting: "sla_first_contact_min" }, [{ kind: "notify", params: { event: "lead_sla_breach" } }]],
      ["D-03", "Холбогдож чадаагүй — 24 цагт дахин оролдлогын даалгавар", "cron:sla", { hours: 24 }, [{ kind: "create_task" }]],
      ["D-04", "48 цагт утга бүхий холболтгүй — Багийн ахлагчид", "cron:sla", { hours: 48 }, [{ kind: "notify", params: { role: "team_lead" } }]],
      ["D-05", "Үзлэгийн 24 цагийн эргэх холбооны даалгавар", "event:activity.showing", { hours: 24 }, [{ kind: "create_task" }]],
      ["D-06", "Үнийн санал бүртгэгдмэгц эргэн холбогдох сануулга", "event:offer.created", {}, [{ kind: "create_task" }, { kind: "notify", params: { event: "offer_recorded" } }]],
      ["D-07", "Листинг идэвхжмэгц тохирох харилцагч хайх", "event:property.activated", {}, [{ kind: "create_record", params: { entity: "matches" } }]],
      ["D-08", "Шилжих шалгуур хангаагүй шилжилтийг хориглох", "event:opportunity.stage", {}, [{ kind: "block" }]],
      ["D-09", "Хэлцэл хаагдмагц борлуулалтын дараах даалгавар", "event:transaction.closed", {}, [{ kind: "create_task", params: { checklist: "post_sale" } }]],
      ["D-10", "Хэлцлийн бүрдэл дутуу бол хаалт хориглох", "event:transaction.status", {}, [{ kind: "block" }]],
      ["D-11", "Гарах ажилтны хүлээлцэх багц", "event:staff.offboarding", {}, [{ kind: "create_task" }, { kind: "notify", params: { event: "offboarding_started" } }]],
      ["D-12", "МУТСТ түгжээтэй үед хаалтын чиглэлийн шилжилт хориглох", "event:opportunity.stage", {}, [{ kind: "block" }]],
      ["D-13", "Сарын нэхэмжлэх автомат үүсгэлт", "cron:monthly", { skip_vacant: true }, [{ kind: "create_record", params: { entity: "invoices" } }]],
      ["D-14", "Сарын менежментийн бүртгэл үүсгэлт", "cron:monthly", {}, [{ kind: "create_record", params: { entity: "monthly_records" } }]],
      ["D-15", "Нэхэмжлэхийн хугацааны сануулга", "cron:daily", {}, [{ kind: "notify", params: { event: "invoice_due" } }]],
      ["D-16", "Хоцролтын шатлалын эскалаци", "cron:daily", { setting: "arrears_ladder" }, [{ kind: "create_task" }, { kind: "notify", params: { event: "arrears_step" } }]],
      ["D-17", "Гэрээний сунгалт — 60 хоногийн сануулга", "cron:daily", { days: 60 }, [{ kind: "create_task" }]],
      ["D-18", "Гэрээний сунгалт — 30 хоногийн сануулга", "cron:daily", { days: 30 }, [{ kind: "create_task" }, { kind: "notify", params: { event: "lease_renewal_due" } }]],
      ["D-19", "Гарах мэдэгдэлд бэлтгэлийн урсгал", "event:lease.notice", {}, [{ kind: "create_task" }]],
      ["D-20", "Засварын SLA хэтрэлтийн эскалаци", "cron:sla", { setting: "maintenance_sla" }, [{ kind: "notify", params: { event: "maintenance_sla" } }, { kind: "create_task" }]],
      ["D-21", "Сарын бүртгэл дутуугийн сануулга", "cron:daily", {}, [{ kind: "notify", params: { event: "monthly_record_due" } }]],
      ["D-22", "Өмчлөгчийн тайлангийн даалгавар", "cron:monthly", {}, [{ kind: "create_task" }]],
      ["D-23", "Барьцаа буцаалтын хяналтын даалгавар", "event:lease.terminated", {}, [{ kind: "create_task" }]],
      ["D-24", "Сунгалтын гинжин холболт", "event:lease.renewed", {}, [{ kind: "set_field" }]],
      ["D-25", "МУТСТ босго — автомат дохио + ажлын 5 өдрийн тоолуур", "event:payment.created", { setting: "aml_threshold_mnt", methods: ["cash", "foreign", "virtual"] }, [{ kind: "create_record", params: { entity: "aml_alerts" } }]],
      ["D-26", "Сэжигтэй гүйлгээний тайлангийн 24 цагийн эскалаци", "cron:sla", { hours: 24 }, [{ kind: "notify", params: { role: "aml_officer" } }]],
      ["D-27", "Оноо, ангиллын өдөр тутмын шинэчлэл", "cron:daily", {}, [{ kind: "set_field" }]],
      ["D-28", "Идэвхгүй харилцагчийн эргэн холбогдолт", "cron:daily", { setting: "recontact_frequency" }, [{ kind: "create_task" }]],
      ["D-29", "Эргэлтэд орсон сэжимийн дахин идэвхжүүлэлт", "cron:daily", { setting: "inactivity_thresholds" }, [{ kind: "create_task" }]],
      ["D-30", "Салбар зөрсөн бүртгэлд хамтран ажиллах даалгавар", "event:property.created", {}, [{ kind: "create_task" }]],
      // Долоо хоногийн мөчлөг (20261107002000-тэй ижил).
      ["D-31", "Долоо хоногийн төлөвлөгөөний картын сануулга", "cron:hourly", { setting: "weekly_cycle" }, [{ kind: "notify" }]],
      ["D-32", "Долоо хоногийн борлуулалтын хурлын сануулга", "cron:hourly", { setting: "weekly_cycle" }, [{ kind: "notify" }]],
      ["D-33", "Баасан гарагийн дүн шинжилгээний сануулга", "cron:hourly", { setting: "weekly_cycle" }, [{ kind: "notify" }]],
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
    // Хуучин seed-ийн байхгүй тохиргооны түлхүүрийг (recontact_days) засна.
    await q(
      `update crm_automation_rules
         set condition = jsonb_set(condition, '{setting}',
           to_jsonb(case code when 'D-28' then 'recontact_frequency' else 'inactivity_thresholds' end))
       where office_id = $1 and code in ('D-28', 'D-29') and condition ->> 'setting' = 'recontact_days'`,
      [officeId]
    );

    // ── Мэдэгдлийн матриц (AML үйл явдалд агент/харилцагчид мэдэгдэл ҮГҮЙ) ──
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
      ["complaint_created", "{sales_director,ops_qc}", "{app}", true, false],
      ["nps_answered", "{agent,marketing}", "{app}", false, false],
      ["deposit_return_due", "{property_manager,finance}", "{app}", false, false],
      ["aml_threshold_due", "{aml_officer,ceo}", "{app}", true, true],
      ["aml_str_due", "{aml_officer,ceo}", "{app}", true, true],
      // PRO-001 v2.1 (migration 20261107000300-тэй ижил)
      ["lead_retry_due", "{agent}", "{app}", true, false],
      ["lead_no_contact_48h", "{agent,team_lead}", "{app}", true, false],
      ["hot_lead_inactive", "{agent,team_lead,sales_director}", "{app}", true, false],
      ["lead_unprotected", "{agent,team_lead}", "{app}", false, false],
      ["showing_feedback_overdue", "{agent,team_lead}", "{app}", true, false],
      ["offer_followup_due", "{agent}", "{app}", false, false],
      ["offer_expiring", "{agent,team_lead}", "{app}", true, false],
      ["payment_verify_due", "{finance}", "{app}", false, false],
      ["lead_dispute_opened", "{agent,team_lead,sales_director,ops_qc}", "{app}", true, false],
      ["lead_dispute_decided", "{agent,team_lead}", "{app}", true, false],
      ["lead_claim_requested", "{team_lead,sales_director}", "{app}", false, false],
      ["export_requested", "{ops_qc,sales_director}", "{app}", true, false],
      ["weekly_plan_due", "{agent}", "{app}", true, false],
      ["weekly_plan_submitted", "{team_lead}", "{app}", false, false],
      ["weekly_plan_returned", "{agent}", "{app}", true, false],
      ["weekly_review_due", "{agent,team_lead}", "{app}", true, false],
      ["sales_meeting_reminder", "{agent,team_lead,sales_director}", "{app}", false, false],
      ["coaching_assigned", "{agent,team_lead}", "{app}", false, false],
      ["quality_audit_due", "{ops_qc}", "{app}", false, false],
      ["quality_fix_assigned", "{agent,team_lead}", "{app}", true, false],
    ];
    for (const [event, roles, channels, mandatory, exempt] of matrix) {
      await q(
        `insert into crm_notification_matrix (office_id, event_code, recipient_roles, channels, mandatory, quiet_hours_exempt)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (office_id, event_code) do nothing`,
        [officeId, event, roles, channels, mandatory, exempt]
      );
    }

    // ── Лавлахууд (PRO-001 v2.1; migration 20261107000300-тэй ижил) ──
    // [code, label, requiresNote?, isActive? (default true), tagGroup?]
    // Хуучин кодыг устгахгүй — идэвхгүй (FK-ээр холбогдсон мөрүүд хэвээр).
    const lookups = {
      lead_source: [
        ["digital", "Дижитал суваг"],
        ["referral", "Санал болголт (реферал)"],
        ["prospecting", "Идэвхтэй хайлт"],
        ["walk_in", "Оффисоор ирсэн"],
        ["open_house", "Нээлттэй үзлэг / арга хэмжээ"],
        ["listing_inquiry", "Листингийн лавлагаа"],
        ["personal_network", "Хувийн сүлжээ"],
        ["partner", "Олон улс / түнш"],
        ["property_management", "ҮХХ менежмент"],
        ["other", "Бусад", true],
        ["website", "Цахим хуудас", false, false],
        ["facebook", "Facebook", false, false],
        ["instagram", "Instagram", false, false],
        ["phone", "Утсаар", false, false],
      ],
      lost_reason: [
        ["price", "Үнэ"],
        ["location", "Байршил"],
        ["property_condition", "Үл хөдлөхийн нөхцөл байдал"],
        ["financing", "Санхүүжилт"],
        ["postponed", "Хугацаа"],
        ["competitor", "Өрсөлдөгч"],
        ["owner_decision", "Өмчлөгчийн шийдвэр"],
        ["no_contact", "Хариу өгөхгүй болсон"],
        ["service_issue", "Агент, үйлчилгээний асуудал"],
        ["needs_changed", "Шаардлага өөрчлөгдсөн"],
        ["other", "Бусад", true],
      ],
      objection: [
        ["price_high", "Үнэ"],
        ["location", "Байршил"],
        ["financing", "Санхүүжилт"],
        ["condition", "Нөхцөл байдал"],
        ["timing", "Хугацаа"],
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
        ["loc_yarmag", "Яармаг", false, true, "location"],
        ["loc_nisekh", "Нисэх", false, true, "location"],
        ["loc_khan_uul", "Хан-Уул", false, true, "location"],
        ["loc_bayanzurkh", "Баянзүрх", false, true, "location"],
        ["loc_center", "Төв", false, true, "location"],
        ["type_2room", "2 өрөө", false, true, "type"],
        ["type_3room", "3 өрөө", false, true, "type"],
        ["type_house", "Хашаа байшин", false, true, "type"],
        ["type_office", "Оффис", false, true, "type"],
        ["type_retail", "Худалдааны талбай", false, true, "type"],
        ["price_300_500", "300–500 сая", false, true, "price"],
        ["price_500_700", "500–700 сая", false, true, "price"],
        ["price_700_1000", "700 сая–1 тэрбум", false, true, "price"],
        ["price_1000_plus", "1 тэрбумаас дээш", false, true, "price"],
        ["goal_live", "Өөрөө амьдрах", false, true, "goal"],
        ["investor", "Хөрөнгө оруулалт", false, true, "goal"],
        ["goal_rental_income", "Түрээсийн орлого", false, true, "goal"],
        ["goal_business", "Бизнес", false, true, "goal"],
        ["fin_cash", "Бэлэн мөнгө", false, true, "financing"],
        ["fin_mortgage", "Ипотекийн зээл", false, true, "financing"],
        ["fin_corporate", "Байгууллага", false, true, "financing"],
        ["time_0_30", "0–30 хоног", false, true, "timeline"],
        ["time_1_3m", "1–3 сар", false, true, "timeline"],
        ["time_3_12m", "3–12 сар", false, true, "timeline"],
        ["intl", "Олон улс", false, true, "special"],
        ["special_project", "Төслийн борлуулалт", false, true, "special"],
        ["special_pm", "ҮХХ менежмент", false, true, "special"],
        ["special_high_value", "Өндөр үнийн дүнтэй", false, true, "special"],
        ["vip", "VIP", false, false],
        ["repeat", "Давтан үйлчлүүлэгч", false, false],
      ],
      goal: [
        ["live", "Өөрөө амьдрах"],
        ["invest", "Хөрөнгө оруулалт"],
        ["upgrade", "Орон сууцаа сайжруулах"],
        ["first_home", "Анхны орон сууц"],
        ["other", "Бусад", true],
        ["business", "Бизнесийн зориулалт", false, false],
      ],
      blocker: [
        ["none", "Саад байхгүй"],
        ["price", "Үнэ"],
        ["financing", "Санхүүжилт"],
        ["timing", "Хугацаа"],
        ["family", "Гэр бүл"],
        ["sale_first", "Эхлээд өөрийн хөрөнгөө худалдах"],
        ["other", "Бусад", true],
        ["loan", "Зээл хүлээгдэж буй", false, false],
        ["docs", "Бичиг баримт дутуу", false, false],
      ],
      decision_maker: [
        ["self", "Өөрөө"],
        ["spouse", "Гэр бүл хамт"],
        ["company", "Байгууллагын шийдвэр"],
        ["other", "Бусад", true],
      ],
      condition: [
        ["new_build", "Шинэ"],
        ["resale", "Хуучин"],
        ["furnished", "Тавилгатай"],
        ["parking", "Зогсоолтой"],
        ["pet_ok", "Амьтан зөвшөөрнө"],
        ["balcony", "Тагттай"],
      ],
      sales_obstacle: [
        ["price", "Үнэ"],
        ["owner", "Өмчлөгч"],
        ["financing", "Санхүүжилт"],
        ["documents", "Баримт бичиг"],
        ["marketing", "Маркетинг"],
        ["cross_branch", "Салбар хоорондын дэмжлэг"],
      ],
    };
    for (const [kind, values] of Object.entries(lookups)) {
      let activeIdx = 0;
      for (let i = 0; i < values.length; i++) {
        const [code, label, requiresNote, isActive, tagGroup] = values[i];
        const active = isActive !== false;
        // Идэвхтэйг эхэнд дараалуулна; идэвхгүй нь 20+-оос.
        const sort = active ? activeIdx++ : 20 + i;
        await q(
          `insert into crm_lookups (office_id, kind, code, label, requires_note, sort_order, is_active, tag_group)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (office_id, kind, code) do update set
             label = excluded.label, requires_note = excluded.requires_note, sort_order = excluded.sort_order,
             is_active = excluded.is_active, tag_group = excluded.tag_group`,
          [officeId, kind, code, label, requiresNote === true, sort, active, tagGroup ?? null]
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
      gate_requirements_waiting_checker: gatesInactive,
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
