"use server";
import { revalidatePath } from "next/cache";
import { account } from "@/lib/auth";
import { projectSchema, detailsSchema, uuid } from "@/lib/validation";
import { parseISTInput } from "@/lib/ist-datetime";
import type { Result } from "@/components/action-form";
export async function mutate(
  op: string,
  _: Result,
  form: FormData,
): Promise<Result> {
  const { client } = await account(
    [
      "project",
      "decision",
      "review",
      "payment",
      "dispatch",
      "creator_status",
      "extend_deadline",
    ].includes(op),
  );
  const raw = String(form.get("target") || "");
  if (raw && !uuid.safeParse(raw).success) return { error: "Invalid record." };
  let payload: Record<string, unknown> = Object.fromEntries(form.entries());
  delete payload.target;
  if (op === "project") {
    const date = parseISTInput(String(payload.deadline || ""));
    if (!date)
      return { error: "Select a valid deadline." };
    payload.deadline = date;
    payload.payment_paise = Math.round(Number(payload.payment_rupees) * 100);
    const parsed = projectSchema.safeParse(payload);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const delivery = parseISTInput(String(payload.delivery_deadline || ""));
    if (!delivery)
      return { error: "Select a valid delivery deadline." };
    const details = detailsSchema.safeParse({
      ...payload,
      delivery_deadline: delivery,
      shipping_required: payload.shipping_required === "on",
    });
    if (!details.success) return { error: details.error.issues[0].message };
    if (Date.parse(delivery) <= Date.parse(date))
      return {
        error: "Delivery deadline must be after the application deadline.",
      };
    payload = { ...parsed.data, details: details.data };
  }
  if (op === "extend_deadline") {
    const deadline = parseISTInput(String(payload.deadline || ""));
    if (!deadline)
      return { error: "Select a valid delivery deadline." };
    payload = { deadline };
  }
  const { error } = await client.rpc("workflow", {
    op,
    target: raw || null,
    payload,
  });
  if (error) {
    const known = [
      "Application is not pending",
      "Applications are closed",
      "Project is closed or full",
      "Rejection reason required",
      "Revision instructions required",
      "Payment already paid or unavailable",
      "Courier and tracking required",
      "Delivery address required before dispatch",
      "Address cannot be changed after dispatch",
      "Complete delivery address required",
      "Product has not been dispatched",
      "Accepted brief terms are locked",
      "Revision limit reached",
      "Delivery deadline passed",
      "Confirm product delivery before submitting",
      "Extension must be a later future deadline within one year",
      "Assignment unavailable for extension",
    ];
    return {
      error:
        error.code === "23505"
          ? "This record already exists. You may have already completed this action."
          : known.find((x) => error.message.includes(x)) ||
            "Unable to save. Check the fields and current workflow status.",
    };
  }
  revalidatePath("/workspace", "layout");
  return { success: "Saved successfully." };
}
