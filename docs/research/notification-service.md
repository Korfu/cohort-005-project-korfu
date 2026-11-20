# Free-tier notification service for Cadence (in-app + email)

Research for issue #4, part of the map in issue #3 (Notifications in Cadence).
Pricing and docs were checked on **2026-11-20**. Vendors change free tiers often, so check the pricing pages again before signing up.

Constraints from the map: hosted only, free tier only, preferably one service for in-app and email. Recipients can be any Student, Instructor, Platform Admin or Team Admin. Cadence already sends refund emails through Postmark (`app/lib/mailer.server.ts`). That file is on the local `prune` branch, not on `main`.

## Recommendation

**Use Knock (Developer plan), with Resend's free plan as the email provider.**

- Knock's free plan has the fewest limits that would hit a first catalogue: unlimited workflows, unlimited seats, unlimited in-app feed retention, 30-day logs. If we go over 10,000 messages it contacts us; it does not block sends.
- `@knocklabs/react` provides a bell, a popover feed and a full feed. The feed is secured with RS256 user tokens signed on the server, which fits React Router loaders.
- Knock counts **each channel separately**, so 10,000 messages is about 5,000 notifications that go out in-app and by email. That is the main thing to watch.
- Knock sends email through our own provider. Postmark's free plan is only 100 emails a month, which is too small. Resend's free plan (3,000 a month, 100 a day) is supported by Knock and is the best free fit. If we keep Postmark, we pay for it ($15 a month).

**Runner-up: Novu Cloud (Free plan).** It counts one **workflow run** per subscriber however many channels it uses, so 10,000 runs means 10,000 in-app + email notifications. It also documents React Router and Remix setups and supports Postmark, Resend and Brevo. It comes second because the free plan allows **only 5 workflows** (about 5 notification types, refund emails included), **3 team members**, 1-day activity logs and 1-day delay/digest windows. It also **rejects triggers with HTTP 402** once the 10,000 runs are used up, so notifications stop until the month resets.

## Comparison

| | Knock | Novu Cloud | Courier | SuprSend | MagicBell |
|---|---|---|---|---|---|
| Free plan | Developer, $0 | Free, $0 | Developer, $0 | Free, $0 | Builder, $0 |
| Monthly volume | 10,000 messages | 10,000 workflow runs | 10,000 sends | 10,000 notifications | **1,000 deliveries** |
| How in-app + email to one person counts | 2 (per channel) | 1 (per run) | 1 via Send API (per recipient); 2 in Journeys ⚠ | 2 (per channel) | 2 (per channel) |
| Effective in-app + email notifications / month | ~5,000 | ~10,000 | ~10,000 ⚠ | ~5,000 | ~500 |
| Over the limit | Not capped; they contact you | **Blocked (HTTP 402)** | ⚠ not stated | Not stopped; they contact you | ⚠ not stated for Builder |
| Recipients | Unlimited stored profiles | Unlimited subscribers | ⚠ not stated | ⚠ not stated | Unlimited users |
| Workflows / templates | Not limited | **5 workflows**, 20 steps each | ⚠ not stated | ⚠ not stated | 1 project |
| Seats | Unlimited | **3** | ⚠ not stated | Unlimited | Unlimited |
| In-app message retention | Unlimited (configurable) | 30 days | ⚠ not stated (logs 30 days) | ⚠ not stated (logs 30 days) | ⚠ not stated |
| Log retention | 30 days | 1 day | 30 days | 30 days | ⚠ not stated |
| Vendor branding in the in-app UI | Yes | Yes | ⚠ not stated | Yes | ⚠ not stated |
| React inbox | `@knocklabs/react` | `@novu/react` (React 18+, 19 supported) | `@trycourier/courier-react` (React 18+) | `@suprsend/react` | React components (package not confirmed) |
| Inbox auth | RS256 JWT (enhanced security) | Subscriber session; HMAC to update profiles | JWT from your backend | JWT | ⚠ not checked |
| Postmark / Resend / Brevo | Yes / Yes / No | Yes / Yes / Yes | Yes / Yes / ⚠ not listed | Yes / Yes / ⚠ not listed | No / No / No (SES, Mailgun, SendGrid, SMTP) |
| Disqualifier? | No | No, but 5-workflow cap and hard block | No, but too much left unconfirmed | No | **Yes: 1,000 deliveries** |

⚠ = not confirmed from a primary source; see "Not confirmed" below.

## Per service

### Knock
- **Free plan (Developer):** "up to 10,000" messages a month, where a message is "a single message delivered to a single user on a single channel". 30-day log retention. Feed retention unlimited (configurable). Unlimited team members, channels and stored profiles. Knock branding stays. There are also 500 Guide recipients, but that is for in-app banners and popups, which we don't need. Knock says it doesn't hard-cap Free and will contact you about billing if you go over. The next plan is Starter at $250 a month. [knock.app/pricing](https://knock.app/pricing)
- **React:** `@knocklabs/react` provides `KnockProvider`, `KnockFeedProvider`, `NotificationIconButton`, `NotificationFeedPopover` and `NotificationFeed`, plus a CSS import. The docs don't mention SSR or React version support. By default, anyone with the feed ID can read it, so turn on "enhanced security mode" before production. [docs.knock.app/in-app-ui/react/feed](https://docs.knock.app/in-app-ui/react/feed)
- **Auth:** RS256 JWT signed with a private signing key (`KNOCK_SIGNING_KEY`) using `signUserToken` from `@knocklabs/node`. Default expiry is 3600 seconds. A React Router loader can sign it and pass it to the client. [docs.knock.app/in-app-ui/security-and-authentication](https://docs.knock.app/in-app-ui/security-and-authentication)
- **Email providers:** Knock (testing only), Amazon SES, Cloudflare Email, MailerSend, Mailgun, Mailjet, Mailtrap, Mandrill, **Postmark**, **Resend**, SendGrid, SMTP, SparkPost. Brevo is not listed (you could connect it over SMTP, but I didn't verify that). Sandbox mode can test email steps. [docs.knock.app/integrations/email/overview](https://docs.knock.app/integrations/email/overview)

### Novu Cloud
- **Free plan:** "10,000 workflow runs / month", "Up to 5 workflows", 2 environments, "Up to 3 team members", activity feed retention 24 hours, unlimited subscribers, all channels including email and in-app. Novu branding stays. Pro starts at $30 a month. [novu.co/pricing](https://novu.co/pricing)
- **Billing unit:** "A workflow run is one execution of a workflow for one subscriber," counted "regardless of how many steps the workflow contains or how many channels deliver a message." Runs from Dev and Prod count toward the same monthly total. Once Free runs are used up, "Trigger requests are rejected with HTTP 402 until the billing period resets or you upgrade." [docs.novu.co/platform/account/billing](https://docs.novu.co/platform/account/billing)
- **Limits table (Free):** 5 workflows, 20 steps per workflow, 1 layout, delay and digest up to 1 day, throttle up to 1 hour, inbox feed retention 30 days, activity feed retention 1 day, 3 team members. [docs.novu.co/platform/developer/limits](https://docs.novu.co/platform/developer/limits)
- **React:** `@novu/react` `<Inbox />` (Bell, Notifications, Preferences). Needs React 18.0.0 or later; React 19 supported. [docs.novu.co/platform/inbox/overview](https://docs.novu.co/platform/inbox/overview). There is a Remix quickstart, and a `routerPush` prop for React Router navigation ([docs.novu.co/platform/quickstart/remix](https://docs.novu.co/platform/quickstart/remix), [docs.novu.co/platform/quickstart/react](https://docs.novu.co/platform/quickstart/react)).
- **Email providers:** SendGrid, Amazon SES, **Resend**, **Postmark**, **Brevo**, Mailgun, Mailjet, SparkPost, Mandrill, Outlook 365, Infobip, Braze, MailerSend, Mailtrap, Netcore, Plunk, Anypost, Email Webhook, Custom SMTP. [docs.novu.co/platform/integrations/email](https://docs.novu.co/platform/integrations/email). The built-in demo email provider is for testing only: 300 notifications a month, sent only to the account owner's address. [docs.novu.co/platform/integrations/demo-integration](https://docs.novu.co/platform/integrations/demo-integration)

### Courier
- **Free plan (Developer):** "Start free with 10,000 sends a month." "One send is one template sent to one recipient." Business costs $0.005 per send, including the first 10,000. [courier.com/pricing](https://www.courier.com/pricing)
- **Billing unit:** Search results quoting Courier's docs say the Send API bills once per recipient across channels, but each Send node in Journeys bills per channel. Test, undeliverable and preference-blocked messages also count. I couldn't open the billing doc page itself, so this is **not confirmed**.
- **React:** `@trycourier/courier-react` (v9) `<CourierInbox />`, React 18+. Your backend generates a JWT. The docs don't cover SSR or retention. [courier.com/docs/platform/inbox/inbox-overview](https://www.courier.com/docs/platform/inbox/inbox-overview)
- **Email providers:** Amazon SES, SendGrid, **Postmark**, Mailgun, **Resend**, SMTP, Mandrill, SparkPost, Mailjet, MailerSend, Amply, Gmail, OneSignal. [courier.com/docs/external-integrations/email/intro](https://www.courier.com/docs/external-integrations/email/intro)
- **Why it isn't recommended:** the pricing page doesn't say whether Inbox is in the free plan (only a Courier blog post says so), and it doesn't state seats, recipient limits or what happens over the limit. It may well be as good as Novu on volume, but too much is unconfirmed.

### SuprSend
- **Free plan:** 10k notifications a month, unlimited team members, 30-day log retention, "In-app notification feed (with SuprSend branding)", no card required. "Each channel counts as a separate notification." Over the limit, "We do not stop processing and sending your notification requests"; they contact you instead. Essentials costs $100 a month. [suprsend.com/pricing](https://www.suprsend.com/pricing)
- **React:** `@suprsend/react` (the old `@suprsend/react-inbox` is no longer supported). Drop-in or headless. Auth is a signed JWT. [docs.suprsend.com/docs/inbox-react](https://docs.suprsend.com/docs/inbox-react)
- **Email providers:** the email docs link to Postmark, Resend and SendGrid; the full list was not on that page. [docs.suprsend.com/docs/email](https://docs.suprsend.com/docs/email)
- **Compared with Knock:** the same per-channel counting and limit, but a less established React SDK, and inbox retention isn't stated.

### MagicBell: disqualified
- **Free plan (Builder):** "1,000 Deliveries/mo.", 1 project, unlimited team members and users. Startup costs $249 a month. [magicbell.com/pricing](https://www.magicbell.com/pricing). A delivery counts per channel (in-app + email = 2), according to the pricing page FAQ as quoted in search results. So the free plan covers about 500 in-app + email notifications a month.
- **Email providers:** Amazon SES, Mailgun, Ping Email, SMTP, SendGrid. Postmark and Resend are not listed. [magicbell.com/docs](https://www.magicbell.com/docs)

## Email providers (free tiers)

Every service above sends email through a provider we connect, so we also need a free email provider.

| Provider | Free plan | Fits Cadence? |
|---|---|---|
| **Postmark** (current) | 100 emails a month, doesn't expire, no overage allowed. The next plan is Basic at $15 a month for 10,000. [postmarkapp.com/pricing](https://postmarkapp.com/pricing) | Only for very low volume. 100 a month is used up quickly once every Notification can also send email. |
| **Resend** | 3,000 emails a month, **100 a day**, 3 domains, 30-day retention. [resend.com/pricing](https://resend.com/pricing) | **Best free fit.** Supported by Knock, Novu and Courier. The 100-a-day limit is the real cap. |
| **Brevo** | 300 emails a day (~9,000 a month), "forever free", API and SMTP included. Account must be approved before sending. From Brevo's product pages; the pricing page itself didn't render. [brevo.com/products/transactional-email](https://www.brevo.com/products/transactional-email/) | Higher volume than Resend. Native in Novu, but not listed by Knock or Courier. |
| **SendGrid** | No permanent free plan since 2025. New accounts get a one-time 60-day trial (100 a day). [support.sendgrid.com](https://support.sendgrid.com/hc/en-us/articles/35270136965403-Overview-of-60-Day-Free-Trial-Plans-for-New-SendGrid-Accounts), [twilio.com changelog](https://www.twilio.com/en-us/changelog/changes-coming-to-sendgrid-s-free-plans) | **No.** The free plan has been retired. |

Moving the refund emails onto the new service means they also come out of the email provider's free allowance.

## Not confirmed from a primary source

- **Courier:** that one send to one recipient over several channels is billed once (seen only in search summaries of Courier docs); whether Inbox is in the Developer plan (only a Courier blog says so); seats, recipient limits, behaviour over the limit, and inbox retention.
- **MagicBell:** how deliveries are counted per channel (seen only in a search summary of the pricing FAQ); the Builder plan's overage behaviour; retention; branding; the React package name.
- **SuprSend:** subscriber and workflow caps, and inbox message retention.
- **Brevo:** the limits come from Brevo product pages, not the pricing page (which didn't render, and help.brevo.com returned 403).
- **SendGrid:** the pricing page redirected in a loop; the retirement is confirmed by SendGrid support and Twilio changelog pages, seen in search results only.
- **React Router 8 / SSR:** none of the vendors document React Router 8 specifically. All the inbox components are client-side React with hooks and live connections. Expect to render them client-only (for example, mount the bell after hydration) and sign user tokens in a loader. Novu documents Remix and React Router setups; Knock, Courier and SuprSend don't mention SSR. This wasn't tested in Cadence.
- **Cadence's real volume:** the repo doesn't say how many users or notifications to expect, so "big enough" is judged against the numbers above, not measured usage.
