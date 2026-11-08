import { z } from "zod";

import { PL_CODES } from "@/lib/constants-crm";

/**
 * Боломж, үзлэг, үнийн санал, хэлцлийн оролтын баталгаажуулалт (U3 —
 * §6.13–§6.17). Zod v4 .strict(), монгол мессеж; wrapper { data } | { error }.
 */

function firstError(error: z.ZodError): string {
  const issue = error.issues[0];
  const msg = issue?.message;
  return msg && !msg.startsWith("Invalid") && !msg.startsWith("Expected") ? msg : "Оролт буруу байна.";
}

function wrap<T>(schema: z.ZodType<T>, input: unknown): { data: T } | { error: string } {
  const r = schema.safeParse(input);
  return r.success ? { data: r.data } : { error: firstError(r.error) };
}

const isoDate = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);
const optText = (max: number) => z.string().trim().max(max, "Текст хэт урт байна").optional().nullable();

// ── Боломж ────────────────────────────────────────────────

const createOppSchema = z
  .object({
    pipelineCode: z.enum(PL_CODES, "Урсгал сонгоно уу"),
    contactId: z.uuid("Харилцагч сонгоно уу").optional().nullable(),
    leadId: z.uuid().optional().nullable(),
    propertyId: z.uuid().optional().nullable(),
    needProfileId: z.uuid().optional().nullable(),
    ownerId: z.uuid().optional().nullable(),
    amount: z.number("Дүн буруу байна").nonnegative("Дүн сөрөг байж болохгүй").optional().nullable(),
    expectedFeeMnt: z.number("Хөлс буруу байна").nonnegative("Хөлс сөрөг байж болохгүй").optional().nullable(),
    currency: z.string().trim().max(8).optional(),
    expectedCloseOn: isoDate("Хаагдах төлөв огноо буруу байна").optional().nullable(),
    nextStep: z.string().trim().min(2, "Дараагийн үйлдлийг бичнэ үү").max(500, "Дараагийн үйлдэл хэт урт байна"),
    nextStepDate: isoDate("Дараагийн үйлдлийн огноог сонгоно уу"),
  })
  .strict()
  .refine((v) => Boolean(v.contactId || v.leadId), { message: "Сэжим эсвэл харилцагч сонгоно уу" });

export type CreateOpportunityInput = z.infer<typeof createOppSchema>;
export function validateCreateOpportunity(input: unknown) {
  return wrap(createOppSchema, input);
}

const updateOppSchema = z
  .object({
    id: z.uuid(),
    amount: z.number().nonnegative("Дүн сөрөг байж болохгүй").optional().nullable(),
    expectedFeeMnt: z.number().nonnegative("Хөлс сөрөг байж болохгүй").optional().nullable(),
    currency: z.string().trim().max(8).optional(),
    expectedCloseOn: isoDate("Хаагдах төлөв огноо буруу байна").optional().nullable(),
    propertyId: z.uuid().optional().nullable(),
    needProfileId: z.uuid().optional().nullable(),
  })
  .strict();

export type UpdateOpportunityInput = z.infer<typeof updateOppSchema>;
export function validateUpdateOpportunity(input: unknown) {
  return wrap(updateOppSchema, input);
}

const nextStepSchema = z
  .object({
    id: z.uuid(),
    nextStep: z.string().trim().min(2, "Дараагийн үйлдлийг бичнэ үү").max(500),
    nextStepDate: isoDate("Огноо сонгоно уу"),
  })
  .strict();
export type OppNextStepInput = z.infer<typeof nextStepSchema>;
export function validateOppNextStep(input: unknown) {
  return wrap(nextStepSchema, input);
}

const meetingSchema = z
  .object({
    id: z.uuid(),
    meetingAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Уулзалтын огноо, цаг буруу байна"),
    place: z.string().trim().min(2, "Уулзах газрыг бичнэ үү").max(300),
  })
  .strict();
export type OppMeetingInput = z.infer<typeof meetingSchema>;
export function validateOppMeeting(input: unknown) {
  return wrap(meetingSchema, input);
}

// ── Үнийн санал ───────────────────────────────────────────

const offerSchema = z
  .object({
    opportunityId: z.uuid(),
    direction: z.enum(["offer", "counter"], "Саналын төрөл буруу байна"),
    side: z.enum(["buyer", "seller"], "Санал гаргасан талыг сонгоно уу"),
    parentOfferId: z.uuid().optional().nullable(),
    amount: z.number("Дүн оруулна уу").positive("Дүн 0-ээс их байна"),
    receivedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Хүлээн авсан огноо буруу байна"),
    paymentTerms: z.string().trim().min(1, "Төлбөрийн нөхцөлийг бичнэ үү").max(1000),
    financing: z.string().trim().min(1, "Санхүүжилтийг бичнэ үү").max(500),
    handoverOn: isoDate("Хүлээлцэх огноо буруу байна").optional().nullable(),
    inclusions: optText(1000),
    exclusions: optText(1000),
    validUntil: isoDate("Хүчинтэй хугацааг сонгоно уу"),
    position: z.string().trim().min(1, "Сүүлийн байр суурийг бичнэ үү").max(1000),
    obstacle: optText(1000),
    nextStep: z.string().trim().min(2, "Дараагийн алхмыг бичнэ үү").max(500),
    nextStepDate: isoDate("Дараагийн алхмын огноог сонгоно уу"),
    docId: z.uuid().optional().nullable(),
  })
  .strict();

export type RecordOfferInput = z.infer<typeof offerSchema>;
export function validateOffer(input: unknown) {
  return wrap(offerSchema, input);
}

const offerDecisionSchema = z
  .object({
    offerId: z.uuid(),
    action: z.enum(["accept", "reject", "withdraw"], "Шийдвэр буруу байна"),
    channel: z.enum(["in_person", "email", "message", "phone", "other"]).optional().nullable(),
    note: optText(2000),
    docId: z.uuid().optional().nullable(),
  })
  .strict()
  .refine((v) => v.action !== "accept" || Boolean(v.channel), {
    message: "Харилцагч ямар хэлбэрээр зөвшөөрснийг сонгоно уу",
  })
  .refine((v) => v.action === "accept" || Boolean(v.note?.trim()), { message: "Шийдвэрийн тайлбарыг бичнэ үү" });

export type OfferDecisionInput = z.infer<typeof offerDecisionSchema>;
export function validateOfferDecision(input: unknown) {
  return wrap(offerDecisionSchema, input);
}

// ── Үзлэг ─────────────────────────────────────────────────

const showingScheduleSchema = z
  .object({
    opportunityId: z.uuid().optional().nullable(),
    contactId: z.uuid("Харилцагч сонгоно уу"),
    propertyId: z.uuid("Үл хөдлөх сонгоно уу"),
    scheduledAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Үзлэгийн огноо, цагийг сонгоно уу"),
    durationMin: z.number().int().positive().max(600).optional().nullable(),
    meetingPoint: optText(300),
    participants: z.string().trim().min(2, "Оролцогчдыг бичнэ үү").max(500),
    weakMatchReason: optText(1000),
  })
  .strict();
export type ShowingScheduleInput = z.infer<typeof showingScheduleSchema>;
export function validateShowingSchedule(input: unknown) {
  return wrap(showingScheduleSchema, input);
}

const showingFeedbackSchema = z
  .object({
    showingId: z.uuid(),
    feedbackCategory: z.enum(["price", "location", "layout", "condition", "financing", "other"], "Ангиллыг сонгоно уу"),
    feedbackNote: z.string().trim().min(2, "Харилцагчийн санал, сэтгэгдлийг бичнэ үү").max(2000),
    interest: z.enum(["interested", "maybe", "not_interested"], "Сонирхлыг сонгоно уу"),
    nextAction: z.enum(["repeat_showing", "offer", "documents"]).optional().nullable(),
    nextStepDate: isoDate("Огноо буруу байна").optional().nullable(),
  })
  .strict();
export type ShowingFeedbackInput = z.infer<typeof showingFeedbackSchema>;
export function validateShowingFeedback(input: unknown) {
  return wrap(showingFeedbackSchema, input);
}

// ── Үнийн дүн шинжилгээ ───────────────────────────────────

const comparableSchema = z
  .object({
    address: z.string().trim().min(1, "Жишиг объектын хаягийг бичнэ үү").max(300),
    price: z.number("Жишиг үнэ буруу").positive("Жишиг үнэ 0-ээс их байна"),
    area_m2: z.number().positive().optional().nullable(),
    note: optText(300),
  })
  .strict();

const priceAnalysisSchema = z
  .object({
    opportunityId: z.uuid(),
    comparables: z.array(comparableSchema).max(20, "Жишиг хэт олон байна"),
    priceMin: z.number().positive().optional().nullable(),
    priceMax: z.number().positive().optional().nullable(),
    recommendedPrice: z.number("Санал болгох үнийг оруулна уу").positive("Санал болгох үнэ 0-ээс их байна"),
    note: optText(2000),
  })
  .strict();
export type PriceAnalysisInput = z.infer<typeof priceAnalysisSchema>;
export function validatePriceAnalysis(input: unknown) {
  return wrap(priceAnalysisSchema, input);
}

// ── Хэлцэл ────────────────────────────────────────────────

const dealPaymentSchema = z
  .object({
    transactionId: z.uuid(),
    scheduleLineId: z.uuid("Хуваарийн мөрийг сонгоно уу"),
    paidOn: isoDate("Төлсөн огноо буруу байна"),
    amount: z.number("Дүн оруулна уу").positive("Дүн 0-ээс их байна"),
    method: z.enum(["bank", "cash", "foreign", "virtual", "other"], "Төлбөрийн хэлбэрийг сонгоно уу"),
    docId: z.uuid("Төлбөрийн баримтыг хавсаргана уу"),
  })
  .strict();
export type DealPaymentInput = z.infer<typeof dealPaymentSchema>;
export function validateDealPayment(input: unknown) {
  return wrap(dealPaymentSchema, input);
}

const contractSchema = z
  .object({
    transactionId: z.uuid(),
    templateCode: z.string().trim().min(1, "Гэрээний загварыг сонгоно уу").max(60),
    contractType: z.string().trim().min(1, "Гэрээний төрлийг бичнэ үү").max(120),
    number: z.string().trim().min(1, "Гэрээний дугаарыг бичнэ үү").max(60),
    signedOn: isoDate("Гарын үсэг зурсан огноо буруу").optional().nullable(),
    validFrom: isoDate("Огноо буруу").optional().nullable(),
    validTo: isoDate("Огноо буруу").optional().nullable(),
    docId: z.uuid().optional().nullable(),
  })
  .strict();
export type DealContractInput = z.infer<typeof contractSchema>;
export function validateDealContract(input: unknown) {
  return wrap(contractSchema, input);
}

const feeInvoiceSchema = z
  .object({
    transactionId: z.uuid(),
    amount: z.number("Дүн оруулна уу").positive("Дүн 0-ээс их байна"),
    dueOn: isoDate("Төлөх огноо буруу"),
    recipientContactId: z.uuid("Нэхэмжлэх хүлээн авагчийг сонгоно уу"),
  })
  .strict();
export type DealFeeInvoiceInput = z.infer<typeof feeInvoiceSchema>;
export function validateDealFeeInvoice(input: unknown) {
  return wrap(feeInvoiceSchema, input);
}
