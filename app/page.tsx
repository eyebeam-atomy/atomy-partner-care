'use client';
import bcrypt from 'bcryptjs';
import { useState } from 'react';
import { useRouter } from 'next/navigation'; // 1. 이동 도구 추가
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter(); // 2. 이동 함수 초기화

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const { data, error } = await supabase
      .from('partners')
      .select('*')
      .eq('user_id', phone)
      .single();

    if (error || !data) {
      alert('등록되지 않은 사용자입니다.');
      return;
    }

    if (data) {
      // 🔥 암호화된 비번과 사용자가 입력한 비번을 비교
      const isMatch = await bcrypt.compare(password, data.password);

      if (isMatch) {
        alert(`${data.user_name}님, 환영합니다!`);
        router.push('/dashboard');
      } else {
        alert('비밀번호가 틀렸습니다.');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 border border-slate-100">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-blue-600 tracking-tight">Atomy Partner Care</h1>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">전화번호 (아이디)</label>
            <input
              type="text"
              placeholder="01012345678"
              className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">비밀번호</label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="pt-2 space-y-3">
            <button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition duration-200">
              로그인하기
            </button>

            {/* 3. 회원가입 페이지로 보내주는 버튼 추가 */}
            <button
              type="button"
              onClick={() => router.push('/signup')}
              className="w-full py-4 bg-white border border-blue-600 text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition duration-200"
            >
              회원가입 하러가기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}