'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { encrypt, decrypt } from '@/lib/crypto';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  // 입력 폼 및 검색 상태
  const [history, setHistory] = useState<any[]>([]);
  const [formData, setFormData] = useState({ name: '', phone: '', address: '', memo: '' });
  const [consultationContent, setConsultationContent] = useState('');
  const [purchaseData, setPurchaseData] = useState({ product_name: '', duration: '30' });
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // 🚀 [핵심] 로그인 세션 확인 및 사용자 정보 가져오기
  useEffect(() => {
    const checkUser = async () => {
      // 1. 현재 로그인한 사용자의 세션 정보 가져오기
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        // 로그인 세션이 없으면 로그인 페이지로 튕겨내기
        router.push('/');
        return;
      }

      // 2. partners 테이블에서 로그인한 사용자의 프로필 정보 가져오기
      const { data: userData, error } = await supabase
        .from('partners')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (userData) {
        setCurrentUser(userData);
      } else {
        router.push('/');
      }
    };

    checkUser();

    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [router]);

  // 🚀 [핵심] 사용자가 확인되면 해당 사용자의 소비자 목록만 가져오기
  useEffect(() => {
    if (currentUser) {
      fetchCustomers();
    }
  }, [currentUser]);

  const fetchCustomers = async () => {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('creator_id', currentUser.id) // 로그인한 사용자의 ID로 필터링
      .order('created_at', { ascending: false });

    if (data) {
      // 데이터 복호화 처리
      setCustomers(data.map(c => ({
        ...c,
        name: decrypt(c.name),
        phone: decrypt(c.phone),
        address: c.address ? decrypt(c.address) : '',
        memo: c.memo ? decrypt(c.memo) : ''
      })));
    }
  };

  // 소비자 등록 함수 (보안 ID 포함)
  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('customers').insert([{
      creator_id: currentUser.id, // 등록 시 현재 유저 ID 저장
      name: encrypt(formData.name),
      phone: encrypt(formData.phone),
      address: formData.address ? encrypt(formData.address) : '',
      memo: formData.memo ? encrypt(formData.memo) : ''
    }]);

    if (!error) {
      setIsModalOpen(false);
      setFormData({ name: '', phone: '', address: '', memo: '' });
      fetchCustomers();
    }
  };

  // 로그아웃 함수
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  // (기존 상담/구매 등록 및 검색 함수들은 동일하게 유지...)
  const fetchHistory = async () => {
    if (!selectedCustomer) return;
    const { data: cons } = await supabase.from('consultations').select('*').eq('customer_id', selectedCustomer.id);
    const { data: purs } = await supabase.from('purchases').select('*').eq('customer_id', selectedCustomer.id);
    const combined = [
      ...(cons?.map(i => ({ ...i, type: 'consultation', content: decrypt(i.content) })) || []),
      ...(purs?.map(i => ({ ...i, type: 'purchase' })) || [])
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setHistory(combined);
  };

  useEffect(() => { if (selectedCustomer) fetchHistory(); }, [selectedCustomer]);

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">소비자 관리</h1>
            <p className="text-slate-500 mt-1">{currentUser?.user_name}님 반갑습니다.</p>
          </div>
          <button onClick={handleLogout} className="text-slate-400 hover:text-red-500 text-sm underline underline-offset-4 transition">
            로그아웃
          </button>
        </header>

        <button onClick={() => setIsModalOpen(true)} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold mb-6 shadow-lg active:scale-95 transition-transform">
          + 새 소비자 등록
        </button>

        {/* 소비자 목록 테이블 */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="px-6 py-4 font-semibold text-sm">이름</th>
                <th className="px-6 py-4 font-semibold text-sm">연락처</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-6 py-10 text-center text-slate-400">등록된 소비자가 없습니다.</td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} onClick={() => setSelectedCustomer(c)} className="hover:bg-blue-50/50 cursor-pointer transition-colors group">
                    <td className="px-6 py-5 font-bold text-slate-900 text-lg group-hover:text-blue-600">{c.name}</td>
                    <td className="px-6 py-5 text-slate-600 font-medium">{c.phone}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 소비자 상세 모달 및 등록 모달 로직... (이전과 동일하게 유지) */}
      {/* (중략 - 기존의 상세 정보 팝업 및 새 소비자 등록 팝업 코드가 들어갑니다) */}
    </div>
  );
}