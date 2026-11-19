# 03 · Hướng dẫn ban tổ chức

1. Kết nối và ký đăng nhập bằng ví organizer. Dashboard chỉ liệt kê sự kiện do ví này tạo.
2. Tạo metadata sự kiện; kiểm tra tên, mô tả, thời gian/múi giờ, địa điểm, sức chứa và hạn đăng ký.
3. Metadata mới ở trạng thái chưa công khai. Nếu bạn được phép tạo sự kiện test, nút publish gửi `createEvent` lên Fuji; kiểm tra đúng chain 43113, ví gửi và thông tin giao dịch trong MetaMask rồi chờ receipt.
4. Event chỉ được đánh dấu đã sync khi server xác minh receipt `EventCreated`, organizer, capacity và deadline. Nếu giao dịch pending/revert/RPC lỗi, không thử gửi giao dịch tạo mới ngay; dùng hash giao dịch cũ để đối chiếu trước.
5. Event đã gắn transaction/on-chain ID không thể xóa metadata qua API để tránh mất liên kết lịch sử. Chức năng hủy và archive chưa hoàn chỉnh.

## Check-in và nhân viên

Quy trình check-in cần event/ticket on-chain, ticket ownership hiện tại, challenge QR còn hạn và receipt check-in. Code có API chuẩn bị/xác minh credential, camera và manual fallback; nhưng full live flow chưa được kiểm thử trên Fuji. Chỉ organizer hiện được chấp nhận ở API check-in V1. Nhân viên V2 chưa được tích hợp xuyên suốt vào scanner và giao dịch; không cấp quyền bằng DB mirror hoặc coi UI staff là đủ.

Không tổ chức check-in thật dựa trên bản demo. Không phát hành QR công khai hoặc dùng token ID tĩnh làm bằng chứng sở hữu.
