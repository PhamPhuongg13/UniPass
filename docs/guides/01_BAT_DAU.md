# 01 · Bắt đầu với UniPass

UniPass giúp khám phá hoạt động sinh viên và tạo vé NFT thử nghiệm trên Avalanche Fuji. Giao diện có thể duyệt công khai; ví cần thiết cho đăng ký và khu vực cá nhân. MVP chưa chứng minh tư cách sinh viên bằng zkEmail.

## Chuẩn bị

- Trình duyệt desktop Chromium và MetaMask tương thích EIP-1193.
- Chọn Avalanche Fuji, chain ID **43113**, dùng RPC trong cấu hình được nhóm vận hành cung cấp. Ví cần test AVAX để trả gas.
- Chỉ dùng ví test; không nhập seed phrase/private key vào UniPass.

## Luồng chính

1. Mở `/discover`, lọc sự kiện rồi chọn thẻ để xem chi tiết.
2. Kết nối ví trên thanh điều hướng. Đọc domain và nội dung ký trước khi xác nhận.
3. Sinh viên đăng ký trên trang sự kiện; MetaMask sẽ hỏi giao dịch nếu hợp đồng đang kết nối.
4. Vé đã index xem tại `/my-events`; trang cần đồng bộ DB và index chain.
5. Ban tổ chức mở `/organizer` để quản lý sự kiện của ví mình.

Menu gồm Khám phá, Vé của tôi và Ban tổ chức. Nếu thấy “chưa xác minh”, đó là trạng thái thật của MVP.
