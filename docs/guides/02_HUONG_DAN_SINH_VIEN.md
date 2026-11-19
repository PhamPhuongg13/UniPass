# 02 · Hướng dẫn sinh viên

## Khám phá

1. Vào `/discover`, dùng ô tìm kiếm/bộ lọc và mở trang sự kiện.
2. Kiểm tra thời gian, địa điểm, hạn đăng ký và sức chứa.
3. Kết nối ví Fuji 43113 để xem ticket của ví hoặc bắt đầu flow xác minh.

## Đăng ký và vé

Nút đăng ký đang **tạm khóa** cho đến khi zkEmail proof được xác minh và contract Fuji thực thi eligibility. Không gọi `registerEvent` trực tiếp trong Remix: contract V1 hiện cho phép gọi trực tiếp và thao tác đó bỏ qua chính sách sinh viên của UniPass.

Trong **Vé của tôi**, cached metadata có thể hiện khi indexer đang đồng bộ. Chỉ trạng thái ownership đã xác minh sau lần đọc trực tiếp `ownerOf` trên Fuji mới xác nhận ví hiện tại đang sở hữu NFT.

## Email sinh viên

`/verify-student` có hướng dẫn challenge và chọn file `.eml` cục bộ. Challenge hiện được gắn với phiên ví ở backend, nhưng proof v2 chưa thể tạo vì artifact Noir bị thiếu (GCS HTTP 404). Trang không xác nhận sinh viên. Không tải fixture email riêng lên nơi công khai.

QR/ticket check-in đã có thành phần trong ứng dụng, nhưng full registration → mint → QR scan chưa được kiểm thử giao dịch thật trên Fuji. Không coi demo UI là xác nhận tham dự.
