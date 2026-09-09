/**
 * Socket.ioクライアント（シングルトン）
 * コンポーネント間で同じ接続を使い回す
 */

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    socket = io(backendUrl, {
      autoConnect: false, // 明示的に connect() を呼ぶまで接続しない
    });
  }
  return socket;
}

// スタッフとしてSocket.ioに登録（スタッフ用画面でのみ呼び出す）
export function registerStaff(staffId: string, departmentId: string) {
  const s = getSocket();
  if (!s.connected) s.connect();
  s.emit("staff:register", { staffId, departmentId });
}

// 共有端末（受付に置く応答用タブレットなど）としてSocket.ioに登録
// ログイン不要。部署・指名・担当者未指定の呼び出しをすべて保険として受け取る
export function registerFrontDesk() {
  const s = getSocket();
  if (!s.connected) s.connect();
  s.emit("frontdesk:register");
}

// 接続を切断（ページ離脱時に呼ぶ）
export function disconnectSocket() {
  if (socket?.connected) {
    socket.disconnect();
  }
}
