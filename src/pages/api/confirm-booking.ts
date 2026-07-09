import type { APIRoute } from "astro";
import { auth, httpClient } from "@wix/essentials";
import { bookings } from "@wix/bookings";

// createBooking leaves a booking at status CREATED (a temporary hold). The Wix
// Booking Calendar only surfaces CONFIRMED appointments, and confirming is an
// admin-scope action the anonymous visitor can't call. For pay-on-completion
// trade jobs there's no online payment to drive the eCom order (which would
// otherwise confirm the seat), so we confirm the booking here with elevated
// (app) permissions. This is the documented Astro shape: privileged calls
// wrapped in auth.elevate() inside a backend endpoint, invoked from the widget
// via fetch.
//
// We read the booking's CURRENT revision server-side rather than trust one from
// the client: createBooking stamps the form submission in a second step, so the
// revision the browser saw at create time is already stale by confirm time.
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

async function readBooking(
  bookingId: string,
): Promise<{ revision?: string; status?: string } | null> {
  const authedFetch = auth.elevate(httpClient.fetchWithAuth);
  const res = await authedFetch(
    "https://www.wixapis.com/bookings/v2/bookings/query",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: { filter: { id: bookingId } } }),
    },
  );
  if (!res.ok) return null;
  const data: any = await res.json();
  const b = data?.bookings?.[0];
  return b ? { revision: b.revision, status: b.status } : null;
}

export const POST: APIRoute = async ({ request }) => {
  let bookingId: string | undefined;
  try {
    const body = await request.json();
    bookingId = body?.bookingId;
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (!bookingId) return json({ error: "missing bookingId" }, 400);

  try {
    const booking = await readBooking(bookingId);
    if (!booking?.revision) return json({ error: "booking_not_found" }, 404);
    // Already confirmed (e.g. a double submit) — treat as success.
    if (booking.status === "CONFIRMED") return json({ status: "CONFIRMED" });

    const confirm = auth.elevate(bookings.confirmBooking);
    const res = await confirm(bookingId, String(booking.revision));
    return json({ status: (res as any)?.booking?.status ?? "CONFIRMED" });
  } catch (e) {
    console.error("confirm-booking failed", e);
    return json({ error: "confirm_failed" }, 502);
  }
};
