'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // 이미 로그인된 상태면 대시보드로 자동 이동
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace('/dashboard');
      }
    };
    checkSession();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      alert('올바른 전화번호를 입력해주세요.');
      setIsLoading(false);
      return;
    }

    // 🚀 [핵심 로직] Supabase 로그인 전에 'partners' 테이블에 번호가 있는지 먼저 검사!
    const { data: partnerData, error: partnerError } = await supabase
      .from('partners')
      .select('user_id')
      .eq('user_id', cleanPhone)
      .maybeSingle(); // 한 명만 찾되, 없으면 null을 반환

    // 1️⃣ DB에 번호가 아예 없는 경우 (미가입자)
    if (!partnerData) {
      alert('🚨 회원가입이 되어 있지 않은 번호입니다.\n하단의 [새 파트너 가입] 버튼을 눌러 먼저 가입을 진행해 주세요!');
      setIsLoading(false);
      return;
    }

    // 2️⃣ 가입은 되어 있으니 로그인 진행
    const virtualEmail = `${cleanPhone}@atomy.co.kr`;
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: virtualEmail,
      password: password,
    });

    // 3️⃣ 로그인이 실패했다면 (무조건 비밀번호 틀림)
    if (authError) {
      alert('🚨 비밀번호가 일치하지 않습니다. 다시 확인해 주세요!');
      setIsLoading(false);
      return;
    }

    // 4️⃣ 완벽하게 로그인 성공!
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 py-12 shadow-2xl">
        <h1 className="text-4xl font-extrabold text-blue-600 text-center mb-2 tracking-tight">당정 최고</h1>
        <p className="text-center text-slate-500 mb-10 font-medium">소비자 관리 시스템에 오신 것을 환영합니다</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 ml-1">전화번호 (아이디)</label>
            <input
              type="tel"
              placeholder="01012345678"
              maxLength={11}
              required
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 placeholder:text-slate-400 font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 ml-1">비밀번호</label>
            <input
              type="password"
              placeholder="비밀번호 입력"
              maxLength={20}
              required
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 placeholder:text-slate-400 font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="pt-6">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-blue-600 text-white font-bold text-lg rounded-xl shadow-lg active:scale-95 transition-transform disabled:bg-blue-300"
            >
              {isLoading ? '로그인 중...' : '로그인'}
            </button>
          </div>
        </form>

        <div className="mt-6 flex flex-col gap-3">
          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-medium">아직 계정이 없으신가요?</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/signup')}
            className="w-full bg-white text-blue-600 border-2 border-blue-100 py-3.5 rounded-xl font-bold text-lg active:scale-95 transition-transform hover:bg-blue-50"
          >
            회원가입
          </button>
        </div>
      </div>
    </div>
  );
}