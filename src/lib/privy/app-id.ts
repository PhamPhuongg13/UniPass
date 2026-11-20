export const PRIVY_APP_ID = (process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "").trim();
export const APP_ID_STATE: "missing" | "malformed" | "ok" = !PRIVY_APP_ID ? "missing" : PRIVY_APP_ID.length !== 25 ? "malformed" : "ok";
