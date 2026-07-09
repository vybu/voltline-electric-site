// Shared Wix Bookings helpers (Services V2).
// On Wix-managed Astro authentication is ambient — we import the modules and
// call them directly; there is no client / OAuthStrategy / clientId here.
import { services } from "@wix/bookings";
import { media } from "@wix/sdk";

// Platform constants (see how-to-code-bookings recipe).
export const BOOKING_APP_ID = "13d21c63-b5ec-5912-8397-c3a5ddb27a97";
export const STAFF_MEMBER_RESOURCE_TYPE_ID =
  "1cd44cf8-756f-41c3-bd90-3e2ffcaf1155";

export type StaffMember = { staffMemberId: string; name: string };

export type ServiceView = {
  id: string;
  slug: string;
  name: string;
  description: string;
  tagLine: string;
  type: string; // "APPOINTMENT" | "CLASS"
  durationMinutes: number | null;
  isFree: boolean;
  priceValue: string | null;
  currency: string;
  formId: string | null;
  staffMembers: StaffMember[];
  paymentOnline: boolean;
  paymentInPerson: boolean;
  imageUrl: string | null;
};

function resolveImage(image: unknown): string | null {
  if (typeof image !== "string" || !image) return null;
  if (image.startsWith("https://")) return image;
  try {
    return media.getImageUrl(image).url;
  } catch {
    return null;
  }
}

function toView(s: any): ServiceView {
  const price = s?.payment?.fixed?.price;
  const rateType = s?.payment?.rateType;
  return {
    id: s?._id ?? s?.id,
    slug: s?.mainSlug?.name ?? s?.supportedSlugs?.[0]?.name ?? "",
    name: s?.name ?? "Service",
    description: s?.description ?? "",
    tagLine: s?.tagLine ?? "",
    type: s?.type ?? "APPOINTMENT",
    durationMinutes:
      s?.schedule?.availabilityConstraints?.sessionDurations?.[0] ?? null,
    isFree: rateType === "NO_FEE" || !price,
    priceValue: price?.value ?? null,
    currency: price?.currency ?? "USD",
    formId:
      s?.form?._id && s.form._id !== "00000000-0000-0000-0000-000000000000"
        ? s.form._id
        : s?.form?.id && s.form.id !== "00000000-0000-0000-0000-000000000000"
          ? s.form.id
          : null,
    staffMembers: (s?.staffMemberDetails?.staffMembers ?? [])
      .filter((m: any) => m?.staffMemberId)
      .map((m: any) => ({ staffMemberId: m.staffMemberId, name: m.name })),
    paymentOnline: !!s?.payment?.options?.online,
    paymentInPerson: !!s?.payment?.options?.inPerson,
    imageUrl: resolveImage(s?.media?.mainMedia?.image),
  };
}

/** All bookable services for this app, in seed order. */
export async function listServices(): Promise<ServiceView[]> {
  const { items } = await services
    .queryServices({ conditionalFields: ["STAFF_MEMBER_DETAILS"] })
    .eq("appId", BOOKING_APP_ID)
    .limit(100)
    .find();
  return (items ?? [])
    .filter((s: any) => !s?.hidden)
    .map(toView)
    .filter((s) => s.slug);
}

/** A single service by its URL slug (or null). */
export async function getServiceBySlug(
  slug: string,
): Promise<ServiceView | null> {
  const {
    items: [service],
  } = await services
    .queryServices({ conditionalFields: ["STAFF_MEMBER_DETAILS"] })
    .eq("mainSlug.name", slug)
    .eq("appId", BOOKING_APP_ID)
    .limit(1)
    .find();
  return service ? toView(service) : null;
}

/** Format a price for display from the service's own currency. */
export function formatPrice(view: ServiceView): string {
  if (view.isFree || !view.priceValue) return "Free visit";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: view.currency,
      maximumFractionDigits: 0,
    }).format(Number(view.priceValue));
  } catch {
    return `${view.priceValue} ${view.currency}`;
  }
}

export function formatDuration(mins: number | null): string {
  if (!mins) return "By quote";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h} hr${h > 1 ? "s" : ""}`;
}
