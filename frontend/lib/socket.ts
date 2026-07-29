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

// 接続を切断（ページ離脱時に呼ぶ）
export function disconnectSocket() {
  if (socket?.connected) {
    socket.disconnect();
  }
}
