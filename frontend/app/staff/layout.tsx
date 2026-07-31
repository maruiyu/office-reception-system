import type { Metadata } from "next";

// /staffはスタッフがホーム画面に追加して使うため、専用マニフェストで
// start_urlを"/staff"にする（受付トップ用のmanifest.jsonのままだと
// ホーム画面アイコンから開いた時に来訪者用トップ画面が開いてしまうため）
export const metadata: Metadata = {
  title: "スタッフポータル | オフィス受付",
  manifest: "/staff-manifest.json",
};

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return children;
}
