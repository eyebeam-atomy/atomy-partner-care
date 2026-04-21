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
    const virtualEmail = `${phone}@atomy.co.kr`;

    // 1. 회원가입 실행
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: virtualEmail,
      password: password,
    });

    if (authError) {
      alert(`가입 실패: ${authError.message}`);
      return;
    }

    if (authData.user) {
      // 2. 파트너 테이블에 추가 정보 저장
      const { error: dbError } = await supabase.from('partners').insert([
        {
          id: authData.user.id,
          user_id: phone,
          user_name: userName,
        },
      ]);

      if (dbError) {
        alert('데이터 저장 중 오류가 발생했습니다.');
        return;
      }

      // 🔥 [핵심 추가] 가입되자마자 생성된 세션을 강제로 파기합니다.
      await supabase.auth.signOut();

      alert('회원가입이 완료되었습니다! 방금 만드신 비밀번호로 로그인해 주세요.');
      router.push('/'); // 이제 세션이 없으므로 로그인 화면에 멈춰있게 됩니다.
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