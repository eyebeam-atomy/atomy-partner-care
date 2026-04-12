'use client';
import bcrypt from 'bcryptjs';
import { useState } from 'react';
import { useRouter } from 'next/navigation'; // 페이지 이동을 위한 도구
import { supabase } from '@/lib/supabase';

export default function SignUpPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [userName, setUserName] = useState('');
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. 필수 입력 체크
    if (!phone || !password || !userName) {
      alert('모든 정보를 입력해주세요!');
      return;
    }

    // 2. 비밀번호 유효성 검사 (정규식)
    // 조건: 8자 이상, 영문자, 숫자, 특수문자 포함
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;

    if (!passwordRegex.test(password)) {
      alert('비밀번호는 8자 이상이며, 영문자, 숫자, 특수문자를 모두 포함해야 합니다.');
      return;
    }

    // 1. 암호화 진행
    const hashedPassword = await bcrypt.hash(password, 10);

    // 2. DB 저장
    const { error } = await supabase
      .from('partners')
      .insert([{
        user_id: phone,
        password: hashedPassword, // 암호화된 값 전송!
        user_name: userName
      }]);

    if (error) {
      alert('이미 등록된 번호이거나 가입에 실패했습니다.');
    } else {
      // 3. 사용자에게 성공 알림을 주고 확인을 누르면 이동!
      alert('회원가입이 완료되었습니다! 로그인 페이지로 이동합니다.');

      // 4. 로그인 페이지('/')로 리다이렉트
      router.push('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 border border-slate-100">
        <h1 className="text-3xl font-extrabold text-blue-600 text-center mb-8">회원 등록</h1>

        <form onSubmit={handleSignUp} className="space-y-4">
          {/* 이름 입력창: 최대 20자 */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">이름</label>
            <input
              type="text"
              placeholder="성함을 입력하세요 (최대 20자)"
              maxLength={20}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={userName}
              onChange={(e) => {
                // 🔥 한글, 영문, 숫자, 공백만 허용하고 나머지는 실시간으로 삭제!
                const safeValue = e.target.value.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s]/g, '');
                setUserName(safeValue);
              }}
            />
          </div>

          {/* 전화번호 입력창: 숫자만, 최대 11자 */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">아이디 (전화번호)</label>
            <input
              type="text"
              placeholder="01012345678"
              maxLength={11} // 최대 11자 제한 (01012345678)
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={phone}
              onChange={(e) => {
                // 🔥 숫자만 입력받게 하는 마법의 한 줄
                const onlyNumber = e.target.value.replace(/[^0-9]/g, '');
                setPhone(onlyNumber);
              }}
            />
          </div>

          {/* 비밀번호 입력창: 최대 20자 */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">비밀번호</label>
            <input
              type="password"
              placeholder="영문, 숫자, 특수문자 포함 (최대 20자)"
              maxLength={20} // 최대 20자 제한
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg transition mt-4">
            가입하기
          </button>
        </form>
      </div>
    </div>
  );
}