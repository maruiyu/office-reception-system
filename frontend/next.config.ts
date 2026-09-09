import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // 開発中、同じWi-Fi内のスマホ実機（LAN IP経由）からアクセスするために許可する。
  // PCのIPアドレスが変わったら、ここも合わせて更新が必要
  allowedDevOrigins: ["192.168.0.126", "guitar-manga-metro-escape.trycloudflare.com", "appreciation-live-plants-brochures.trycloudflare.com"],
};

export default nextConfig;
