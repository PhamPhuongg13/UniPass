# 09 · Kịch bản demo trung thực (5–7 phút)

## Trước demo

- Xác nhận PostgreSQL up, Prisma migrations up to date, app chạy ở `http://localhost:3000`, ticket indexer có checkpoint.
- Dùng test wallet và dữ liệu/test event không chứa dữ liệu cá nhân. Không dùng tài khoản hoặc ticket của sinh viên thật trên màn hình chiếu.
- Nếu demo tạo event hoặc check-in giao dịch, cần owner cho phép trước, test wallet có Fuji test AVAX, contract/metadata đã kiểm tra và người trình bày xác nhận đúng giao dịch. Không phát sinh giao dịch mới trong QA mặc định.
- Giữ `STUDENT_REGISTRATION_ISSUER_ENABLED=false`; không gọi đăng ký trực tiếp bằng Remix.

## Kịch bản

1. **Khám phá (1 phút):** home → `/discover` → tìm/lọc → mở event. Nêu rõ trang công khai chỉ hiển thị event đã liên kết theo policy ứng dụng.
2. **Ví (1 phút):** kết nối test wallet Fuji. Minh họa ký challenge đăng nhập; đây là signature auth, không phải student proof.
3. **Vé (1 phút):** mở `/my-events` (Vé của tôi). Phân biệt metadata cache, trạng thái indexer/RPC và ownership; chỉ kết luận ownership sau lần đọc `ownerOf` Fuji thành công.
4. **Student verification (1 phút):** mở `/verify-student`; giải thích challenge/session flow và `.eml` local. Nêu blocker cụ thể: v2 circuit JSON object trả HTTP 404, nên chưa có proof/verifyProof; màn hình không cấp student status.
5. **Organizer (1–2 phút):** xem dashboard hoặc sample event `/organizer/events/demo`. Có thể trình diễn nhập form/metadata nếu DB test setup sẵn. Publish/createEvent transaction, ticket registration/mint, QR scan/check-in chỉ trình diễn khi đã có explicit approval và test wallet; nếu không, trình bày là chưa xác nhận live.
6. **Kết thúc:** tóm tắt các bước đã chạy bằng evidence report; không gọi UI mock là blockchain success.

## Kết quả được phép tuyên bố

Unit/typecheck/build/Playwright dùng evidence trong [`../QA_REPORT.md`](../QA_REPORT.md). Playwright wallet là test EIP-1193 provider với ephemeral key, không phải MetaMask extension. Không có giao dịch Fuji mới, real student proof, hay end-to-end live check-in được xác nhận trong lần QA này.
