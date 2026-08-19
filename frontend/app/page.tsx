"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase, Department, Staff } from "@/lib/supabase";

// 部署にはアイコン種別を持たせていないため、順番に割り当てて見た目のバリエーションを出す
const ICON_TYPES = ["building", "money", "code", "people"] as const;

// 五十音インデックス
const SYLLABARY = ["あ", "か", "さ", "た", "な", "は", "ま", "や", "ら", "わ"];

// 各行に属するカタカナ文字（フリガナはカタカナ登録前提）。濁音・半濁音・小書き文字は清音の行にまとめる
const KANA_ROWS: Record<string, string[]> = {
  あ: ["ア", "イ", "ウ", "エ", "オ", "ァ", "ィ", "ゥ", "ェ", "ォ"],
  か: ["カ", "キ", "ク", "ケ", "コ", "ガ", "ギ", "グ", "ゲ", "ゴ"],
  さ: ["サ", "シ", "ス", "セ", "ソ", "ザ", "ジ", "ズ", "ゼ", "ゾ"],
  た: ["タ", "チ", "ツ", "テ", "ト", "ダ", "ヂ", "ヅ", "デ", "ド", "ッ"],
  な: ["ナ", "ニ", "ヌ", "ネ", "ノ"],
  は: ["ハ", "ヒ", "フ", "ヘ", "ホ", "バ", "ビ", "ブ", "ベ", "ボ", "パ", "ピ", "プ", "ペ", "ポ"],
  ま: ["マ", "ミ", "ム", "メ", "モ"],
  や: ["ヤ", "ユ", "ヨ", "ャ", "ュ", "ョ"],
  ら: ["ラ", "リ", "ル", "レ", "ロ"],
  わ: ["ワ", "ヲ", "ン", "ヮ"],
};

// 部署アイコンSVG
function DeptIcon({ type }: { type: string }) {
  if (type === "building") return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
  if (type === "money") return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
  if (type === "code") return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  );
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

export default function ReceptionHome() {
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState("");
  const [currentDate, setCurrentDate] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selectedSyllabary, setSelectedSyllabary] = useState<string | null>(null);
  const [receptionCode, setReceptionCode] = useState("");
  const [codeError, setCodeError] = useState("");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(true);

  // 部署・スタッフ一覧をSupabaseから取得（受付番号照合以外は読み取りのみなのでフロントから直接クエリ）
  useEffect(() => {
    async function loadDirectory() {
      const [{ data: depts }, { data: staff }] = await Promise.all([
        supabase.from("departments").select("id, name, created_at").order("name"),
        supabase
          .from("staff")
          .select("id, name, name_kana, department_id, department:department_id(id, name)")
          .order("name"),
      ]);
      setDepartments(depts || []);
      setStaffList((staff as unknown as Staff[]) || []);
      setLoadingDirectory(false);
    }
    loadDirectory();
  }, []);

  // リアルタイム時計
  useEffect(() => {
    function updateDateTime() {
      const now = new Date();
      const h = now.getHours().toString().padStart(2, "0");
      const m = now.getMinutes().toString().padStart(2, "0");
      setCurrentTime(`${h}:${m}`);
      setCurrentDate(
        now.toLocaleDateString("ja-JP", {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "long",
        })
      );
    }
    updateDateTime();
    const timer = setInterval(updateDateTime, 10000);
    return () => clearInterval(timer);
  }, []);

  // 部署呼び出し
  function handleDepartmentCall(deptId: string, deptName: string) {
    router.push(`/call?type=department&departmentId=${deptId}&departmentName=${encodeURIComponent(deptName)}`);
  }

  // スタッフ直接呼び出し
  function handleStaffCall(staffId: string, staffName: string) {
    router.push(`/call?type=staff&staffId=${staffId}&staffName=${encodeURIComponent(staffName)}`);
  }

  // 受付番号で呼び出し
  async function handleCodeSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!receptionCode.trim()) return;

    setCodeError("");
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
      const res = await fetch(`${backendUrl}/api/codes/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: receptionCode.trim() }),
      });
      const data = await res.json();

      if (!data.success) {
        setCodeError(data.message || "番号が無効です");
        return;
      }

      router.push(
        `/call?type=code&codeId=${data.codeId}&staffId=${data.staff.id}&staffName=${encodeURIComponent(data.staff.name)}`
      );
    } catch {
      setCodeError("通信エラーが発生しました。もう一度お試しください。");
    }
  }

  // スタッフ一覧フィルタリング（名前検索 + 五十音行の絞り込み）
  const filteredStaff = staffList.filter((s) => {
    const matchesSearch = searchText === "" || s.name.includes(searchText);
    const firstKana = s.name_kana?.trim().charAt(0);
    const matchesSyllabary =
      !selectedSyllabary || (!!firstKana && KANA_ROWS[selectedSyllabary]?.includes(firstKana));
    return matchesSearch && matchesSyllabary;
  });

  return (
    <div className="bg-gray-50 min-h-screen md:h-screen flex flex-col md:overflow-hidden">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 py-4 px-4 md:py-6 md:px-12 flex justify-between items-center shadow-sm">
        <div className="flex items-center space-x-2 md:space-x-4">
          <div
            className="w-9 h-9 md:w-12 md:h-12 rounded-lg flex items-center justify-center text-white font-bold text-base md:text-xl shadow-lg shrink-0"
            style={{ backgroundColor: "#1a365d" }}
          >
            R
          </div>
          <div>
            <h1 className="text-base md:text-2xl font-bold tracking-tight" style={{ color: "#1a365d" }}>
              Office Reception
            </h1>
            <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase tracking-widest">
              Visitor Terminal
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg md:text-3xl font-bold" style={{ color: "#1a365d" }}>{currentTime}</p>
          <p className="text-xs md:text-sm text-gray-500">{currentDate}</p>
        </div>
      </header>

      <main className="flex-grow flex flex-col md:flex-row p-4 gap-4 md:p-8 md:gap-8 md:min-h-0">
        {/* 左カラム: 部署呼び出し */}
        <section className="md:flex-1 bg-white rounded-3xl shadow-xl p-5 md:p-10 flex flex-col border border-gray-100 md:min-h-0">
          <div className="mb-4 md:mb-6 border-l-8 pl-4" style={{ borderColor: "#1a365d" }}>
            <h2 className="text-xl md:text-3xl font-bold" style={{ color: "#1a365d" }}>
              部署を呼び出す
            </h2>
            <p className="text-sm md:text-base text-gray-500 mt-1 md:mt-2">部署を指定して、常駐スタッフに繋ぎます</p>
          </div>

          <div className="grid grid-cols-2 gap-4 md:gap-6 md:flex-grow md:overflow-y-auto md:pr-2">
            {loadingDirectory ? (
              <p className="col-span-2 text-center text-gray-400 py-8">読み込み中...</p>
            ) : departments.length === 0 ? (
              <p className="col-span-2 text-center text-gray-400 py-8">部署が登録されていません</p>
            ) : (
              departments.map((dept, i) => (
                <button
                  key={dept.id}
                  onClick={() => handleDepartmentCall(dept.id, dept.name)}
                  className="group h-28 md:h-48 bg-white border-2 border-gray-100 rounded-2xl md:rounded-3xl flex flex-col items-center justify-center space-y-2 md:space-y-4 transition-all duration-300 shadow-sm hover:shadow-xl hover:border-[#1a365d] hover:bg-blue-50"
                >
                  <div className="w-10 h-10 md:w-20 md:h-20 bg-blue-50 text-[#1a365d] rounded-xl md:rounded-2xl flex items-center justify-center shadow-inner transition-all duration-300 group-hover:bg-[#1a365d] group-hover:text-white [&_svg]:h-5 [&_svg]:w-5 md:[&_svg]:h-10 md:[&_svg]:w-10">
                    <DeptIcon type={ICON_TYPES[i % ICON_TYPES.length]} />
                  </div>
                  <div className="text-center">
                    <span className="text-sm md:text-2xl font-bold block" style={{ color: "#1a365d" }}>
                      {dept.name}
                    </span>
                    <span className="hidden md:inline text-sm text-gray-400 font-medium">CALL UNIT</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* 右カラム: 担当者直接呼び出し */}
        <section className="md:flex-1 bg-white rounded-3xl shadow-xl p-5 md:p-10 flex flex-col border border-gray-100 md:min-h-0">
          <div className="mb-4 md:mb-6 border-l-8 pl-4" style={{ borderColor: "#1a365d" }}>
            <h2 className="text-xl md:text-3xl font-bold" style={{ color: "#1a365d" }}>
              担当者を直接呼び出す
            </h2>
            <p className="text-sm md:text-base text-gray-500 mt-1 md:mt-2">受付番号または名前を選択して呼び出します</p>
          </div>

          {/* 受付番号入力（ルートA） */}
          <form onSubmit={handleCodeSubmit} className="mb-4 md:mb-5">
            <div className="flex gap-2 md:gap-3">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={receptionCode}
                onChange={(e) => { setReceptionCode(e.target.value); setCodeError(""); }}
                placeholder="受付番号を入力（4〜6桁）"
                className="flex-1 px-4 py-3 md:px-5 md:py-4 bg-gray-50 border-2 border-gray-100 rounded-xl md:rounded-2xl text-base md:text-xl focus:outline-none focus:border-[#1a365d] focus:bg-white transition-all min-w-0"
              />
              <button
                type="submit"
                className="px-4 py-3 md:px-6 md:py-4 text-white font-bold rounded-xl md:rounded-2xl text-base md:text-lg transition-all hover:opacity-90 shrink-0"
                style={{ backgroundColor: "#1a365d" }}
              >
                呼び出す
              </button>
            </div>
            {codeError && (
              <p className="mt-2 text-red-500 text-sm font-medium">{codeError}</p>
            )}
          </form>

          <div className="border-t border-gray-100 pt-3 mb-3 md:pt-4 md:mb-4">
            <p className="text-sm text-gray-400 text-center">または 名前から探す</p>
          </div>

          {/* 名前検索 */}
          <div className="relative mb-3 md:mb-4">
            <input
              type="text"
              placeholder="名前を検索..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-11 pr-4 py-3 md:pl-12 md:py-4 bg-gray-50 border-2 border-gray-100 rounded-xl md:rounded-2xl text-base md:text-xl focus:outline-none focus:border-[#1a365d] focus:bg-white transition-all"
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6 absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* 五十音インデックス */}
          <div className="grid grid-cols-5 md:grid-cols-10 gap-1 mb-3 md:mb-4">
            {SYLLABARY.map((kana) => (
              <button
                key={kana}
                onClick={() => setSelectedSyllabary(selectedSyllabary === kana ? null : kana)}
                className="py-2 rounded-lg font-bold text-sm transition-all hover:bg-[#1a365d] hover:text-white"
                style={
                  selectedSyllabary === kana
                    ? { backgroundColor: "#1a365d", color: "white" }
                    : { backgroundColor: "#f9fafb", color: "#4b5563" }
                }
              >
                {kana}
              </button>
            ))}
          </div>

          {/* スタッフリスト */}
          <div className="md:flex-grow md:overflow-y-auto space-y-2 md:space-y-3 md:pr-2">
            {loadingDirectory ? (
              <p className="text-center text-gray-400 py-8">読み込み中...</p>
            ) : filteredStaff.length === 0 ? (
              <p className="text-center text-gray-400 py-8">該当するスタッフがいません</p>
            ) : (
              filteredStaff.map((staff) => (
                <button
                  key={staff.id}
                  onClick={() => handleStaffCall(staff.id, staff.name)}
                  className="w-full flex items-center p-3 md:p-5 bg-white border border-gray-100 rounded-2xl md:rounded-3xl transition-all shadow-sm hover:border-[#1a365d] hover:bg-blue-50 group"
                >
                  <div className="w-10 h-10 md:w-14 md:h-14 bg-gray-100 rounded-full flex items-center justify-center mr-3 md:mr-5 transition-colors group-hover:bg-[#1a365d] shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-8 md:w-8 text-gray-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="text-left flex-grow min-w-0">
                    <h3 className="text-base md:text-xl font-bold truncate" style={{ color: "#1a365d" }}>{staff.name}</h3>
                    <p className="text-gray-500 text-xs md:text-sm truncate">{(staff.department as Department)?.name || "部署未設定"}</p>
                  </div>
                  <div
                    className="px-3 py-1.5 md:px-5 md:py-2 bg-gray-50 text-[#1a365d] rounded-full font-bold text-xs md:text-sm transition-all group-hover:bg-[#1a365d] group-hover:text-white shrink-0 ml-2"
                  >
                    CALL
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      </main>

      <footer className="p-3 md:p-5 text-center text-gray-400 bg-gray-50 flex items-center justify-center space-x-2 text-sm md:text-base">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>画面をタッチすると呼び出しを開始します</p>
      </footer>
    </div>
  );
}
