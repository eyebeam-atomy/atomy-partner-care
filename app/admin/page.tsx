'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function AdminDashboard() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  // 통계 지표 상태
  const [stats, setStats] = useState({
    partners: 0,
    customers: 0,
    todayVisits: 0, // 오늘 총 방문 횟수(PV)
    todayUniqueUsers: 0 // 오늘 순 방문자 수(UV)
  });

  const [ranking, setRanking] = useState<any[]>([]); // 파트너 접속 랭킹
  const [partnerList, setPartnerList] = useState<any[]>([]);

  // 🚀 [수정 완료] 비밀번호 초기화 상태 (기본값 공백)
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [targetPhone, setTargetPhone] = useState('');
  const [newPassword, setNewPassword] = useState(''); // 여기를 공백으로 수정했습니다!
  const [masterCode, setMasterCode] = useState('');
  const [isResetLoading, setIsResetLoading] = useState(false);

  const getTodayKST = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().split('T')[0];
  };

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
    const today = getTodayKST();

    // 1. 기본 인원 통계
    const { count: pCount } = await supabase.from('partners').select('*', { count: 'exact', head: true });
    const { count: cCount } = await supabase.from('customers').select('*', { count: 'exact', head: true });

    // 2. 오늘 방문 기록 조회
    const { data: visitLogs } = await supabase
      .from('visit_logs')
      .select('*, partners(user_name, user_id)')
      .eq('visit_date', today);

    let totalPV = 0;
    let rankData: any[] = [];

    if (visitLogs) {
      visitLogs.forEach((log: any) => {
        totalPV += log.visit_count;
        rankData.push({
          name: log.partners?.user_name || '알 수 없음',
          phone: log.partners?.user_id || '-',
          count: log.visit_count,
          last_at: new Date(log.last_visited_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        });
      });
      rankData.sort((a, b) => b.count - a.count);
    }

    setStats({ partners: pCount || 0, customers: cCount || 0, todayVisits: totalPV, todayUniqueUsers: visitLogs?.length || 0 });
    setRanking(rankData);

    const { data: partners } = await supabase.from('partners').select('*').order('created_at', { ascending: false });
    if (partners) setPartnerList(partners);

    setIsLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword) return alert("새로운 비밀번호를 입력해주세요.");

    setIsResetLoading(true);
    const cleanPhone = targetPhone.replace(/[^0-9]/g, '');

    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPhone: cleanPhone, newPassword, masterCode })
      });
      if (res.ok) {
        alert(`🎉 [${cleanPhone}] 초기화 성공! 새 비밀번호: ${newPassword}`);
        setTargetPhone('');
        setNewPassword('');
        setIsResetModalOpen(false);
      } else {
        const d = await res.json();
        alert(`🚨 실패: ${d.error}`);
      }
    } catch (err) {
      alert('서버 오류가 발생했습니다.');
    } finally {
      setIsResetLoading(false);
    }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center font-bold">👑 총단장님, 현황판 준비 중...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-sans pb-20">
      <div className="max-w-md mx-auto space-y-6">
        <header className="flex justify-between items-center py-4">
          <button onClick={() => router.push('/dashboard')} className="text-slate-500 font-bold text-sm">← 내 대시보드</button>
          <h1 className="text-xl font-black text-slate-900">📊 통합 통계 시스템</h1>
          <div className="w-10"></div>
        </header>

        {/* 방문자 대시보드 카드 */}
        <div className="bg-slate-900 rounded-[2.5rem] p-6 shadow-xl text-white">
          <p className="text-blue-400 text-[11px] font-black uppercase tracking-widest mb-1">Today's Traffic</p>
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-sm font-bold opacity-70">오늘 총 방문(PV)</h2>
              <p className="text-4xl font-black">{stats.todayVisits}<span className="text-lg font-medium opacity-50 ml-1">회</span></p>
            </div>
            <div className="text-right">
              <h2 className="text-sm font-bold opacity-70">방문자수(UV)</h2>
              <p className="text-2xl font-black text-blue-400">{stats.todayUniqueUsers}<span className="text-sm font-medium opacity-50 ml-0.5">명</span></p>
            </div>
          </div>
        </div>

        {/* 전체 통계 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-200">
            <p className="text-xs font-bold text-slate-400 mb-1">전체 파트너</p>
            <p className="text-2xl font-black text-slate-800">{stats.partners}명</p>
          </div>
          <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-200">
            <p className="text-xs font-bold text-slate-400 mb-1">전체 소비자</p>
            <p className="text-2xl font-black text-slate-800">{stats.customers}명</p>
          </div>
        </div>

        {/* 접속 랭킹 */}
        <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">🔥 오늘 접속 랭킹</h2>
          <div className="space-y-3">
            {ranking.length === 0 ? (
              <p className="text-center py-4 text-slate-400 text-sm">아직 오늘 접속자가 없습니다.</p>
            ) : (
              ranking.map((r, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-black ${idx === 0 ? 'bg-amber-400 text-white' : 'bg-slate-200 text-slate-500'}`}>{idx + 1}</span>
                    <div>
                      <p className="font-bold text-sm text-slate-800">{r.name}</p>
                      <p className="text-[10px] text-slate-400">{r.last_at} 마지막 접속</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-blue-600">{r.count}회</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 초기화 버튼 */}
        <div className="bg-red-50 rounded-[2.5rem] p-4 border border-red-100">
          <button onClick={() => setIsResetModalOpen(true)} className="w-full py-4 bg-white text-red-600 font-bold rounded-2xl shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-transform">
            🔑 파트너 비밀번호 초기화
          </button>
        </div>
      </div>

      {/* 비밀번호 초기화 모달 */}
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 animate-slide-up">
            <div className="flex justify-between items-center mb-6 text-red-600">
              <h3 className="text-xl font-black">비밀번호 강제 초기화</h3>
              <button onClick={() => setIsResetModalOpen(false)} className="text-2xl">×</button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 ml-1">마스터 인증 코드</label>
                <input type="password" placeholder="Master Code" required className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl" value={masterCode} onChange={e => setMasterCode(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 ml-1">대상 파트너 번호</label>
                <input type="text" placeholder="01012345678" required className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl" value={targetPhone} onChange={e => setTargetPhone(e.target.value.replace(/[^0-9]/g, ''))} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 ml-1">새 비밀번호 입력</label>
                <input type="text" placeholder="초기화할 비번 입력" required className="w-full p-4 bg-white border-2 border-red-200 rounded-xl font-bold text-red-600 outline-none focus:border-red-500" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              </div>
              <button type="submit" disabled={isResetLoading} className="w-full py-4 bg-red-600 text-white font-bold rounded-xl shadow-lg mt-4 active:scale-95 transition-transform">
                {isResetLoading ? '처리 중...' : '비밀번호 강제 변경'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}