import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const routes = ["/", "/discover", "/events/build-night", "/my-events", "/tickets/1", "/verify-student", "/profile", "/organizer", "/organizer/events/new", "/organizer/events/demo", "/organizer/events/demo/check-in"];

test("public and organizer routes render and fit viewport widths", async ({ page }) => {
  for (const route of routes) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 90_000 });
    expect(response?.status(), route).toBe(200);
    await expect(page.locator("body")).toBeVisible();
    for (const width of [195, 260, 312, 320, 360, 375, 390, 414, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
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
  await expect(page.getByRole("button", { name: /Tạo mã check-in/ })).toHaveCount(0);
  await expect(page.getByText("Kết nối và đăng nhập ví để xem vé.")).toBeVisible();
  requested.push(...await page.evaluate(() => (window as unknown as { __walletCalls: string[] }).__walletCalls));
  expect(requested).toEqual([]);
});

test("student verification page keeps verification unavailable without a wallet session", async ({ page }) => {
  await page.goto("/verify-student");
  await expect(page.getByRole("heading", { name: /Email của bạn/ })).toBeVisible();
  await expect(page.getByText(/Kết nối và đăng nhập ví Fuji/)).toBeVisible();
  await expect(page.getByText(/chưa xác nhận tư cách sinh viên/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Tạo proof cục bộ/ })).toHaveCount(0);
});

test("capture key routes at desktop and mobile sizes and browser zoom levels", async ({ page }) => {
  const output = path.join(process.cwd(), "docs/audit/screenshots");
  const qaOutput = path.join(process.cwd(), "docs/qa/screenshots");
  await mkdir(output, { recursive: true });
  await mkdir(qaOutput, { recursive: true });
  for (const route of routes) {
    const name = route === "/" ? "home" : route.slice(1).replaceAll("/", "-");
    // The preceding route test checks twelve widths, including the requested
    // phone breakpoints. Keep saved
    // browser captures to desktop/mobile representatives so this suite does
    // not retain 55 full-page Chromium bitmaps in one worker.
    const captures: readonly (readonly [number, number])[] = [[1440, 100], [390, 100]];
    for (const [width, zoom] of captures) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await expect(page.locator("body")).toBeVisible();
      await page.screenshot({ path: path.join(output, `${name}-${width}px-${zoom}pct.png`), fullPage: false });
      if (route === "/my-events" && width === 1440) {
        await page.screenshot({ path: path.join(qaOutput, "my-tickets-after-1440.png"), fullPage: false });
      }
    }
  }
});
