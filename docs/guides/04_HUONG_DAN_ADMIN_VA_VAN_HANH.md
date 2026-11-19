# 04 · Admin và vận hành

## Môi trường cục bộ

1. Sao chép `.env.example` thành `.env` riêng trên máy; không commit file này.
2. Cấu hình PostgreSQL, `APP_ORIGIN`, `SESSION_SECRET`, Fuji RPC và địa chỉ hợp đồng đã đối chiếu. Migrations hiện có là additive; dùng `npm run db:generate`, `npm run db:migrate`, sau đó xác nhận `npx prisma migrate status`. Không reset database.
3. Chạy `npm run dev`. Dùng `npm run index:fuji:tickets` để cập nhật ticket index; cần database, Fuji RPC và deployment block đã xác minh. Worker dùng batches 90 block, tối đa 100 block mỗi query, giới hạn phạm vi mỗi lượt và reorg replay ngắn.
4. Production cần managed PostgreSQL, backups, secret rotation, monitoring, HTTPS, distributed rate limiting, RPC provider có quota và quy trình phục hồi.

## Feature gates / an toàn

- `STUDENT_REGISTRATION_ISSUER_ENABLED=false` phải giữ nguyên. Không có eligibility proof v2 vì artifact Noir bị thiếu; không cấp issuer signature.
- Không submit Fuji transaction trong QA. Chỉ dùng test wallet/funds sau khi owner chủ động cho phép.
- `NEXT_PUBLIC_EVENT_MANAGER_V2_ADDRESS` đang chưa cấu hình. Không xem staff assignment code/UI là authorization V2 đã live.
- TICKET index cache không chứng minh ownership; API ticket detail đọc `ownerOf` trực tiếp trên Fuji.
- Không log `.eml`, challenge, proof witness, session token, private key, mnemonic hoặc `DATABASE_URL`.
- `NTFY_TOPIC` chỉ cung cấp runtime khi được yêu cầu; không ghi topic vào repo hoặc report.

## Chạy kiểm tra

`npm run test:unit`, `npm run typecheck`, `npm run build`, `npm run test:e2e`. Playwright cần app và local PostgreSQL; nó dùng ví test, không dùng MetaMask thật hoặc Fuji write.
