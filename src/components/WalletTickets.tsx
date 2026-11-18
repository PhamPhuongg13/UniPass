"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { eventManager, getFujiSigner, ticketContract, verifyContractLink } from "@/lib/contracts/chain";

type OwnedTicket = { tokenId: string; eventId: string; checkedIn: boolean; title: string; active: boolean };

export function WalletTickets({ tokenId }: { tokenId?: string }) {
  const [tickets, setTickets] = useState<OwnedTicket[]>([]);
  const [wallet, setWallet] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const { signer, address } = await getFujiSigner();
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionResponse.json();
      if (!session.wallet || session.wallet.toLowerCase() !== address.toLowerCase()) throw new Error("Đăng nhập bằng ví này để xem vé của bạn.");
      const manager = await verifyContractLink(signer);
      const ticket = ticketContract(signer);
      setWallet(address);
      if (tokenId) {
        const owner = String(await ticket.ownerOf(BigInt(tokenId)));
        if (owner.toLowerCase() !== address.toLowerCase()) throw new Error("Ví này không sở hữu vé đó.");
        const eventId = String(await ticket.eventOfTicket(BigInt(tokenId)));
        const [checkedIn, info] = await Promise.all([ticket.checkedIn(BigInt(tokenId)), manager.getFunction("getEvent")(BigInt(eventId))]);
        setTickets([{ tokenId, eventId, checkedIn: Boolean(checkedIn), title: `Sự kiện #${eventId}`, active: Boolean(info[5]) }]);
      } else {
        const head = await signer.provider!.getBlockNumber();
        const fromBlock = Math.max(0, head - 200_000);
        const logs = await ticket.queryFilter(ticket.filters.TicketMinted(null, null, address), fromBlock, head);
        const ids = [...new Set(logs.map(log => "args" in log ? String(log.args.tokenId) : "" ).filter(Boolean))];
        const results = await Promise.all(ids.map(async id => {
          try {
            const owner = String(await ticket.ownerOf(BigInt(id)));
            if (owner.toLowerCase() !== address.toLowerCase()) return null;
            const eventId = String(await ticket.eventOfTicket(BigInt(id)));
            const [checkedIn, info] = await Promise.all([ticket.checkedIn(BigInt(id)), manager.getFunction("getEvent")(BigInt(eventId))]);
            return { tokenId: id, eventId, checkedIn: Boolean(checkedIn), title: `Sự kiện #${eventId}`, active: Boolean(info[5]) };
          } catch { return null; }
        }));
        setTickets(results.filter((item): item is OwnedTicket => item !== null).reverse());
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tải vé từ Avalanche Fuji."); }
    finally { setLoading(false); setLoaded(true); }
  }

  useEffect(() => { setTickets([]); setWallet(""); setError(""); setLoaded(false); }, [tokenId]);

  return <div className="tool-panel ticket-list">
    {wallet&&<p className="seed-note">Ví: {wallet}</p>}
    <button className="button button-dark" onClick={load} disabled={loading}>{loading?"Đang xác minh trên Fuji…":tokenId?"Xác minh quyền sở hữu":"Tải vé của tôi"}</button>
    {error&&<p className="notice warning" role="alert">{error}</p>}
    {!loading&&loaded&&!error&&tickets.length===0&&<div><h2>Chưa tìm thấy vé</h2><p>Vé chỉ hiện sau khi giao dịch mint thành công trên Fuji. Danh sách rà soát log trong khoảng block gần đây.</p></div>}
    {tickets.map(item=><article className="owned-ticket" key={item.tokenId}><div><p className="eyebrow">UNI PASS · NFT TICKET #{item.tokenId}</p><h2>{item.title}</h2><p>Event ID {item.eventId} · {item.checkedIn?"Đã check-in":"Chưa check-in"}</p><p>{item.active?"Sự kiện đang mở":"Sự kiện đã đóng"}</p></div><Link className="button button-light" href={`/tickets/${item.tokenId}`}>Mở vé</Link></article>)}
    <p className="seed-note">Quyền sở hữu và check-in được đọc từ contract; dữ liệu sự kiện trên ứng dụng chỉ là metadata.</p>
  </div>;
}
