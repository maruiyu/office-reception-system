import type { Metadata } from "next";
import AdminShell from "./AdminShell";

// /adminはPCブラウザだけでなく共有タブレットのホーム画面にも追加して使うため、
// 専用マニフェストでstart_urlを"/admin"にする（受付トップ用のmanifest.jsonのままだと
// ホーム画面アイコンから開いた時に来訪者用トップ画面が開いてしまうため）
export const metadata: Metadata = {
  title: "管理画面 | オフィス受付",
  manifest: "/admin-manifest.json",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
