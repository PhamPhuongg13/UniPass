import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const routes = ["/", "/discover", "/events/build-night", "/my-events", "/tickets/1", "/verify-student", "/profile", "/organizer", "/organizer/events/new", "/organizer/events/demo", "/organizer/events/demo/check-in"];

test("public and organizer routes render and fit viewport widths", async ({ page }) => {
  for (const width of [195, 260, 312, 320, 375, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status(), `${route} at ${width}px`).toBe(200);
      await expect(page.locator("body")).toBeVisible();
      const overflow = await page.evaluate(() => ({
        hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        elements: [...document.querySelectorAll("body *")].filter(element => { const rect = element.getBoundingClientRect(); return rect.right > document.documentElement.clientWidth + 2 && getComputedStyle(element).position !== "absolute"; }).slice(0, 8).map(element => ({ tag: element.tagName, className: String((element as HTMLElement).className), right: Math.round(element.getBoundingClientRect().right) })),
      }));
      expect(overflow.hasOverflow, `horizontal overflow on ${route} at ${width}px: ${JSON.stringify(overflow.elements)}`).toBe(false);
    }
  }
});

test("ticket detail does not request wallet access before explicit action", async ({ page }) => {
  const requested: string[] = [];
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(window, "__walletCalls", { value: calls });
    Object.defineProperty(window, "ethereum", { value: { request: async ({ method }: { method: string }) => { calls.push(method); return []; }, on() {}, removeListener() {} } });
  });
  await page.goto("/tickets/1");
  await expect(page.getByRole("button", { name: "Xác minh quyền sở hữu" })).toBeVisible();
  requested.push(...await page.evaluate(() => (window as unknown as { __walletCalls: string[] }).__walletCalls));
  expect(requested).toEqual([]);
});

test("capture key routes at desktop and mobile sizes and browser zoom levels", async ({ page }) => {
  const output = path.join(process.cwd(), "docs/audit/screenshots");
  await mkdir(output, { recursive: true });
  for (const route of routes) {
    const name = route === "/" ? "home" : route.slice(1).replaceAll("/", "-");
    const captures: readonly (readonly [number, number])[] = [[1440, 100], [390, 100], [312, 125], [260, 150], [195, 200]];
    for (const [width, zoom] of captures) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await page.screenshot({ path: path.join(output, `${name}-${width}px-${zoom}pct.png`), fullPage: true });
    }
  }
});
