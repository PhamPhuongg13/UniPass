export function EventRegisterButton(_props: { eventId: string; metadataId: string }) {
  return <div className="register-action">
    <button className="button button-dark disabled" type="button" disabled aria-describedby="registration-security-note">Đăng ký đang tạm khóa</button>
    <p className="notice warning" id="registration-security-note">Đăng ký vé sinh viên chỉ mở khi zkEmail v2 được khôi phục và contract Fuji kiểm tra eligibility. Hiện contract vẫn cho phép gọi registerEvent trực tiếp; UniPass không gửi giao dịch đăng ký từ giao diện.</p>
  </div>;
}
