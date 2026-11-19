# 05 · Kết nối Remix với UniPass

1. Trong Remix chọn Avalanche Fuji (43113) và account triển khai đúng.
2. Mở contract đã deploy, sao chép **Deployed At** address và ABI từ compilation artifact. Không gửi private key.
3. Kiểm tra bytecode tồn tại và đọc `EventManager.ticketContract()`; giá trị phải bằng Ticket address. Ticket `registrationContract()` cũng cần trỏ đúng EventManager nếu ABI hỗ trợ.
4. Cập nhật addresses/ABI trong cấu hình dự án theo quy trình nhóm; chạy read-only smoke tests.
5. Lấy **block của giao dịch deploy Ticket**, không dùng block `setTicketContract`. Cấu hình block đó riêng tư làm `TICKET_DEPLOYMENT_BLOCK`, chạy migration và indexer.
6. Dùng ví test để tạo/đăng ký/check-in chỉ khi chủ dự án chủ động cho phép giao dịch.

Nếu ABI khác, dừng thao tác và đối chiếu method/event. UniPass không tự sửa Solidity. Student gate cần contract verifier được chủ dự án thiết kế, kiểm thử, deploy; chưa có trong MVP.
