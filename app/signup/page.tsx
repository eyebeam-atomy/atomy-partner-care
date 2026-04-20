'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function SignupPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [userName, setUserName] = useState('');
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    // 🚀 [보안] 전화번호를 가상 이메일로 변환
    const virtualEmail = `${phone}@atomy.co.kr`;

    // 1. Supabase 공식 인증 서버에 회원가입 (Auth)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: virtualEmail,
      password: password,
    });

    if (authError) {
      alert(`가입 실패: ${authError.message}`);
      return;
    }

    if (authData.user) {
      // 2. 인증 성공 후, 추가 정보(이름, 폰번호)를 partners 테이블에 저장
      const { error: dbError } = await supabase.from('partners').insert([
        {
          id: authData.user.id, // Auth 서버가 만들어준 고유 ID를 그대로 사용 (매우 중요!)
          user_id: phone,
          user_name: userName,
          // 비밀번호는 Auth 서버가 관리하므로 여기에 직접 저장하지 않아 보안에 더 좋습니다!
        },
      ]);

      if (dbError) {
        alert('추가 정보 저장 중 오류가 발생했습니다.');
        return;
      }

      alert('회원가입이 완료되었습니다! 로그인해 주세요.');
      router.push('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 border border-slate-100">
        <h1 className="text-2xl font-bold text-center mb-8">파트너 회원가입</h1>
        <form onSubmit={handleSignup} className="space-y-4">
          <input type="text" placeholder="성함" required className="w-full px-4 py-3 bg-slate-50 border rounded-xl" value={userName} onChange={(e) => setUserName(e.target.value)} />
          <input type="text" placeholder="전화번호 (아이디로 사용)" required className="w-full px-4 py-3 bg-slate-50 border rounded-xl" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input type="password" placeholder="비밀번호" required className="w-full px-4 py-3 bg-slate-50 border rounded-xl" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg">가입하기</button>
        </form>
      </div>
    </div>
  );
}