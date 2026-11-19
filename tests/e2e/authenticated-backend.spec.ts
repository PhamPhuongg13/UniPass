import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { Wallet } from "ethers";

const prisma = new PrismaClient();

test.afterAll(async () => { await prisma.$disconnect(); });

test("authenticated wallet can issue a student challenge and save organizer metadata", async ({ request }) => {
  const wallet = Wallet.createRandom();
  const address = wallet.address.toLowerCase();
  const origin = "http://127.0.0.1:3017";
  let eventSlug: string | undefined;
  let replayAddress: string | undefined;

  try {
    const challengeResponse = await request.post("/api/auth/challenge", {
      headers: { origin },
      data: { address },
    });
    expect(challengeResponse.status()).toBe(200);
    const { message } = await challengeResponse.json() as { message: string };
    const signed = await request.post("/api/auth/verify", {
      headers: { origin },
      data: { message, signature: await wallet.signMessage(message) },
    });
    expect(signed.status()).toBe(200);
    expect((await signed.json()).wallet).toBe(address);

    const session = await request.get("/api/auth/session");
    expect((await session.json()).wallet).toBe(address);

    const emailChallengeResponse = await request.post("/api/student-verification/challenge", {
      headers: { origin },
    });
    expect(emailChallengeResponse.status()).toBe(200);
    const emailChallenge = await emailChallengeResponse.json() as {
      challenge: string; challengeId: string; body: string; chainId: number; purpose: string;
    };
    expect(emailChallenge.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(emailChallenge.body).toContain(`UNIPASS-CHALLENGE:${emailChallenge.challenge}`);
    expect(emailChallenge.chainId).toBe(43113);
    expect(emailChallenge.purpose).toBe("unipass-student-email-control");
    expect(await prisma.studentEmailChallenge.findUnique({
      where: { id: emailChallenge.challengeId }, select: { nonceHash: true, wallet: true, origin: true },
    })).toMatchObject({ wallet: address, origin, nonceHash: expect.stringMatching(/^[a-f0-9]{64}$/) });

    const malformedProofBytes = await request.post("/api/student-verification/verify", {
      headers: { origin },
      data: { challengeId: emailChallenge.challengeId, challenge: emailChallenge.challenge, proofData: "not-hex", publicOutputs: ["0x0", "0x0", "0x0", "0x0", "0x0"] },
    });
    expect(malformedProofBytes.status()).toBe(400);
    const malformedPublicSignals = await request.post("/api/student-verification/verify", {
      headers: { origin },
      data: { challengeId: emailChallenge.challengeId, challenge: emailChallenge.challenge, proofData: "00", publicOutputs: ["0x0", "0xz", "0x0", "0x0", "0x0"] },
    });
    expect(malformedPublicSignals.status()).toBe(400);

    const invalidProof = await request.post("/api/student-verification/verify", {
      headers: { origin },
      data: {
        challengeId: emailChallenge.challengeId,
        challenge: `${emailChallenge.challenge[0] === "A" ? "B" : "A"}${emailChallenge.challenge.slice(1)}`,
        proofData: "00",
        publicOutputs: ["0x0", "0x0", "0x0", "0x0", "0x0"],
      },
    });
    expect(invalidProof.status()).toBe(401);

    await prisma.studentEmailChallenge.update({ where: { id: emailChallenge.challengeId }, data: { wallet: "0x9999999999999999999999999999999999999999" } });
    const wrongWallet = await request.post("/api/student-verification/verify", {
      headers: { origin },
      data: { challengeId: emailChallenge.challengeId, challenge: emailChallenge.challenge, proofData: "00", publicOutputs: ["0x0", "0x0", "0x0", "0x0", "0x0"] },
    });
    expect(wrongWallet.status()).toBe(401);
    await prisma.studentEmailChallenge.update({ where: { id: emailChallenge.challengeId }, data: { wallet: address } });

    await prisma.studentEmailChallenge.update({ where: { id: emailChallenge.challengeId }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    const expiredChallenge = await request.post("/api/student-verification/verify", {
      headers: { origin },
      data: { challengeId: emailChallenge.challengeId, challenge: emailChallenge.challenge, proofData: "00", publicOutputs: ["0x0", "0x0", "0x0", "0x0", "0x0"] },
    });
    expect(expiredChallenge.status()).toBe(409);

    const replayChallengeResponse = await request.post("/api/student-verification/challenge", { headers: { origin } });
    expect(replayChallengeResponse.status()).toBe(200);
    const replayChallenge = await replayChallengeResponse.json() as { challenge: string; challengeId: string };
    await prisma.studentEmailChallenge.update({ where: { id: replayChallenge.challengeId }, data: { consumedAt: new Date() } });
    const replayedChallenge = await request.post("/api/student-verification/verify", {
      headers: { origin },
      data: { challengeId: replayChallenge.challengeId, challenge: replayChallenge.challenge, proofData: "00", publicOutputs: ["0x0", "0x0", "0x0", "0x0", "0x0"] },
    });
    expect(replayedChallenge.status()).toBe(409);

    const startsAt = new Date(Date.now() + 48 * 60 * 60_000);
    const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60_000);
    const deadline = new Date(startsAt.getTime() - 60 * 60_000);
    const eventResponse = await request.post("/api/events", {
      headers: { origin },
      data: {
        title: `E2E Organizer ${Date.now()}`,
        description: "Ephemeral integration test event; removed during test cleanup.",
        category: "community", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
        timezone: "Asia/Ho_Chi_Minh", location: "VNU test venue", isOnline: false,
        metadataCapacity: 23, registrationDeadline: deadline.toISOString(),
        visibility: "UNLISTED", organizerName: "UniPass E2E test",
      },
    });
    expect(eventResponse.status()).toBe(201);
    const eventData = await eventResponse.json();
    eventSlug = eventData.event.slug;
    expect(eventData.blockchain.status).toBe("PENDING");
    expect(eventData.event.chainEventId).toBeNull();

    // A linked chain event must keep its metadata record so UniPass can retain
    // the organizer/event relationship and reconcile later chain activity.
    await prisma.eventMetadata.update({ where: { slug: eventSlug }, data: { chainEventId: `qa-${Date.now()}` } });
    const deleteLinkedEvent = await request.delete(`/api/events/${eventData.event.id}`, { headers: { origin } });
    expect(deleteLinkedEvent.status()).toBe(409);
    const unlinkConfirmedEvent = await request.patch(`/api/events/${eventData.event.id}`, { headers: { origin }, data: { chainEventId: null } });
    expect(unlinkConfirmedEvent.status()).toBe(409);
    const fakeSyncSuccess = await request.patch(`/api/events/${eventData.event.id}`, { headers: { origin }, data: { syncStatus: "SYNCED" } });
    expect(fakeSyncSuccess.status()).toBe(400);
    expect(await prisma.eventMetadata.findUnique({ where: { slug: eventSlug }, select: { id: true } })).not.toBeNull();

    const authorization = await request.post(`/api/events/${eventData.event.id}/registration-authorization`, { headers: { origin } });
    expect([403, 503]).toContain(authorization.status());
    expect(await authorization.json()).not.toHaveProperty("signature");

    const listed = await request.get("/api/events");
    expect(listed.status()).toBe(200);
    expect((await listed.json()).events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: eventSlug }),
    ]));

    const parallelLoginChallenges = await Promise.all(Array.from({ length: 10 }, () => request.post("/api/auth/challenge", { headers: { origin }, data: { address } })));
    expect(parallelLoginChallenges.every(response => [200, 429, 503].includes(response.status()))).toBe(true);
    expect(parallelLoginChallenges.filter(response => response.status() === 200).length).toBeLessThanOrEqual(7);

    const parallelEmailChallenges = await Promise.all(Array.from({ length: 8 }, () => request.post("/api/student-verification/challenge", { headers: { origin } })));
    expect(parallelEmailChallenges.every(response => [200, 429, 503].includes(response.status()))).toBe(true);
    expect(parallelEmailChallenges.filter(response => response.status() === 200).length).toBeLessThanOrEqual(3);

    const replayWallet = Wallet.createRandom();
    replayAddress = replayWallet.address.toLowerCase();
    const loginReplayChallenge = await request.post("/api/auth/challenge", { headers: { origin }, data: { address: replayAddress } });
    expect(loginReplayChallenge.status()).toBe(200);
    const replayMessage = (await loginReplayChallenge.json()).message as string;
    const replaySignature = await replayWallet.signMessage(replayMessage);
    const simultaneousLoginAttempts = await Promise.all(Array.from({ length: 2 }, () => request.post("/api/auth/verify", { headers: { origin }, data: { message: replayMessage, signature: replaySignature } })));
    expect(simultaneousLoginAttempts.map(response => response.status()).sort()).toEqual([200, 401]);
  } finally {
    if (eventSlug) {
      const event = await prisma.eventMetadata.findUnique({ where: { slug: eventSlug }, select: { id: true } });
      if (event) {
        await prisma.registrationMirror.deleteMany({ where: { eventId: event.id } });
        await prisma.ticketMirror.deleteMany({ where: { eventId: event.id } });
        await prisma.eventMetadata.delete({ where: { id: event.id } });
      }
    }
    await prisma.organizerProfile.deleteMany({ where: { wallet: address } });
    await prisma.studentEmailChallenge.deleteMany({ where: { wallet: address } });
    await prisma.authNonce.deleteMany({ where: { wallet: address } });
    await prisma.authSession.deleteMany({ where: { wallet: address } });
    if (replayAddress) {
      await prisma.authNonce.deleteMany({ where: { wallet: replayAddress } });
      await prisma.authSession.deleteMany({ where: { wallet: replayAddress } });
    }
  }
});

test("unauthenticated mutations and cross-origin challenge requests fail closed", async ({ request }) => {
  expect((await request.post("/api/auth/challenge", { headers: { origin: "https://attacker.invalid" }, data: { address: Wallet.createRandom().address } })).status()).toBe(403);
  expect((await request.post("/api/events", { data: {} })).status()).toBe(403);
  expect((await request.post("/api/student-verification/challenge", { headers: { origin: "http://127.0.0.1:3017" } })).status()).toBe(401);
  expect((await request.post("/api/student-verification/verify", { headers: { origin: "http://127.0.0.1:3017" }, data: {} })).status()).toBe(401);
  expect((await request.post("/api/events/test-event/check-in/prepare", { headers: { origin: "http://127.0.0.1:3017" }, data: { credential: "A".repeat(43) } })).status()).toBe(401);
  expect((await request.post("/api/tickets/1/check-in-credential", { headers: { origin: "http://127.0.0.1:3017" }, data: {} })).status()).toBe(401);
});

test("wallet connect UI signs in and enables the email challenge flow", async ({ page }) => {
  const wallet = Wallet.createRandom();
  const address = wallet.address.toLowerCase();
  await page.exposeFunction("__unipassTestSign", (message: string) => wallet.signMessage(message));
  await page.addInitScript((testAddress: string) => {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const fromHex = (hex: string) => new TextDecoder().decode(Uint8Array.from(hex.slice(2).match(/.{1,2}/g) ?? [], byte => Number.parseInt(byte, 16)));
    Object.defineProperty(window, "ethereum", { configurable: true, value: {
      request: async ({ method, params = [] }: { method: string; params?: string[] }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [testAddress];
        if (method === "eth_chainId") return "0xa869";
        if (method === "net_version") return "43113";
        if (method === "personal_sign") return (window as unknown as { __unipassTestSign: (message: string) => Promise<string> }).__unipassTestSign(fromHex(params[0]));
        throw Object.assign(new Error(`Unsupported test-provider method: ${method}`), { code: 4200 });
      },
      on: (event: string, listener: (...args: unknown[]) => void) => {
        const values = listeners.get(event) ?? new Set(); values.add(listener); listeners.set(event, values);
      },
      removeListener: (event: string, listener: (...args: unknown[]) => void) => listeners.get(event)?.delete(listener),
    } });
  }, address);

  try {
    await page.goto("/verify-student");
    await page.getByRole("button", { name: "Kết nối ví" }).click();
    await expect(page.getByRole("button", { name: `${address.slice(0, 6)}…${address.slice(-4)}` })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Tạo challenge email" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Tạo challenge email" }).click();
    await expect(page.getByText("UniPass email verification", { exact: true })).toBeVisible({ timeout: 20_000 });
  } finally {
    await prisma.studentEmailChallenge.deleteMany({ where: { wallet: address } });
    await prisma.authNonce.deleteMany({ where: { wallet: address } });
    await prisma.authSession.deleteMany({ where: { wallet: address } });
  }
});

test("ticket check-in action stays unavailable until direct ownership verification", async ({ page, request }) => {
  const wallet = Wallet.createRandom();
  const origin = "http://127.0.0.1:3017";
  const address = wallet.address.toLowerCase();
  try {
    const challengeResponse = await request.post("/api/auth/challenge", { headers: { origin }, data: { address } });
    expect(challengeResponse.status()).toBe(200);
    const { message } = await challengeResponse.json() as { message: string };
    const signed = await request.post("/api/auth/verify", { headers: { origin }, data: { message, signature: await wallet.signMessage(message) } });
    expect(signed.status()).toBe(200);
    const { cookies } = await request.storageState();
    await page.context().addCookies(cookies);

    await page.goto("/tickets/1");
    await expect(page.getByRole("button", { name: "Xác minh quyền sở hữu" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mã check-in của vé" })).toBeVisible();
    await expect(page.getByText("Hãy xác minh quyền sở hữu trên Fuji trước khi tạo mã check-in.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tạo mã check-in" })).toHaveCount(0);
  } finally {
    await prisma.authNonce.deleteMany({ where: { wallet: address } });
    await prisma.authSession.deleteMany({ where: { wallet: address } });
  }
});
