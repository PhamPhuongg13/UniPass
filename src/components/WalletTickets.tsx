"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createReadOnlyFujiProvider, eventManager, ticketContract } from "@/lib/contracts/chain";
import { discoverOwnedTokenIds } from "@/lib/tickets/discover-owned-tickets.mjs";
import { canUseTicketOwnershipActions, deriveTicketPageState, type TicketOwnershipState, type TicketRpcState } from "@/lib/tickets/ticket-page-state.mjs";
import { FUJI_CHAIN_ID } from "@/lib/web3/client";

type CachedTicket = { tokenId: string; eventId: string; title: string; startsAt: string | null; location: string | null };
type OwnedTicket = CachedTicket & { checkedIn: boolean | null; active: boolean | null; ownership: TicketOwnershipState };
type TicketIndex = { status: "ready" | "syncing" | "needs-deployment-block"; stale: boolean; lastSyncedAt: string | null };
type MetadataState = "loading" | "available" | "empty" | "unavailable" | "fallback";
const PAGE_SIZE = 50;
const VERIFY_CONCURRENCY = 4;

function friendlyError(value: unknown) {
  const message = value instanceof Error ? value.message.toLowerCase() : "";
  if (/429|1015|rate.?limit|too many requests/.test(message)) return "RPC Avalanche Fuji đang bận. Vé đã lưu vẫn hiển thị; quyền sở hữu chưa xác minh được.";
  if (/network|timeout|timed out|fetch|socket|unavailable|could not coalesce|econn|refused|bad response|wrong-fuji-network/.test(message)) return "Chưa kết nối được RPC Avalanche Fuji. Vé đã lưu chỉ là metadata, chưa xác nhận quyền sở hữu.";
  if (/contract|ticket address|eventmanager/.test(message)) return "Không đọc được hợp đồng vé Fuji. Metadata đã lưu vẫn còn nhưng chưa xác minh ownership.";
  if (/đăng nhập|phiên ví/.test(message)) return value instanceof Error ? value.message : "Hãy đăng nhập lại bằng ví của bạn.";
  if (/ticket-not-owned/.test(message)) return "Ví hiện tại không sở hữu vé này trên Fuji.";
  if (/missing-ticket-functions|could not decode result data/.test(message)) return "ABI hoặc địa chỉ hợp đồng vé Fuji chưa khớp. Quyền sở hữu chưa xác minh được.";
  if (/ticket-discovery-limit/.test(message)) return "Ví có NFT vé trên Fuji nhưng chưa tìm đủ mã vé. Cần đồng bộ lịch sử vé rồi thử lại.";
  if (/ticket-balance-mismatch/.test(message)) return "Fuji báo ví có vé nhưng chưa tìm thấy token tương ứng. Hãy kiểm tra index và ABI Ticket.";
  return "Không tải được vé — vui lòng thử lại.";
}

function isMissingToken(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const details = "revert" in error && error.revert && typeof error.revert === "object" && "name" in error.revert ? String(error.revert.name).toLowerCase() : "";
  return /nonexistent token|invalid token id|owner query for nonexistent token/.test(`${message} ${details}`);
}

function isRpcFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const code = error && typeof error === "object" && "code" in error ? String(error.code).toLowerCase() : "";
  return /429|1015|rate.?limit|too many requests|network|timeout|timed out|fetch|socket|unavailable|could not coalesce|econn|refused|bad response|wrong-fuji-network/.test(`${message} ${code}`);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return output;
}

export function WalletTickets({
  tokenId,
  walletAddress = "",
  onOwnershipChange,
}: {
  tokenId?: string;
  walletAddress?: string;
  onOwnershipChange?: (state: TicketOwnershipState | "unknown") => void;
}) {
  const [tickets, setTickets] = useState<OwnedTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [wallet, setWallet] = useState(walletAddress);
  const [index, setIndex] = useState<TicketIndex | null>(null);
  const [metadataState, setMetadataState] = useState<MetadataState>("loading");
  const [rpcState, setRpcState] = useState<TicketRpcState>("idle");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [emptyOnChain, setEmptyOnChain] = useState(false);
  const loadingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setTickets([]);
    setError("");
    setIndex(null);
    setMetadataState("loading");
    setRpcState("idle");
    setOffset(0);
    setHasMore(false);
    setEmptyOnChain(false);
    setWallet(walletAddress);
    onOwnershipChange?.("unknown");
    abortRef.current?.abort();
    return () => abortRef.current?.abort();
  }, [walletAddress, tokenId, onOwnershipChange]);

  async function load(nextOffset = 0, append = false) {
    if (loadingRef.current) return;
    if (!walletAddress) { setError("Hãy kết nối và đăng nhập ví trước khi xem vé."); return; }
    loadingRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError("");
    setEmptyOnChain(false);
    setRpcState("checking");
    if (tickets.length === 0) setMetadataState("loading");
    let provider: ReturnType<typeof createReadOnlyFujiProvider> | undefined;
    try {
      let source: CachedTicket[];
      let cacheUnavailable = false;
      if (tokenId) {
        setMetadataState("fallback");
        const sessionResponse = await fetch("/api/auth/session", { cache: "no-store", signal: controller.signal });
        const session = await sessionResponse.json();
        if (!sessionResponse.ok || session.wallet?.toLowerCase() !== walletAddress.toLowerCase()) throw new Error("Phiên ví đã thay đổi. Hãy đăng nhập lại.");
        source = [{ tokenId, eventId: "", title: `Vé #${tokenId}`, startsAt: null, location: null }];
      } else {
        let response: Response | null = null;
        try { response = await fetch(`/api/tickets?wallet=${encodeURIComponent(walletAddress)}&offset=${nextOffset}`, { cache: "no-store", signal: controller.signal }); }
        catch { cacheUnavailable = true; }
        const result = response ? await response.json().catch(() => ({})) : {};
        if (!response || !response.ok) {
          if (response && (response.status === 401 || response.status === 409)) throw new Error(result.error || "Phiên ví đã thay đổi. Hãy đăng nhập lại.");
          cacheUnavailable = true;
          setMetadataState("unavailable");
          setIndex(null);
          setHasMore(false);
          source = [];
        } else {
          source = Array.isArray(result.tickets) ? result.tickets as CachedTicket[] : [];
          setMetadataState(source.length ? "available" : "empty");
          setIndex(result.index as TicketIndex);
          setHasMore(Boolean(result.hasMore));
        }
      }

      provider = createReadOnlyFujiProvider();
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== FUJI_CHAIN_ID) throw new Error("wrong-fuji-network");
      setRpcState("available");
      const ticket = ticketContract(provider);
      const manager = eventManager(provider);

      const readChainTicket = async (chainTokenId: string): Promise<OwnedTicket> => {
        const id = BigInt(chainTokenId);
        const eventId = String(await ticket.eventOfTicket(id));
        const [checkedInResult, eventResult] = await Promise.allSettled([
          ticket.checkedIn(id),
          manager.getFunction("getEvent")(BigInt(eventId)),
        ]);
        const checkedIn = checkedInResult.status === "fulfilled" ? Boolean(checkedInResult.value) : null;
        const active = eventResult.status === "fulfilled" ? Boolean(eventResult.value[5]) : null;
        const detailFailures = [checkedInResult, eventResult].filter(result => result.status === "rejected");
        if (detailFailures.some(result => result.status === "rejected" && isRpcFailure(result.reason))) setRpcState("partial");
        return {
          tokenId: chainTokenId,
          eventId,
          title: `Sự kiện #${eventId}`,
          startsAt: null,
          location: null,
          checkedIn,
          active,
          ownership: "verified",
        };
      };

      if (!source.length && !tokenId) {
        const balance = BigInt(await ticket.balanceOf(walletAddress));
        setEmptyOnChain(balance === BigInt(0));
        if (balance === BigInt(0)) {
          if (!append) setTickets([]);
          setRpcState("available");
          setOffset(nextOffset);
          return;
        }

        const discovery = await discoverOwnedTokenIds({ balance, nextTokenId: await ticket.nextTokenId(), walletAddress, ownerOf: async id => {
          try { return String(await ticket.ownerOf(id)); }
          catch (cause) { if (isMissingToken(cause)) return null; throw cause; }
        } });
        if (!discovery.complete) throw new Error("ticket-discovery-limit");
        const directlyFound = await Promise.all(discovery.tokenIds.map(readChainTicket));
        if (!directlyFound.length) throw new Error("ticket-balance-mismatch");
        setTickets(current => append ? [...current, ...directlyFound.filter(item => !current.some(existing => existing.tokenId === item.tokenId))] : directlyFound);
        setMetadataState(cacheUnavailable ? "unavailable" : "empty");
        setEmptyOnChain(false);
        setWallet(walletAddress);
        setOffset(nextOffset);
        return;
      }

      if (source.length === 0) {
        if (!append) setTickets([]);
        setOffset(nextOffset);
        return;
      }

      let ownerReadFailures = 0;
      let rpcReadFailures = 0;
      const checked: (OwnedTicket | null)[] = await mapWithConcurrency(source, VERIFY_CONCURRENCY, async (cached): Promise<OwnedTicket | null> => {
        let owner: string;
        try {
          owner = String(await ticket.ownerOf(BigInt(cached.tokenId)));
        } catch (cause) {
          if (isMissingToken(cause)) {
            if (tokenId) onOwnershipChange?.("not-owned");
            return null;
          }
          ownerReadFailures++;
          if (isRpcFailure(cause)) rpcReadFailures++;
          if (tokenId) onOwnershipChange?.("unverified");
          return { ...cached, checkedIn: null, active: null, ownership: "unverified" };
        }
        if (owner.toLowerCase() !== walletAddress.toLowerCase()) {
          if (tokenId) onOwnershipChange?.("not-owned");
          return null;
        }
        if (tokenId) onOwnershipChange?.("verified");

        let eventId = cached.eventId;
        let title = cached.title;
        let startsAt = cached.startsAt;
        let location = cached.location;
        try {
          eventId = String(await ticket.eventOfTicket(BigInt(cached.tokenId)));
          if (cached.eventId && cached.eventId !== eventId) {
            title = `Sự kiện #${eventId}`;
            startsAt = null;
            location = null;
          } else if (title.startsWith("Sự kiện #")) {
            title = `Sự kiện #${eventId}`;
          }
        } catch (cause) {
          if (isRpcFailure(cause)) rpcReadFailures++;
        }

        const [checkedInResult, eventResult] = await Promise.allSettled([
          ticket.checkedIn(BigInt(cached.tokenId)),
          eventId ? manager.getFunction("getEvent")(BigInt(eventId)) : Promise.reject(new Error("missing-event-id")),
        ]);
        const detailFailures = [checkedInResult, eventResult].filter(result => result.status === "rejected");
        rpcReadFailures += detailFailures.filter(result => result.status === "rejected" && isRpcFailure(result.reason)).length;
        return {
          ...cached,
          eventId,
          title,
          startsAt,
          location,
          checkedIn: checkedInResult.status === "fulfilled" ? Boolean(checkedInResult.value) : null,
          active: eventResult.status === "fulfilled" ? Boolean(eventResult.value[5]) : null,
          ownership: "verified",
        };
      });

      const visible = checked.filter((item): item is OwnedTicket => item !== null);
      if (tokenId && visible.length === 0) throw new Error("ticket-not-owned");
      if (!tokenId && visible.length === 0) {
        const balance = BigInt(await ticket.balanceOf(walletAddress));
        if (balance > BigInt(0)) {
          const discovery = await discoverOwnedTokenIds({ balance, nextTokenId: await ticket.nextTokenId(), walletAddress, ownerOf: async id => {
            try { return String(await ticket.ownerOf(id)); }
            catch (cause) { if (isMissingToken(cause)) return null; throw cause; }
          } });
          if (!discovery.complete) throw new Error("ticket-discovery-limit");
          const found = await Promise.all(discovery.tokenIds.map(readChainTicket));
          if (!found.length) throw new Error("ticket-balance-mismatch");
          setTickets(found);
          setEmptyOnChain(false);
          setMetadataState(cacheUnavailable ? "unavailable" : "available");
        } else {
          setTickets([]);
          setEmptyOnChain(true);
        }
      } else {
        setTickets(current => append ? [...current, ...visible.filter(item => !current.some(existing => existing.tokenId === item.tokenId))] : visible);
        setEmptyOnChain(false);
      }

      setRpcState(rpcReadFailures === 0 ? "available" : ownerReadFailures === source.length && rpcReadFailures >= source.length ? "unavailable" : "partial");
      setWallet(walletAddress);
      setOffset(nextOffset);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(friendlyError(cause));
        if (isRpcFailure(cause)) setRpcState("unavailable");
      }
    } finally {
      await provider?.destroy();
      loadingRef.current = false;
      setLoading(false);
    }
  }

  const state = deriveTicketPageState({
    loading,
    metadataState,
    indexStatus: index?.status ?? null,
    indexStale: index?.stale ?? false,
    rpcState,
    ownershipStates: tickets.map(ticket => ticket.ownership),
  });
  const visibleNotice = error ? null : state.notice;

  return <div className="tool-panel ticket-list" data-ticket-state={state.pageState}>
    {wallet && <p className="seed-note wallet-address">Ví đang xem: {wallet}</p>}
    <button className="button button-dark" onClick={() => void load(0)} disabled={loading || !walletAddress}>
      {loading ? "Đang tải vé…" : error ? "Thử tải lại" : tokenId ? "Xác minh quyền sở hữu" : "Tải vé của tôi"}
    </button>
    {loading && tickets.length === 0 && <p className="seed-note" role="status">Đang tải metadata và đối chiếu quyền sở hữu trên Fuji…</p>}
    {visibleNotice && <p className={`notice ${visibleNotice.tone === "warning" ? "warning" : ""}`} role="status">{visibleNotice.text}</p>}
    {error && <p className="notice warning" role="alert">{error}</p>}
    {!loading && !error && tickets.length === 0 && emptyOnChain && rpcState === "available" && <div><h2>Chưa có vé</h2><p>Fuji xác nhận ví này hiện chưa sở hữu vé NFT.</p></div>}
    {!loading && !error && tickets.length === 0 && metadataState === "loading" && <p className="seed-note">Nhấn “Tải vé của tôi” để kiểm tra vé trên Fuji.</p>}
    {tickets.map(item => <article className="owned-ticket" key={item.tokenId} data-ownership={item.ownership}>
      <div>
        <p className="eyebrow">{item.ownership === "verified" ? `UNI PASS · NFT ĐÃ XÁC MINH #${item.tokenId}` : `UNI PASS · VÉ ĐÃ LƯU #${item.tokenId}`}</p>
        <h2>{item.title}</h2>
        <p>Event ID {item.eventId || "—"} · {item.ownership === "verified" ? item.checkedIn === null ? "Trạng thái check-in chưa tải được" : item.checkedIn ? "Đã check-in" : "Chưa check-in" : "Chưa xác minh quyền sở hữu"}</p>
        <p>{item.ownership === "verified" ? "Quyền sở hữu đã xác nhận trực tiếp trên Fuji." : "Metadata vé đã lưu; quyền sở hữu hiện tại chưa được xác nhận."}</p>
        {item.location && <p>{item.location}</p>}
      </div>
      <Link className="button button-light" href={`/tickets/${item.tokenId}`}>Mở vé</Link>
    </article>)}
    {hasMore && <button className="button button-light" type="button" disabled={loading} onClick={() => void load(offset + PAGE_SIZE, true)}>{loading ? "Đang tải vé…" : "Tải thêm vé"}</button>}
    {tokenId && <p className="seed-note">Thông tin đã lưu không xác nhận quyền sở hữu. Các thao tác vé chỉ khả dụng sau khi Fuji xác minh ví đang xem.</p>}
  </div>;
}
