'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const [masterCode, setMasterCode] = useState('');
  const [targetPhone, setTargetPhone] = useState('');
  const [newPassword, setNewPassword] = useState('1234'); // 🚀 파트너에게 알려줄 기본 비번
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      alert('올바른 파트너 전화번호를 입력해주세요.');
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPhone: cleanPhone, newPassword, masterCode })
      });

      const data = await res.json();

      if (res.ok) {
        alert(`🎉 성공! [${cleanPhone}] 파트너의 비밀번호가 [${newPassword}]로 강제 초기화되었습니다.`);
        setTargetPhone('');
      } else {
        alert(`🚨 실패: ${data.error}`);
      }
    } catch (error) {
      alert('서버 오류가 발생했습니다.');
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 py-12 shadow-2xl border-4 border-red-500">
        <h1 className="text-3xl font-extrabold text-red-600 text-center mb-2 tracking-tight">마스터 관리자 👑</h1>
        <p className="text-center text-slate-500 mb-10 font-medium">파트너 비밀번호 강제 초기화</p>

        <form onSubmit={handleReset} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 ml-1">총단장님 승인 암호</label>
            <input
              type="text"
              placeholder="마스터 암호 입력"
              required
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 placeholder:text-slate-400 font-medium focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
              value={masterCode}
              onChange={(e) => setMasterCode(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 ml-1">초기화할 파트너 전화번호</label>
            <input
              type="tel"
              placeholder="01012345678"
              maxLength={11}
              required
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 placeholder:text-slate-400 font-medium focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
              value={targetPhone}
              onChange={(e) => setTargetPhone(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 ml-1">새로운 비밀번호 (기본값: 1234)</label>
            <input
              type="text"
              required
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none text-red-600 font-bold focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>

          <div className="pt-6">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-red-600 text-white font-bold text-lg rounded-xl shadow-lg active:scale-95 transition-transform disabled:bg-red-300"
            >
              {isLoading ? '초기화 진행 중...' : '비밀번호 강제 초기화'}
            </button>
          </div>
        </form>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="w-full bg-white text-slate-600 border-2 border-slate-200 py-3.5 rounded-xl font-bold text-lg active:scale-95 transition-transform hover:bg-slate-50"
          >
            로그인 화면으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}