'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({ partners: 0, customers: 0, consultations: 0, purchases: 0 });
  const [partnerList, setPartnerList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 🚀 비밀번호 초기화 관련 상태 (기존 소스 이식)
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [targetPhone, setTargetPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [masterCode, setMasterCode] = useState('');
  const [isResetLoading, setIsResetLoading] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push('/');

      const { data: userData } = await supabase.from('partners').select('*').eq('id', session.user.id).single();

      if (userData?.user_id !== '01093693777') {
        alert("접근 권한이 없습니다.");
        router.push('/dashboard');
        return;
      }
      fetchAdminData();
    };
    checkAdmin();
  }, []);

  const fetchAdminData = async () => {
    setIsLoading(true);
    const { count: pCount } = await supabase.from('partners').select('*', { count: 'exact', head: true });
    const { count: cCount } = await supabase.from('customers').select('*', { count: 'exact', head: true });
    const { count: conCount } = await supabase.from('consultations').select('*', { count: 'exact', head: true });
    const { count: purCount } = await supabase.from('purchases').select('*', { count: 'exact', head: true });

    setStats({ partners: pCount || 0, customers: cCount || 0, consultations: conCount || 0, purchases: purCount || 0 });

    const { data: partners } = await supabase.from('partners').select('*').order('created_at', { ascending: false });
    if (partners) setPartnerList(partners);

    setIsLoading(false);
  };

  // 🚀 기존 비밀번호 초기화 로직 그대로 이식
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsResetLoading(true);

    const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      alert('올바른 파트너 전화번호를 입력해주세요.');
      setIsResetLoading(false);
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
        setIsResetModalOpen(false);
      } else {
        alert(`🚨 실패: ${data.error}`);
      }
    } catch (err) {
      alert('서버 연결 오류가 발생했습니다.');
    } finally {
      setIsResetLoading(false);
    }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 font-bold">총단장님, 데이터를 불러오고 있습니다...</div>;

  return (
    <div className="min-h-screen bg-slate-100 p-4 font-sans">
      <div className="max-w-md mx-auto space-y-6 pb-20">
        {/* 헤더 */}
        <header className="flex justify-between items-center py-4">
          <button onClick={() => router.push('/dashboard')} className="text-slate-500 font-bold text-sm">← 내 대시보드</button>
          <h1 className="text-xl font-extrabold text-slate-900">👑 통합 관리 시스템</h1>
          <div className="w-10"></div>
        </header>

        {/* 상단 통계 카드 (생략 없이 유지) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-200 text-center">
            <p className="text-xs font-bold text-slate-400 mb-1">총 파트너</p>
            <p className="text-2xl font-black text-blue-600">{stats.partners}명</p>
          </div>
          <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-200 text-center">
            <p className="text-xs font-bold text-slate-400 mb-1">총 소비자</p>
            <p className="text-2xl font-black text-emerald-600">{stats.customers}명</p>
          </div>
        </div>

        {/* 🚀 어드민 퀵 메뉴 (초기화 버튼 추가) */}
        <div className="bg-white rounded-[2.5rem] p-4 shadow-sm border border-slate-200">
            <button
                onClick={() => setIsResetModalOpen(true)}
                className="w-full py-4 bg-red-50 text-red-600 font-bold rounded-2xl border border-red-100 hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
            >
                🔑 파트너 비밀번호 강제 초기화
            </button>
        </div>

        {/* 파트너 목록 현황 */}
        <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">👤 파트너 가입 현황</h2>
          <div className="space-y-4">
            {partnerList.map((p) => (
              <div key={p.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                <div>
                  <p className="font-bold text-slate-800">{p.user_name}</p>
                  <p className="text-xs text-slate-500">{p.user_id}</p>
                </div>
                <div className="text-right text-[10px] text-slate-400">
                  {new Date(p.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 🚀 비밀번호 초기화 모달 (기존 디자인 유지) */}
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 animate-slide-up">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900 tracking-tight text-red-600">⚠️ 비밀번호 초기화</h3>
              <button onClick={() => setIsResetModalOpen(false)} className="text-slate-400 text-2xl">×</button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 ml-1">마스터 인증 코드</label>
                <input
                  type="password"
                  placeholder="Master Code 입력"
                  required
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-red-500 transition-all"
                  value={masterCode}
                  onChange={(e) => setMasterCode(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 ml-1">초기화할 파트너 번호</label>
                <input
                  type="text"
                  placeholder="01012345678"
                  required
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-red-500 transition-all"
                  value={targetPhone}
                  onChange={(e) => setTargetPhone(e.target.value.replace(/[^0-9]/g, ''))}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 ml-1">새 비밀번호</label>
                <input
                  type="text"
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl text-red-600 font-bold outline-none"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={isResetLoading}
                className="w-full py-4 bg-red-600 text-white font-bold text-lg rounded-xl shadow-lg mt-4"
              >
                {isResetLoading ? '처리 중...' : '지금 바로 초기화'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}