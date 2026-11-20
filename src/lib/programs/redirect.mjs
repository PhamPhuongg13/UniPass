export function allowedRedirect(uri, allowList, appOrigin) {
  try {
    const url = new URL(uri, appOrigin);
    if (url.username || url.password || url.hash || !["http:", "https:"].includes(url.protocol)) return null;
    if (url.protocol === "http:" && url.hostname === "localhost" && process.env.NODE_ENV !== "production") return url;
    if (!Array.isArray(allowList) || !allowList.some(item => { try { return new URL(item, appOrigin).origin === url.origin && new URL(item, appOrigin).pathname === url.pathname; } catch { return false; } })) return null;
    return url;
  } catch { return null; }
}
