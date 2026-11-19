# 06 · zkEmail và file .eml

**ĐANG CHỜ PROOF:** UniPass hiện chưa có luồng upload `.eml` hoạt động, circuit/proof generator hoàn chỉnh hoặc verifier được deploy. Không tải dữ liệu email thật lên trang thử nghiệm và không xem domain `@vnu.edu.vn` là bằng chứng đã xác minh.

Khi một sản phẩm có hỗ trợ, chỉ dùng thư gốc dạng `.eml` tải từ mục “Show original/Download original” của nhà cung cấp email; bản forward, ảnh chụp hay PDF không tương đương. DKIM chứng minh thư được ký bởi domain phù hợp, không tự chứng minh người upload đang kiểm soát mailbox.

Thiết kế an toàn còn cần challenge mới gắn wallet/ngữ cảnh/hạn dùng, sender policy, kiểm tra proof, chống replay và giảm thiểu dữ liệu. Chờ hướng dẫn triển khai chính thức trước khi gửi email gốc.
