/**
 * WebRTC P2Pビデオ通話ユーティリティ
 * シグナリング（オファー/アンサー/ICE）はSocket.io経由で行う
 * 映像転送は Google STUNサーバー経由のP2P（無料・コスト0）
 */

import { Socket } from "socket.io-client";

// Google STUN サーバー（無料）
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export class WebRTCManager {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private socket: Socket;
  private remoteSocketId: string | null = null;
  // getUserMedia()の完了前にcleanup()が呼ばれた場合、後から取得できたマイクを
  // 誰にも止められないまま残さないようにするためのフラグ
  private isCleanedUp = false;

  // コールバック
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;

  constructor(socket: Socket) {
    this.socket = socket;
    this.setupSocketListeners();
  }

  private setupSocketListeners() {
    // 相手からオファーを受け取ったとき（スタッフ側）
    this.socket.on("webrtc:offer", async ({ fromSocketId, offer }: { fromSocketId: string; offer: RTCSessionDescriptionInit }) => {
      this.remoteSocketId = fromSocketId;
      await this.handleOffer(offer);
    });

    // 相手からアンサーを受け取ったとき（来訪者側）
    this.socket.on("webrtc:answer", async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
      if (this.pc) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    // ICE候補を受け取ったとき
    this.socket.on("webrtc:ice-candidate", async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      if (this.pc && candidate) {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });
  }

  private createPeerConnection() {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // ICE候補生成時にシグナリングサーバーへ送信
    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.remoteSocketId) {
        this.socket.emit("webrtc:ice-candidate", {
          targetSocketId: this.remoteSocketId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // 相手の映像ストリームを受け取ったとき
    this.pc.ontrack = (event) => {
      if (this.onRemoteStream && event.streams[0]) {
        this.onRemoteStream(event.streams[0]);
      }
    };

    // 接続状態の変化を通知
    this.pc.onconnectionstatechange = () => {
      if (this.onConnectionStateChange && this.pc) {
        this.onConnectionStateChange(this.pc.connectionState);
      }
    };

    return this.pc;
  }

  // カメラ/マイクのストリームを取得
  // withVideo=false の場合はマイクのみ取得する（スタッフ側は映像不要なため）
  async getLocalStream(withVideo: boolean = true): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: withVideo ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      audio: true,
    });

    // 取得完了を待っている間にcleanup()が先に呼ばれていた場合、
    // このストリームはもう使われないので即座に解放してマイクを掴んだままにしない
    if (this.isCleanedUp) {
      stream.getTracks().forEach((track) => track.stop());
      return stream;
    }

    this.localStream = stream;
    return stream;
  }

  // 通話を開始する（呼び出し側 = 来訪者側）
  async startCall(targetSocketId: string) {
    this.remoteSocketId = targetSocketId;
    const pc = this.createPeerConnection();

    // ローカルストリームをPeerConnectionに追加
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // オファーを作成して送信
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.socket.emit("webrtc:offer", {
      targetSocketId,
      offer: pc.localDescription,
    });
  }

  // オファーを受け取ってアンサーを返す（応答側 = スタッフ側）
  private async handleOffer(offer: RTCSessionDescriptionInit) {
    const pc = this.createPeerConnection();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.socket.emit("webrtc:answer", {
      targetSocketId: this.remoteSocketId,
      answer: pc.localDescription,
    });
  }

  // 通話を終了する
  cleanup() {
    this.isCleanedUp = true;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.pc?.close();
    this.pc = null;
    this.localStream = null;
    this.remoteSocketId = null;
  }
}
