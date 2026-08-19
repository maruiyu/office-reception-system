"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSocket, registerStaff } from "@/lib/socket";
import { WebRTCManager } from "@/lib/webrtc";
import { consumePendingCallUrl } from "@/lib/pendingCall";

// 通話状態: standby=スタッフが着信待ち（まだ何も来ていない） / incoming=着信中・呼び出し中 / active=通話中 / success=解錠完了
type CallState = "standby" | "incoming" | "active" | "success";

// useSearchParams() はSuspenseでラップする必要があるため内部コンポーネントに分離
function CallScreenInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // role: "staff" = 担当者が着信を受ける画面 / 省略時 = 来訪者が呼び出す画面
  const role = searchParams.get("role") === "staff" ? "staff" : "visitor";
  const callType = searchParams.get("type");   // "department" | "staff" | "code"
  const staffName = searchParams.get("staffName") || "";
  const departmentName = searchParams.get("departmentName") || "";
  const staffId = searchParams.get("staffId") || "";
  const departmentId = searchParams.get("departmentId") || "";
  const codeId = searchParams.get("codeId") || "";

  // スタッフが手動スタンバイ（visitorSocketIdなし）で開いた場合だけ standby から開始する
  const [callState, setCallState] = useState<CallState>(
    role === "staff" && !searchParams.get("visitorSocketId") ? "standby" : "incoming"
  );
  const [callDuration, setCallDuration] = useState(0);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [connectionState, setConnectionState] = useState<string>("connecting");
  // 担当者が応答せず管理者へエスカレーションされたか（来訪者側の表示切り替え用）
  const [isEscalated, setIsEscalated] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const webrtcRef = useRef<WebRTCManager | null>(null);
  // プッシュ通知経由で開いた場合はURLに来訪者のSocketIDが直接乗っている。
  // スタンバイ中に着信した場合は call:incoming イベントで受け取る
  const visitorSocketIdRef = useRef<string | null>(searchParams.get("visitorSocketId"));
  // 通話相手（来訪者⇔スタッフ）のSocketID。call:end で相手に終了を伝えるために保持する
  const remoteSocketIdRef = useRef<string | null>(null);
  // 開発モードのReact Strict Modeでeffectが2回走っても呼び出し開始emitを1回だけにするためのガード
  const callStartedRef = useRef(false);

  // 通話時間カウンター
  useEffect(() => {
    if (callState === "active") {
      timerRef.current = setInterval(() => setCallDuration((p) => p + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callState]);

  // Socket.io + WebRTC の初期化
  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    const webrtc = new WebRTCManager(socket);
    webrtcRef.current = webrtc;

    // 相手の映像を受け取ったらvideoタグに表示
    webrtc.onRemoteStream = (stream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    };

    webrtc.onConnectionStateChange = (state) => {
      setConnectionState(state);
    };

    // カメラ/マイクを取得してローカルプレビューに表示
    // スタッフ側はマイクのみでよいため、映像が必要なのは来訪者側のみ
    async function setupLocalMedia() {
      try {
        const stream = await webrtc.getLocalStream(role !== "staff");
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        // console.error だと Next.js の開発オーバーレイが出て操作の邪魔になるため warn にする
        console.warn("カメラ取得エラー（カメラ非搭載の端末では想定内):", err);
      }
    }

    if (role === "staff") {
      // スタッフ側: 着信を待つ
      setupLocalMedia();

      // /staffが通知経由の行き先情報を読み切れずに残っていた場合に備え、
      // /callに到達した時点で確実に消去しておく（通話終了後の/staffへの誤再転送を防ぐ）
      consumePendingCallUrl();

      if (visitorSocketIdRef.current) {
        // プッシュ通知から開いた場合は既に着信情報が分かっているのですぐ着信中にする
        setCallState("incoming");
      } else if (staffId) {
        // スタッフポータルからの手動スタンバイ（Socket接続を維持して着信を待つ）
        registerStaff(staffId, departmentId);
      }

      socket.on("call:incoming", ({ visitorSocketId }: { visitorSocketId: string }) => {
        visitorSocketIdRef.current = visitorSocketId;
        setCallState("incoming");
      });
    } else {
      // 来訪者側: 呼び出し開始処理
      async function startVisitorCall() {
        await setupLocalMedia();

        if (callStartedRef.current) return;
        callStartedRef.current = true;

        if (callType === "code" || callType === "staff") {
          socket.emit("visitor:call-by-code", { staffId });
        } else if (callType === "department") {
          socket.emit("visitor:call-by-department", { departmentId });
        }
      }
      startVisitorCall();
    }

    // スタッフが応答したとき（来訪者画面側）
    socket.on("call:answered", async ({ staffSocketId }: { staffSocketId: string }) => {
      remoteSocketIdRef.current = staffSocketId;
      setCallState("active");
      // 受付番号を使用済みにする
      if (codeId) {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
        fetch(`${backendUrl}/api/codes/${codeId}/use`, { method: "PATCH" }).catch(() => {});
      }
      await webrtc.startCall(staffSocketId);
    });

    // 通話が終了したとき（相手側から切断）
    socket.on("call:ended", () => {
      router.push(role === "staff" ? "/staff" : "/");
    });

    // 担当者が応答せず管理者へエスカレーションされたとき（来訪者側）
    socket.on("call:escalated", () => {
      setIsEscalated(true);
    });

    return () => {
      socket.off("call:incoming");
      socket.off("call:answered");
      socket.off("call:ended");
      socket.off("call:escalated");
      // WebRTCManagerのコンストラクタで登録されたシグナリング用リスナーも解除する。
      // ソケットはページをまたいで使い回すシングルトンなので、ここで消さないと
      // 次の通話でも古いリスナーが残ったまま二重に反応してしまう
      socket.off("webrtc:offer");
      socket.off("webrtc:answer");
      socket.off("webrtc:ice-candidate");
      webrtc.cleanup();
    };
  }, [role, callType, staffId, departmentId, codeId, router]);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // スタッフが応答ボタンを押したとき
  const handleAnswer = useCallback(() => {
    const visitorSocketId = visitorSocketIdRef.current;
    if (!visitorSocketId) return;
    remoteSocketIdRef.current = visitorSocketId;
    const socket = getSocket();
    socket.emit("staff:answer", { visitorSocketId });
    setCallState("active");
    navigator.clearAppBadge?.().catch(() => {});
  }, []);

  // 解錠ボタン
  const handleUnlock = useCallback(async () => {
    setIsUnlocking(true);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
      const res = await fetch(`${backendUrl}/api/sesame/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (data.success) {
        setCallState("success");
      } else {
        alert("解錠に失敗しました。もう一度お試しください。");
      }
    } catch {
      alert("通信エラーが発生しました。");
    } finally {
      setIsUnlocking(false);
    }
  }, []);

  const handleEndCall = useCallback(() => {
    webrtcRef.current?.cleanup();
    const socket = getSocket();
    if (remoteSocketIdRef.current) {
      socket.emit("call:end", { targetSocketId: remoteSocketIdRef.current });
    }
    navigator.clearAppBadge?.().catch(() => {});
    // 通話中に届いた再送通知が保存した行き先情報が残っていると、/staffに戻った際に
    // また/callへ引き戻されてしまうため、ここで確実に消しておく
    consumePendingCallUrl();
    router.push(role === "staff" ? "/staff" : "/");
  }, [router, role]);

  const callerLabel = callType === "department"
    ? `${departmentName}（部署宛）`
    : staffName || "来訪者";

  return (
    <div className="bg-black min-h-screen flex flex-col items-center justify-center overflow-hidden relative">

      {/* 開発用バッジ */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-yellow-400 text-black px-4 py-1 rounded-full text-xs font-bold shadow-lg">
        {role === "staff" ? "社内スタッフ端末：応答・解錠画面" : "来訪者端末：呼び出し画面"}
      </div>

      {/* 相手のビデオ映像（フルスクリーン背景） */}
      <div className="absolute inset-0 z-0">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover transition-all duration-1000 ${
            callState === "active" ? "opacity-100" : "grayscale opacity-30"
          }`}
        />
        {/* 映像が届く前のプレースホルダー */}
        {(callState === "standby" || callState === "incoming") && (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-64 w-64 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="absolute bottom-1/2 translate-y-24 text-gray-400 text-xl font-medium tracking-widest">
              {callState === "standby" ? "STANDBY..." : "CALLING..."}
            </p>
          </div>
        )}
      </div>

      {/* 自分のビデオ（ピクチャーインピクチャー）。スタッフ側は映像を送らないため来訪者側のみ表示。
          呼び出し中から見えるようにして、応答される前に映り方を確認できるようにする */}
      {(callState === "active" || callState === "incoming") && role !== "staff" && (
        <div className="absolute bottom-24 right-4 w-28 h-20 sm:bottom-32 sm:right-8 sm:w-48 sm:h-36 z-20 rounded-2xl overflow-hidden border-2 border-white/30 shadow-2xl">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />
        </div>
      )}

      {/* UIオーバーレイ */}
      <div className="relative z-10 w-full h-screen flex flex-col justify-between p-4 sm:p-8 lg:p-12">

        {/* 上部: 接続ステータス + 閉じるボタン */}
        <div className="flex justify-between items-start">
          <div className="bg-black/50 backdrop-blur-md border border-white/20 rounded-full px-4 py-2 sm:px-6 sm:py-3 flex items-center space-x-2 sm:space-x-3 shadow-xl">
            <div className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full animate-pulse ${callState === "active" ? "bg-red-500" : "bg-yellow-500"}`} />
            <span className="text-white font-bold tracking-widest text-xs sm:text-sm uppercase">
              {callState === "standby"
                ? "Standing by..."
                : callState === "incoming"
                  ? "Waiting for response..."
                  : `REC / ${formatDuration(callDuration)}`}
            </span>
          </div>
          <button onClick={handleEndCall} className="bg-gray-800/80 hover:bg-gray-700 text-white p-3 sm:p-4 rounded-full transition-all shadow-xl group">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 sm:h-8 sm:w-8 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 中部: 来訪者情報カード */}
        <div className="mb-6 sm:mb-8 lg:mb-12">
          <div className="bg-black/40 backdrop-blur-md border-l-4 sm:border-l-8 border-blue-500 p-4 sm:p-6 lg:p-8 rounded-r-3xl inline-block max-w-2xl shadow-2xl transition-all">
            <h2 className="text-xs sm:text-sm text-blue-400 font-bold tracking-widest uppercase mb-2">
              {callState === "standby" ? "着信待ち" : "エントランス着信"}
            </h2>
            <div className="text-white">
              <p className="text-2xl sm:text-3xl lg:text-5xl font-black mb-1">
                {callState === "standby" ? "着信をお待ちください" : "来訪者があります"}
              </p>
              {callState !== "standby" && (
                <p className="text-sm sm:text-base lg:text-xl text-gray-400 mt-2">
                  {role === "staff"
                    ? callState === "incoming"
                      ? "応答すると通話を開始します"
                      : "来訪者とビデオ通話が繋がっています"
                    : callState === "incoming"
                      ? isEscalated
                        ? "応答がないため管理者に転送しています..."
                        : `${callerLabel} 宛に呼び出しています...`
                      : `${callerLabel} とビデオ通話が繋がっています`}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 下部: 通話コントロール */}
        <div className="pb-6 sm:pb-8 lg:pb-12 h-40 sm:h-44 lg:h-48 flex items-center justify-center">

          {/* スタンバイ中: スタッフがまだ何も着信していない状態 */}
          {callState === "standby" && (
            <div className="flex flex-col items-center space-y-4">
              <div className="w-3 h-3 rounded-full bg-gray-500 animate-pulse" />
              <span className="text-gray-400 font-medium tracking-widest">着信を待っています...</span>
            </div>
          )}

          {/* 着信中: スタッフ側は応答ボタン、来訪者側は呼び出し中の表示のみ */}
          {callState === "incoming" && role === "staff" && (
            <div className="flex flex-col items-center space-y-4 sm:space-y-6">
              <button onClick={handleAnswer} className="group">
                <div className="flex flex-col items-center space-y-2 sm:space-y-4">
                  <div className="w-20 h-20 sm:w-28 sm:h-28 lg:w-32 lg:h-32 rounded-full flex items-center justify-center shadow-2xl group-hover:brightness-110 group-active:scale-95 transition-all ring-animation" style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 sm:h-12 sm:w-12 lg:h-16 lg:w-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <span className="text-white font-bold text-xl sm:text-2xl lg:text-3xl drop-shadow-lg tracking-widest animate-pulse">応　答</span>
                </div>
              </button>
              <div className="flex items-center space-x-4 sm:space-x-8">
                <button onClick={handleEndCall} className="text-gray-400 hover:text-white font-bold tracking-widest px-4 py-2 sm:px-6 border border-gray-600 rounded-full hover:bg-gray-800 transition-all text-sm sm:text-base">
                  拒否する
                </button>
                <button className="text-gray-400 hover:text-white font-bold tracking-widest px-4 py-2 sm:px-6 border border-gray-600 rounded-full hover:bg-gray-800 transition-all text-sm sm:text-base">
                  保留
                </button>
              </div>
            </div>
          )}

          {callState === "incoming" && role === "visitor" && (
            <div className="flex flex-col items-center space-y-4 sm:space-y-6">
              <div className="flex flex-col items-center space-y-2 sm:space-y-4">
                <div className="w-20 h-20 sm:w-28 sm:h-28 lg:w-32 lg:h-32 rounded-full flex items-center justify-center shadow-2xl animate-pulse" style={{ background: "linear-gradient(135deg, #374151 0%, #1f2937 100%)" }}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-9 w-9 sm:h-11 sm:w-11 lg:h-14 lg:w-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <span className="text-white font-bold text-lg sm:text-xl lg:text-2xl drop-shadow-lg tracking-widest">呼び出し中...</span>
              </div>
              <button onClick={handleEndCall} className="text-gray-400 hover:text-white font-bold tracking-widest px-4 py-2 sm:px-6 border border-gray-600 rounded-full hover:bg-gray-800 transition-all text-sm sm:text-base">
                呼び出しをやめる
              </button>
            </div>
          )}

          {/* 通話中 */}
          {callState === "active" && (
            <div className="flex justify-center items-center space-x-6 sm:space-x-8 lg:space-x-12">
              <button onClick={handleEndCall} className="group">
                <div className="flex flex-col items-center space-y-2 sm:space-y-4">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 bg-red-600 rounded-full flex items-center justify-center shadow-2xl group-hover:bg-red-700 group-active:scale-90 transition-all border-4 border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 text-white transform rotate-135" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                    </svg>
                  </div>
                  <span className="text-white font-bold text-sm sm:text-base lg:text-lg drop-shadow-lg tracking-wider">拒否 / 終了</span>
                </div>
              </button>
              {/* 解錠はスタッフのみ操作可能（来訪者が自分で解錠できないようにする） */}
              {role === "staff" && (
              <button onClick={handleUnlock} disabled={isUnlocking} className="group">
                <div className="flex flex-col items-center space-y-2 sm:space-y-4">
                  <div
                    className={`w-20 h-20 sm:w-28 sm:h-28 lg:w-32 lg:h-32 rounded-full flex items-center justify-center shadow-2xl group-hover:brightness-125 group-active:scale-95 transition-all outline outline-offset-4 sm:outline-offset-8 outline-white/20 border-4 border-white/20 ${isUnlocking ? "opacity-60 cursor-not-allowed" : ""}`}
                    style={{ background: "linear-gradient(135deg, #1e40af 0%, #1a365d 100%)" }}
                  >
                    {isUnlocking ? (
                      <svg className="animate-spin h-10 w-10 sm:h-12 sm:w-12 lg:h-16 lg:w-16 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 sm:h-12 sm:w-12 lg:h-16 lg:w-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                  <span className="text-white font-bold text-lg sm:text-xl lg:text-2xl drop-shadow-lg tracking-widest mt-2">
                    {isUnlocking ? "解錠中..." : "解　錠"}
                  </span>
                </div>
              </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 解錠成功オーバーレイ */}
      {callState === "success" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center text-white p-6" style={{ backgroundColor: "rgba(26, 54, 93, 0.92)" }}>
          <div className="w-20 h-20 sm:w-28 sm:h-28 lg:w-32 lg:h-32 bg-white rounded-full flex items-center justify-center mb-6 sm:mb-8 animate-bounce">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 sm:h-16 sm:w-16 lg:h-20 lg:w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "#1a365d" }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 tracking-tighter text-center">解錠完了</h1>
          <p className="text-lg sm:text-xl lg:text-2xl text-blue-200 text-center">電気錠をオープンしました</p>
          <button
            onClick={() => router.push(role === "staff" ? "/staff" : "/")}
            className="mt-8 sm:mt-10 lg:mt-12 px-8 sm:px-10 py-3 sm:py-4 border-2 border-white rounded-full text-base sm:text-lg lg:text-xl hover:bg-white hover:text-[#1a365d] transition-all font-bold text-white"
          >
            メイン画面に戻る
          </button>
        </div>
      )}
    </div>
  );
}

export default function CallScreen() {
  return (
    <Suspense fallback={
      <div className="bg-black min-h-screen flex items-center justify-center">
        <div className="text-white text-2xl tracking-widest animate-pulse">接続中...</div>
      </div>
    }>
      <CallScreenInner />
    </Suspense>
  );
}
