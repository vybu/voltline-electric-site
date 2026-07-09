# Voltline Electric

A booking website for an electrical-services company, built on **Wix Headless**
(Astro + Wix SDK, hosted on Wix). Visitors browse services and book a home visit
online; bookings are powered by **Wix Bookings** (Services V2).

Live: https://voltline-e-e156a851-vytenisb.wix-site-host.com

## Stack

- **Astro 5** (SSR, `output: "server"`) with `@wix/astro` + `@wix/astro-pages` — auth is ambient (no client / OAuthStrategy in app code).
- **React island** for the interactive booking widget (`client:only="react"`).
- **Wix Bookings** for services + availability + booking, **Wix eCom Cart V2** to place the order, **@wix/seo** for item-page SEO.
- Hosted + published on Wix (`wix release`).

## Structure

```
src/
  layouts/Layout.astro          shared shell; exposes the `seo-tags` slot
  components/
    SiteHeader.astro            4-zone editorial nav
    SiteFooter.astro            contact + big "Book a job" CTA
    ServiceIcon.astro           per-service line icons
    BookingWidget.tsx           pick slot -> contact form -> createBooking -> cart -> confirm
    RicosContent.tsx            client-only Ricos viewer for blog post bodies
  lib/wix.ts                    Services V2 query helpers (listServices / getServiceBySlug)
  lib/blog.ts                   Wix Blog V3 read helpers (listPosts / getPostBySlug)
  pages/
    index.astro                 home: hero, live services grid, statement, live journal
    services/[slug].astro        service detail + booking widget + item-page SEO
    journal/index.astro          journal listing (all live blog posts)
    journal/[...slug].astro      blog post detail + Ricos body + item-page SEO
    api/confirm-booking.ts       elevated route: CREATED -> CONFIRMED (no payment needed)
    booking-confirmation.astro   post-booking confirmation (reads booking anonymously)
  styles/global.css             design system (near-black + live-wire amber)
```

## Services (seeded in the Bookings backend)

All are home-visit appointments, paid in person (the free consultation aside):

| Service | Duration | Price |
|---|---|---|
| Emergency Callout | 1 hr | €150 |
| Consumer Unit Upgrade | 2 hrs | €450 |
| EV Charger Installation | 3 hrs | €600 |
| Rewire Consultation | 45 min | Free |
| Lighting Design & Fit | 1h 30m | €220 |
| EICR Safety Inspection | 1h 30m | €180 |

Add / edit / reprice services in the Wix dashboard — the frontend queries them
live, so changes appear with no code change or redeploy.

## Journal (Wix Blog)

The "Field Notes" section is powered by **Wix Blog (V3)**. `src/lib/blog.ts`
queries published posts live via `@wix/blog` (ambient auth, same pattern as
`lib/wix.ts`); the home page shows the latest four, `/journal` lists them all,
and `/journal/[...slug]` renders the full post — body via `@wix/ricos`
(`client:only`), per-post SEO via `@wix/seo`. Posts are grouped into four
categories (Safety, EV, Lighting, Landlords) that drive the card kicker + cover
art. Write / edit / publish posts in the dashboard (`Blog → Posts`); the site
picks them up live. Set a cover image on a post and it overrides the curated
category art in `/public/notes`.

## Booking flow

`BookingWidget.tsx` implements the Services V2 contract:
`listAvailabilityTimeSlots` -> schema-driven contact form (`getFormSummary`, with a
first/last/email fallback) -> `createBooking`.

`createBooking` lands a booking at status **`CREATED`** — a temporary hold that
does **not** appear on the owner's Booking Calendar (only `CONFIRMED`
appointments do). Because these are pay-on-completion trade jobs (no online
payment to drive an eCom order, which is what would otherwise confirm the seat),
the widget then calls **`POST /api/confirm-booking`** — a backend route
(`src/pages/api/confirm-booking.ts`) that reads the booking's current revision
and calls `bookings.confirmBooking` with **elevated (app) permissions**
(`auth.elevate`, the documented Astro pattern). The booking flips to `CONFIRMED`
and shows on the calendar immediately — **no payment method or dashboard setup
required**.

Paid-online services (none exist today) still route through Wix hosted checkout,
which collects payment and confirms the seat. If confirmation ever fails, the
booking is still held (`CREATED`) and the visitor lands on the confirmation with
a "reserved — we'll call to confirm" status rather than an error.

## Develop

```bash
npm install --ignore-scripts   # sharp is optional/dev-only here; skip its native build
npm run dev                    # local dev server (wix dev)
npm run build                  # wix build
npm run release                # publish to Wix hosting
```
