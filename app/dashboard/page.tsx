'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { encrypt, decrypt } from '@/lib/crypto';

export default function Dashboard() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // 고객 이력 및 제품 검색 상태
  const [history, setHistory] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // 입력 폼 상태
  const [formData, setFormData] = useState({ name: '', phone: '', address: '', memo: '' });
  const [consultationContent, setConsultationContent] = useState('');
  const [purchaseData, setPurchaseData] = useState({ product_name: '', duration: '30' });

  useEffect(() => {
    const getUser = async () => {
      // 초기 개발 단계에서는 첫 번째 파트너 정보를 가져옵니다.
      const { data: userData } = await supabase.from('partners').select('*').limit(1).single();
      if (userData) setCurrentUser(userData);
    };
    getUser();

    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (currentUser) fetchCustomers();
  }, [currentUser]);

  useEffect(() => {
    if (selectedCustomer) fetchHistory();
  }, [selectedCustomer]);

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('creator_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (data) {
      setCustomers(data.map(c => ({
        ...c,
        name: decrypt(c.name),
        phone: decrypt(c.phone),
        address: c.address ? decrypt(c.address) : ''
      })));
    }
  };

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

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('customers').insert([{
      creator_id: currentUser.id,
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

  const handleAddConsultation = async () => {
    if (!consultationContent.trim()) return;
    const { error } = await supabase.from('consultations').insert([{
      customer_id: selectedCustomer.id,
      content: encrypt(consultationContent)
    }]);
    if (!error) {
      setConsultationContent('');
      fetchHistory();
    }
  };

  const handleAddPurchase = async () => {
    if (!purchaseData.product_name.trim()) return;
    const duration = parseInt(purchaseData.duration);
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + duration);

    const { error } = await supabase.from('purchases').insert([{
      customer_id: selectedCustomer.id,
      product_name: purchaseData.product_name,
      duration_days: duration,
      expiry_date: expiryDate.toISOString()
    }]);

    if (!error) {
      setPurchaseData({ product_name: '', duration: '30' });
      fetchHistory();
    }
  };

  const searchProducts = async (keyword: string) => {
    setPurchaseData({ ...purchaseData, product_name: keyword });
    if (keyword.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    const { data } = await supabase.from('products').select('*').ilike('name', `%${keyword}%`).limit(8);
    if (data && data.length > 0) {
      setSearchResults(data);
      setShowResults(true);
    } else {
      setShowResults(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">소비자 관리</h1>
            <p className="text-slate-500 mt-1">{currentUser?.user_name}님 반갑습니다.</p>
          </div>
          <button onClick={() => window.location.href = '/'} className="text-slate-400 hover:text-red-500 text-sm underline underline-offset-4 transition">
            로그아웃
          </button>
        </header>

        <button onClick={() => setIsModalOpen(true)} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold mb-6 shadow-lg shadow-blue-100 active:scale-95 transition-transform">
          + 새 소비자 등록
        </button>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="px-6 py-4 font-semibold text-sm">이름</th>
                <th className="px-6 py-4 font-semibold text-sm">연락처</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <tr key={c.id} onClick={() => setSelectedCustomer(c)} className="hover:bg-blue-50/50 cursor-pointer transition-colors group">
                  <td className="px-6 py-5 font-bold text-slate-900 text-lg group-hover:text-blue-600">{c.name}</td>
                  <td className="px-6 py-5 text-slate-600 font-medium">{c.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white rounded-t-[2.5rem] md:rounded-3xl p-8 w-full max-w-5xl h-[90vh] overflow-y-auto shadow-2xl relative animate-in slide-in-from-bottom duration-300">
            <button onClick={() => setSelectedCustomer(null)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-800 text-2xl transition">✕</button>

            <div className="mb-10">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">{selectedCustomer.name} 소비자</h2>
              <p className="text-slate-500 font-medium">{selectedCustomer.phone}</p>
            </div>

            <div className="grid md:grid-cols-2 gap-10">
              <div className="space-y-10">
                <section className="space-y-4">
                  <h3 className="font-bold text-lg text-blue-600 border-b-2 border-blue-50 pb-2">💬 상담 기록</h3>
                  <textarea
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 min-h-[140px] outline-none focus:border-blue-500 focus:bg-white transition-colors resize-none text-sm"
                    placeholder="상담 내용을 입력하세요."
                    value={consultationContent}
                    onChange={(e) => setConsultationContent(e.target.value)}
                  />
                  <button onClick={handleAddConsultation} className="w-full bg-slate-800 text-white py-3.5 rounded-xl font-bold hover:bg-slate-900 transition">상담 저장</button>
                </section>

                <section className="space-y-4">
                  <h3 className="font-bold text-lg text-green-600 border-b-2 border-green-50 pb-2">🎁 제품 구매</h3>
                  <div className="relative" ref={searchRef}>
                    <input
                      type="text" placeholder="제품명을 검색하세요"
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 outline-none focus:border-green-500 focus:bg-white transition-colors text-sm"
                      value={purchaseData.product_name}
                      onChange={(e) => searchProducts(e.target.value)}
                    />
                    {showResults && searchResults.length > 0 && (
                      <ul className="absolute z-10 w-full bg-white border border-slate-200 rounded-xl mt-2 shadow-2xl max-h-48 overflow-y-auto">
                        {searchResults.map((p) => (
                          <li key={p.id} onClick={() => { setPurchaseData({...purchaseData, product_name: p.name}); setShowResults(false); }} className="px-4 py-3 hover:bg-green-50 cursor-pointer border-b border-slate-50 last:border-0">
                            <div className="font-bold text-slate-800 text-sm">{p.name}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{p.price?.toLocaleString()}원 | {p.pv?.toLocaleString()} PV</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <select
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 outline-none focus:border-green-500 focus:bg-white transition-colors text-sm font-semibold"
                    value={purchaseData.duration}
                    onChange={(e) => setPurchaseData({...purchaseData, duration: e.target.value})}
                  >
                    <option value="15">15일분 (반달)</option>
                    <option value="30">30일분 (1개월)</option>
                    <option value="60">60일분 (2개월)</option>
                    <option value="90">90일분 (3개월)</option>
                    <option value="120">120일분 (4개월)</option>
                    <option value="180">180일분 (6개월)</option>
                  </select>
                  <button onClick={handleAddPurchase} className="w-full bg-green-600 text-white py-3.5 rounded-xl font-bold hover:bg-green-700 shadow-lg shadow-green-100 transition">구매 저장</button>
                </section>
              </div>

              <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                <h3 className="font-bold text-lg text-slate-800 mb-6">📜 전체 관리 이력</h3>
                <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2">
                  {history.map((item, idx) => (
                    <div key={idx} className="relative pl-6 border-l-2 border-slate-200">
                      <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-4 border-slate-50 ${item.type === 'consultation' ? 'bg-blue-500' : 'bg-green-500'}`} />
                      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                        <div className="flex justify-between items-start mb-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.type === 'consultation' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                            {item.type === 'consultation' ? '상담' : '제품구매'}
                          </span>
                          <span className="text-[10px] text-slate-400">{new Date(item.created_at).toLocaleDateString()}</span>
                        </div>
                        {item.type === 'consultation' ? (
                          <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{item.content}</p>
                        ) : (
                          <div>
                            <p className="text-slate-900 font-bold text-sm">{item.product_name}</p>
                            <p className="text-[11px] text-red-500 font-bold mt-2">~{new Date(item.expiry_date).toLocaleDateString()} 종료 예정</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 z-50">
          <div className="bg-white rounded-t-[2.5rem] md:rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in slide-in-from-bottom duration-300">
            <h2 className="text-2xl font-bold mb-6 text-slate-900">새 소비자 등록</h2>
            <form onSubmit={handleAddCustomer} className="space-y-4">
              <input type="text" required placeholder="이름" className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 outline-none focus:border-blue-500" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
              <input type="text" required placeholder="연락처" className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 outline-none focus:border-blue-500" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-xl font-bold">취소</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white py-4 rounded-xl font-bold">저장하기</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}