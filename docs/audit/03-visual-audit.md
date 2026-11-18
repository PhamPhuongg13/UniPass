# Visual and responsive audit

## Method

Playwright Chromium rendered 11 public/demo routes. Horizontal overflow and successful HTTP page responses were checked at CSS viewport widths **195, 260, 312, 320, 375, 390, 768, 1024, 1280 and 1440px**. Widths 312/260/195 approximate browser zoom 125/150/200% from 390px. This uses equivalent CSS layout widths, not OS/browser zoom controls.

The screenshot set includes each route at 1440px and effective widths 390/312/260/195px, with the narrow captures named 125/150/200%. Full-page captures are in [`screenshots/`](screenshots/).

## Screens

| Route | Captures |
| --- | --- |
| `/` | desktop and 390/312/260/195px |
| `/discover` | desktop and 390/312/260/195px |
| `/events/build-night` | desktop and 390/312/260/195px |
| `/my-events` | desktop and 390/312/260/195px |
| `/tickets/1` | desktop and 390/312/260/195px |
| `/verify-student` | desktop and 390/312/260/195px |
| `/profile` | desktop and 390/312/260/195px |
| `/organizer` | desktop and 390/312/260/195px |
| `/organizer/events/new` | desktop and 390/312/260/195px |
| `/organizer/events/demo` | desktop and 390/312/260/195px |
| `/organizer/events/demo/check-in` | desktop and 390/312/260/195px |

## Corrections made during audit

- Header, hero CTA and illustration fit on a 195px effective viewport.
- Homepage section heading/link stacks on very narrow screens.
- Organizer creation form fields constrain grid tracks and native control widths.
- Organizer management tabs wrap rather than expanding the page.

All routes returned HTTP 200 and passed the horizontal overflow check at every listed width after fixes. Category chips intentionally scroll horizontally inside their own row. The visual pass is not a contrast certification or screen-reader audit.
