export const schools: Record<string, { short: string; name: string }> = {
  "vnu.edu.vn": { short: "VNU", name: "Đại học Quốc gia Hà Nội" },
  "hcmut.edu.vn": { short: "HCMUT", name: "Trường Đại học Bách khoa, Đại học Quốc gia Thành phố Hồ Chí Minh" },
  "hcmus.edu.vn": { short: "HCMUS", name: "Trường Đại học Khoa học Tự nhiên, Đại học Quốc gia Thành phố Hồ Chí Minh" },
  "uit.edu.vn": { short: "UIT", name: "Trường Đại học Công nghệ Thông tin, Đại học Quốc gia Thành phố Hồ Chí Minh" },
  "hcmussh.edu.vn": { short: "HCMUSSH", name: "Trường Đại học Khoa học Xã hội và Nhân văn, Đại học Quốc gia Thành phố Hồ Chí Minh" },
  "uel.edu.vn": { short: "UEL", name: "Trường Đại học Kinh tế - Luật, Đại học Quốc gia Thành phố Hồ Chí Minh" },
  "hcmiu.edu.vn": { short: "IU", name: "Trường Đại học Quốc tế, Đại học Quốc gia Thành phố Hồ Chí Minh" },
  "ueh.edu.vn": { short: "UEH", name: "Đại học Kinh tế Thành phố Hồ Chí Minh" },
  "fpt.edu.vn": { short: "FPT", name: "Trường Đại học FPT" },
  "hust.edu.vn": { short: "HUST", name: "Đại học Bách khoa Hà Nội" },
  "neu.edu.vn": { short: "NEU", name: "Đại học Kinh tế Quốc dân" },
  "ftu.edu.vn": { short: "FTU", name: "Trường Đại học Ngoại thương" },
};
export function schoolLabel(domain: string): string {
  const parts = domain.trim().toLowerCase().split(".");
  for (let i = 0; i < parts.length; i++) {
    const match = schools[parts.slice(i).join(".")];
    if (match) return match.short;
  }
  return domain;
}
export function eligibilityLabel(eligibility: string, domains: readonly string[] = []): string {
  if (eligibility === "OPEN") return "Open to everyone";
  if (eligibility === "STUDENT") return "Verified students";
  return `Students: ${domains.slice(0, 2).map(schoolLabel).join(", ")}${domains.length > 2 ? "…" : ""}`;
}
