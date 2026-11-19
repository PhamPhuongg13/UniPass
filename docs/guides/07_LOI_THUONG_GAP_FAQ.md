# 07 · FAQ và xử lý lỗi

- **MetaMask không mở:** cài/ mở extension, reload trang; không nhập seed phrase vào website.
- **Sai network:** chuyển sang Avalanche Fuji, chain ID 43113. Nếu MetaMask hỏi thêm mạng, xác minh cấu hình từ nhóm vận hành.
- **Không đủ gas:** nạp test AVAX từ faucet được nhóm chỉ định; không dùng tiền thật.
- **Từ chối ký/giao dịch:** không có giao dịch được xác nhận; đọc thông tin trước khi thử lại.
- **Giao dịch pending:** kiểm tra MetaMask/explorer trước khi gửi lại để tránh giao dịch trùng.
- **Sự kiện đầy/hết hạn/đã đăng ký:** contract quyết định; liên hệ ban tổ chức.
- **zkEmail:** proof chưa khả dụng; tài khoản không được xác minh là sinh viên.
- **Không thấy vé:** tải lại sau khi DB index cập nhật; index lịch sử cần block deploy chính xác. Trạng thái chưa xác minh cho biết Fuji RPC chưa phản hồi.
- **RPC limit/429:** chờ một lúc rồi thử lại; không bấm liên tục. Worker có checkpoint và giới hạn batch 90 block.
- **QR đã dùng:** tính năng QR chưa có trong MVP; check-in hiện do ban tổ chức thao tác on-chain.
- **Server/DB offline:** dừng thao tác phụ thuộc DB và báo vận hành; không xóa dữ liệu/migration thủ công.
