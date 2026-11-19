const INDEXER_STATES = new Set(["ready", "syncing", "needs-deployment-block"]);
const RPC_STATES = new Set(["idle", "checking", "available", "partial", "unavailable"]);
const METADATA_STATES = new Set(["loading", "available", "empty", "unavailable", "fallback"]);
const OWNERSHIP_STATES = new Set(["verified", "unverified", "not-owned"]);

/** Pure state derivation keeps index freshness, RPC health, cached metadata and NFT ownership independent. */
export function deriveTicketPageState({
  loading = false,
  metadataState = "loading",
  indexStatus = null,
  indexStale = false,
  rpcState = "idle",
  ownershipStates = [],
}) {
  if (!METADATA_STATES.has(metadataState)) throw new TypeError("Invalid ticket metadata state.");
  if (!RPC_STATES.has(rpcState)) throw new TypeError("Invalid ticket RPC state.");
  if (indexStatus !== null && !INDEXER_STATES.has(indexStatus)) throw new TypeError("Invalid ticket indexer state.");
  if (!Array.isArray(ownershipStates) || ownershipStates.some(state => !OWNERSHIP_STATES.has(state))) throw new TypeError("Invalid ticket ownership state.");

  const indexerState = indexStatus === "needs-deployment-block"
    ? "needs-setup"
    : indexStatus === "syncing"
      ? "syncing"
      : indexStatus === "ready" && indexStale
        ? "stale"
        : indexStatus === "ready"
          ? "ready"
          : "unknown";
  const confirmed = ownershipStates.filter(state => state === "verified").length;
  const unverified = ownershipStates.filter(state => state === "unverified").length;
  const notOwned = ownershipStates.filter(state => state === "not-owned").length;
  const ownershipState = !ownershipStates.length
    ? "none"
    : confirmed === ownershipStates.length
      ? "verified"
      : confirmed > 0
        ? "mixed"
        : unverified > 0
          ? "unverified"
          : notOwned === ownershipStates.length
            ? "not-owned"
            : "unverified";

  let pageState;
  if (loading) pageState = "loading";
  else if (rpcState === "unavailable" || rpcState === "partial") pageState = "rpc-error";
  else if (["needs-setup", "syncing", "stale"].includes(indexerState)) pageState = "synchronizing";
  else if (["unverified", "mixed"].includes(ownershipState)) pageState = "unverified";
  else if (ownershipState === "verified") pageState = "verified";
  else if (metadataState === "unavailable") pageState = "metadata-unavailable";
  else if (metadataState === "empty" || ownershipState === "not-owned") pageState = "empty";
  else pageState = "idle";

  // Exactly one contextual notice may be displayed. RPC failure outranks indexer state,
  // because a stale index is not the cause of an unverified ownership result.
  let notice = null;
  if (rpcState === "unavailable") {
    notice = ownershipState === "verified"
      ? { tone: "warning", code: "rpc-unavailable-details", text: "RPC Fuji đang gián đoạn. Quyền sở hữu vé đã xác minh vẫn được giữ; thông tin trạng thái sự kiện có thể chưa cập nhật." }
      : { tone: "warning", code: "rpc-unavailable", text: "Chưa kết nối được RPC Fuji. Vé từ dữ liệu đã lưu chỉ để tham khảo; quyền sở hữu chưa được xác minh." };
  } else if (rpcState === "partial") {
    notice = ownershipState === "verified"
      ? { tone: "warning", code: "rpc-partial-verified", text: "Đã xác minh quyền sở hữu một số vé; RPC chưa tải đủ thông tin phụ." }
      : { tone: "warning", code: "rpc-partial", text: "RPC Fuji phản hồi chưa đầy đủ. Vé chưa có nhãn xác minh không chứng minh quyền sở hữu." };
  } else if (indexerState === "needs-setup") {
    notice = { tone: "info", code: "index-needs-setup", text: "Chưa cấu hình mốc block để đồng bộ lịch sử vé. Vé tìm thấy trên Fuji vẫn được xác minh riêng trên từng thẻ." };
  } else if (indexerState === "syncing" || indexerState === "stale") {
    notice = { tone: "info", code: "index-syncing", text: "Index vé đang đồng bộ hoặc cần cập nhật. Trạng thái sở hữu của từng vé được kiểm tra riêng trên Fuji." };
  } else if (ownershipState === "unverified" || ownershipState === "mixed") {
    notice = { tone: "warning", code: "ownership-unverified", text: "Một số vé chỉ có metadata đã lưu; chưa xác nhận được quyền sở hữu hiện tại trên Fuji." };
  } else if (metadataState === "unavailable") {
    notice = { tone: "warning", code: "metadata-unavailable", text: "Không tải được danh sách vé đã lưu. Vé tìm thấy trực tiếp trên Fuji sẽ hiển thị bên dưới." };
  }

  return { pageState, metadataState, indexerState, rpcState, ownershipState, notice };
}

export function canUseTicketOwnershipActions(ownershipState) {
  return ownershipState === "verified";
}
