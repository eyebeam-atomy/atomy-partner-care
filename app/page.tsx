'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  // 🚀 [보안] 이미 로그인된 세션이 있는지 확인 (서버단 세션 확인)
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) router.push('/dashboard');
    };
    checkSession();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const virtualEmail = `${phone}@atomy.co.kr`;

    // 🚀 [보안] Supabase 공식 인증 함수 호출
    const { data, error } = await supabase.auth.signInWithPassword({
      email: virtualEmail,
      password: password,
    });

    if (error) {
      alert('아이디 또는 비밀번호가 틀렸습니다.');
      return;
    }

    if (data.session) {
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 border border-slate-100">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-blue-600 tracking-tight">소비자 관리</h1>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="text" placeholder="전화번호" className="w-full px-4 py-4 bg-slate-50 border rounded-xl" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input type="password" placeholder="비밀번호" className="w-full px-4 py-4 bg-slate-50 border rounded-xl" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg">로그인</button>
          <button type="button" onClick={() => router.push('/signup')} className="w-full py-4 bg-white border border-blue-600 text-blue-600 font-bold rounded-xl">회원가입</button>
        </form>
      </div>
    </div>
  );
}