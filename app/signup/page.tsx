'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function SignupPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); // 🚀 비밀번호 확인용 상태 추가
  const [userName, setUserName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // 🚀 [추가] 비밀번호 일치 여부 먼저 검사!
    if (password !== confirmPassword) {
      alert('🚨 비밀번호가 일치하지 않습니다. 다시 한번 확인해 주세요!');
      setIsLoading(false);
      return;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');

    if (cleanPhone.length < 10) {
      alert('올바른 전화번호를 입력해주세요.');
      setIsLoading(false);
      return;
    }

    const virtualEmail = `${cleanPhone}@atomy.co.kr`;

    // 1. 회원가입 실행
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: virtualEmail,
      password: password,
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        alert('🚨 이미 가입된 전화번호입니다. 뒤로 가기를 눌러 로그인해 주세요!');
      } else {
        alert(`가입 실패: 시스템 오류가 발생했습니다. (${authError.message})`);
      }
      setIsLoading(false);
      return;
    }

    if (authData.user) {
      const { error: dbError } = await supabase.from('partners').insert([
        {
          id: authData.user.id,
          user_id: cleanPhone,
          user_name: userName,
        },
      ]);

      if (dbError) {
        alert('데이터 저장 중 오류가 발생했습니다.');
        setIsLoading(false);
        return;
      }

      await supabase.auth.signOut();

      alert('🎉 회원가입이 완료되었습니다! 방금 만드신 비밀번호로 로그인해 주세요.');
      router.push('/');
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 py-12 shadow-2xl">
        <h1 className="text-3xl font-extrabold text-blue-600 text-center mb-10 tracking-tight">파트너 회원가입</h1>

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 ml-1">성함 (최대 20자)</label>
            <input
              type="text"
              placeholder="홍길동"
              maxLength={20}
              required
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 placeholder:text-slate-400 font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 ml-1">전화번호 (아이디로 사용, 숫자만 11자)</label>
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
            <label className="text-[11px] font-bold text-slate-500 ml-1">비밀번호 (최대 20자)</label>
            <input
              type="password"
              placeholder="비밀번호"
              maxLength={20}
              required
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 placeholder:text-slate-400 font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {/* 🚀 [추가] 비밀번호 확인 입력칸 */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 ml-1">비밀번호 확인</label>
            <input
              type="password"
              placeholder="비밀번호 다시 입력"
              maxLength={20}
              required
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 placeholder:text-slate-400 font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <div className="pt-6">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-blue-600 text-white font-bold text-lg rounded-xl shadow-lg active:scale-95 transition-transform disabled:bg-blue-300"
            >
              {isLoading ? '가입 처리 중...' : '가입하기'}
            </button>
          </div>
        </form>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="w-full bg-white text-slate-600 border-2 border-slate-200 py-3.5 rounded-xl font-bold text-lg active:scale-95 transition-transform hover:bg-slate-50"
          >
            뒤로 가기
          </button>
        </div>
      </div>
    </div>
  );
}