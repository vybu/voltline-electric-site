import { useEffect, useMemo, useState } from "react";
import {
  availabilityTimeSlots,
  eventTimeSlots,
  bookings,
} from "@wix/bookings";
import {
  createCart,
  calculateCart,
} from "@wix/auto_sdk_ecom_cart-v-2";
import { redirects } from "@wix/redirects";
import { forms } from "@wix/forms";

const BOOKING_APP_ID = "13d21c63-b5ec-5912-8397-c3a5ddb27a97";
const STAFF_MEMBER_RESOURCE_TYPE_ID =
  "1cd44cf8-756f-41c3-bd90-3e2ffcaf1155";

type Props = {
  serviceId: string;
  serviceName: string;
  serviceType: string; // APPOINTMENT | CLASS
  priceLabel: string;
  isFree: boolean;
  paymentOnline: boolean;
  paymentInPerson: boolean;
  formId: string | null;
};

type Slot = {
  localStartDate: string;
  localEndDate: string;
  scheduleId?: string | null;
  eventInfo?: { eventId?: string };
};

type FormField = { target: string; label: string; type: string; options?: any[] };

// Local "YYYY-MM-DDThh:mm:ss" (no Z) — the availability API wants local strings.
function localStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours(),
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function dayKey(s: string) {
  return s.slice(0, 10);
}

const CONTACT_FALLBACK: FormField[] = [
  { target: "first_name", label: "First name", type: "STRING" },
  { target: "last_name", label: "Last name", type: "STRING" },
  { target: "email", label: "Email", type: "EMAIL" },
];

export default function BookingWidget(props: Props) {
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [fields, setFields] = useState<FormField[]>(CONTACT_FALLBACK);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [picked, setPicked] = useState<Slot | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"pick" | "details" | "submitting">("pick");
  const [error, setError] = useState<string | null>(null);

  // Load availability + booking form on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const from = new Date();
        const to = new Date();
        to.setDate(to.getDate() + 28);
        const fromLocalDate = localStr(from);
        const toLocalDate = localStr(to);

        let result: Slot[] = [];
        if (props.serviceType === "CLASS") {
          const r = await eventTimeSlots.listEventTimeSlots({
            serviceIds: [props.serviceId],
            fromLocalDate,
            toLocalDate,
            timeZone,
            includeNonBookable: false,
          } as any);
          result = (r.timeSlots ?? []) as Slot[];
        } else {
          const r = await availabilityTimeSlots.listAvailabilityTimeSlots({
            serviceId: props.serviceId,
            fromLocalDate,
            toLocalDate,
            timeZone,
            bookable: true,
            cursorPaging: { limit: 100 },
          } as any);
          result = (r.timeSlots ?? []) as Slot[];
        }

        // Booking form (schema-driven) — fall back to contact basics on any gap.
        let parsed: FormField[] = CONTACT_FALLBACK;
        if (props.formId) {
          try {
            const { formSummary } = await forms.getFormSummary(props.formId);
            const usable = (formSummary?.fields ?? [])
              .filter((f: any) => !f.deleted)
              .filter(
                (f: any) =>
                  f.type &&
                  ["STRING", "EMAIL", "PHONE", "NUMBER", "URL"].includes(f.type),
              )
              .map((f: any) => ({
                target: f.target,
                label: f.label ?? f.target,
                type: f.type,
                options: f.options,
              }));
            if (usable.length) parsed = usable;
          } catch {
            /* keep fallback */
          }
        }

        if (!alive) return;
        setSlots(result);
        setFields(parsed);
        const firstDay = result.length ? dayKey(result[0].localStartDate) : null;
        setActiveDay(firstDay);
      } catch (e) {
        console.error(e);
        if (alive) setError("Couldn't load availability. Please call us to book.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [props.serviceId, props.serviceType, props.formId, timeZone]);

  const days = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = dayKey(s.localStartDate);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [slots]);

  const daySlots = useMemo(
    () => (activeDay ? slots.filter((s) => dayKey(s.localStartDate) === activeDay) : []),
    [slots, activeDay],
  );

  function timeOf(s: string) {
    const d = new Date(s);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function dowOf(k: string) {
    return new Date(k + "T00:00:00").toLocaleDateString([], { weekday: "short" });
  }
  function dnumOf(k: string) {
    return new Date(k + "T00:00:00").getDate();
  }
  function monOf(k: string) {
    return new Date(k + "T00:00:00").toLocaleDateString([], { month: "short" });
  }

  function paymentOption(): "ONLINE" | "OFFLINE" {
    if (props.paymentOnline && !props.paymentInPerson) return "ONLINE";
    if (!props.paymentOnline && props.paymentInPerson) return "OFFLINE";
    return "ONLINE";
  }

  async function submit() {
    if (!picked) return;
    setError(null);
    setPhase("submitting");
    try {
      const selectedPaymentOption = paymentOption();
      const slot = picked;

      const created = await bookings.createBooking(
        {
          selectedPaymentOption,
          totalParticipants: 1,
          bookedEntity: {
            slot: {
              serviceId: props.serviceId,
              scheduleId: slot.scheduleId ?? undefined,
              eventId: slot.eventInfo?.eventId,
              startDate: slot.localStartDate,
              endDate: slot.localEndDate,
              timezone: timeZone,
              // No specific staff chosen → let Wix auto-assign a bookable resource.
              resourceSelections: [
                {
                  resourceTypeId: STAFF_MEMBER_RESOURCE_TYPE_ID,
                  selectionMethod: "ANY_RESOURCE",
                },
              ],
              location: { locationType: "OWNER_BUSINESS" },
            },
          },
        } as any,
        { formSubmission: values } as any,
      );

      const bookingId = (created as any).booking._id;

      // One-shot anonymous read token, so the confirmation page can read it back.
      let token = "";
      try {
        const t = await bookings.getAnonymousActionToken(bookingId);
        token = (t as any).token ?? "";
      } catch {
        /* non-fatal */
      }

      const q = new URLSearchParams({
        bookingId,
        token,
        svc: props.serviceName,
        when: slot.localStartDate,
      });
      const confirmUrl = `/booking-confirmation?${q.toString()}`;

      // The booking now exists at status CREATED (a hold). It must reach
      // CONFIRMED to show on the owner's Booking Calendar.
      //
      // Paid-online services drive that through Wix hosted checkout (which also
      // collects payment). This needs a payment method enabled in the dashboard.
      if (selectedPaymentOption === "ONLINE" && !props.isFree) {
        try {
          const cart = await createCart({
            catalogItems: [
              {
                quantity: 1,
                catalogReference: {
                  catalogItemId: bookingId,
                  appId: BOOKING_APP_ID,
                },
              },
            ],
            cart: { source: { channelType: "WEB" } },
          } as any);
          const cartId = (cart as any)._id;
          if (cartId) {
            const { summary } = await calculateCart(cartId);
            const total = Number(
              (summary as any)?.priceSummary?.total?.amount ?? 0,
            );
            if (total > 0) {
              const origin = window.location.origin;
              const { redirectSession } = await redirects.createRedirectSession({
                ecomCheckout: { checkoutId: cartId },
                callbacks: { postFlowUrl: `${origin}${confirmUrl}` },
              } as any);
              window.location.href = (redirectSession as any).fullUrl;
              return;
            }
          }
        } catch (orderErr) {
          console.warn("eCom checkout step skipped", orderErr);
        }
      }

      // Free / pay-in-person (the whole trade-job model here): confirm the
      // booking server-side so it lands on the Booking Calendar as a real
      // appointment — no online payment, no payment method setup required.
      try {
        const r = await fetch("/api/confirm-booking", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bookingId }),
        });
        if (r.ok) {
          window.location.href = `${confirmUrl}&confirmed=1`;
          return;
        }
        console.warn("confirm-booking returned", r.status);
      } catch (confirmErr) {
        console.warn("confirm-booking step failed", confirmErr);
      }

      // Fallback: the seat is still held (CREATED) even if confirm didn't land.
      window.location.href = `${confirmUrl}&reserved=1`;
    } catch (e: any) {
      console.error(e);
      setError(
        e?.message?.includes("INSUFFICIENT")
          ? "That slot was just taken. Please pick another time."
          : "Something went wrong completing your booking. Please try again or call us.",
      );
      setPhase("details");
    }
  }

  if (loading) {
    return (
      <div className="bw">
        <div className="bw__loading"><span className="spinner"></span>Loading availability…</div>
      </div>
    );
  }

  return (
    <div className="bw">
      {error && <div className="bw__msg bw__msg--err">{error}</div>}

      {phase === "pick" && (
        <>
          <div className="bw__step-label">Step 1 · Pick a time</div>
          {days.length === 0 ? (
            <div className="bw__empty">
              No open slots in the next 4 weeks. Call{" "}
              <a href="tel:+17712246700" style={{color:"var(--volt)"}}>+1 771 224 6700</a> and we'll fit you in.
            </div>
          ) : (
            <>
              <div className="bw__days">
                {days.map(([k]) => (
                  <button
                    key={k}
                    className="bw__day"
                    aria-selected={activeDay === k}
                    onClick={() => setActiveDay(k)}
                  >
                    <div className="dow">{dowOf(k)}</div>
                    <div className="dnum">{dnumOf(k)}</div>
                    <div className="mon">{monOf(k)}</div>
                  </button>
                ))}
              </div>
              <div className="bw__slots">
                {daySlots.map((s, i) => (
                  <button
                    key={i}
                    className="bw__slot"
                    aria-selected={picked === s}
                    onClick={() => {
                      setPicked(s);
                      setPhase("details");
                    }}
                  >
                    {timeOf(s.localStartDate)}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {(phase === "details" || phase === "submitting") && picked && (
        <>
          <button className="bw__back" onClick={() => setPhase("pick")} disabled={phase === "submitting"}>
            ← Change time
          </button>
          <div className="bw__step-label">Step 2 · Your details</div>
          <p className="bw__h">
            {new Date(picked.localStartDate).toLocaleDateString([], {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}{" "}
            · {timeOf(picked.localStartDate)}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {fields.map((f) => (
              <div className="bw__field" key={f.target}>
                <label htmlFor={`f-${f.target}`}>{f.label}</label>
                {f.options && f.options.length ? (
                  <select
                    id={`f-${f.target}`}
                    required={["first_name", "last_name", "email"].includes(f.target)}
                    value={values[f.target] ?? ""}
                    onChange={(e) => {
                      const val = e.currentTarget.value;
                      setValues((v) => ({ ...v, [f.target]: val }));
                    }}
                  >
                    <option value="">Select…</option>
                    {f.options.map((o: any, i: number) => (
                      <option key={i} value={typeof o === "string" ? o : o.value ?? o.label}>
                        {typeof o === "string" ? o : o.label ?? o.value}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`f-${f.target}`}
                    type={
                      f.type === "EMAIL"
                        ? "email"
                        : f.type === "PHONE"
                          ? "tel"
                          : f.type === "NUMBER"
                            ? "number"
                            : "text"
                    }
                    required={["first_name", "last_name", "email"].includes(f.target)}
                    value={values[f.target] ?? ""}
                    onChange={(e) => {
                      const val = e.currentTarget.value;
                      setValues((v) => ({ ...v, [f.target]: val }));
                    }}
                  />
                )}
              </div>
            ))}

            <div className="bw__summary">
              <span className="lab">{props.isFree ? "Free consultation" : "Pay the electrician on the day"}</span>
              <span className="val">{props.priceLabel}</span>
            </div>

            <button className="btn bw__full" type="submit" disabled={phase === "submitting"}>
              {phase === "submitting" ? (
                <><span className="spinner"></span>Booking…</>
              ) : (
                <>Confirm booking <span className="arrow">→</span></>
              )}
            </button>
            <p className="bw__note">
              No payment taken online. We'll confirm by phone and settle on completion.
            </p>
          </form>
        </>
      )}
    </div>
  );
}
