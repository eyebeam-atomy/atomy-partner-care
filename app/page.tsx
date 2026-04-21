'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function Login() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const virtualEmail = `${phone}@atomy.co.kr`;

    const { error } = await supabase.auth.signInWithPassword({
      email: virtualEmail,
      password: password,
    });

    if (error) {
      alert('로그인 실패: 전화번호나 비밀번호를 확인해주세요.');
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 py-12 shadow-2xl">
        <h1 className="text-4xl font-extrabold text-blue-600 text-center mb-10 tracking-tight">소비자 관리</h1>

        <form onSubmit={handleLogin} className="space-y-4">
          {/* 🚀 [수정] text-slate-900 (입력 글자색)과 placeholder:text-slate-400 (안내문구 색상) 추가 */}
          <input
            type="tel"
            placeholder="전화번호 (예: 01012345678)"
            className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 placeholder:text-slate-400 font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="비밀번호"
            className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 placeholder:text-slate-400 font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <div className="pt-4">
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-transform"
            >
              로그인
            </button>
          </div>
        </form>

        <div className="mt-4">
          <button
            onClick={() => router.push('/signup')}
            className="w-full bg-white text-blue-600 border-2 border-blue-600 py-3.5 rounded-xl font-bold text-lg active:scale-95 transition-transform"
          >
            회원가입
          </button>
        </div>

      </div>
    </div>
  );
}