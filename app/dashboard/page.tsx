'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { encrypt, decrypt } from '@/lib/crypto';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  const [productList, setProductList] = useState<any[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchType, setSearchType] = useState('name');
  const [purchasedCustomerIds, setPurchasedCustomerIds] = useState<number[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', address: '', memo: '' });

  const [history, setHistory] = useState<any[]>([]);
  const today = new Date().toISOString().split('T')[0];

  const [editingConsultationId, setEditingConsultationId] = useState<number | null>(null);
  const [consultationData, setConsultationData] = useState({ date: today, content: '' });

  const [editingPurchaseId, setEditingPurchaseId] = useState<number | null>(null);
  const [purchaseData, setPurchaseData] = useState({ date: today, product_name: '', duration: '30' });

  // CRM 알림 상태
  const [crmAlerts, setCrmAlerts] = useState<any[]>([]);
  const [showCrmPopup, setShowCrmPopup] = useState(false);
  const hasAutoShownCrm = useRef(false);

  const modalScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push('/');
      const { data: userData } = await supabase.from('partners').select('*').eq('id', session.user.id).single();
      if (userData) setCurrentUser(userData);
      else router.push('/');
    };
    checkUser();

    const fetchProducts = async () => {
      const { data } = await supabase.from('products').select('*');
      if (data) setProductList(data);
    };
    fetchProducts();
  }, [router]);

  useEffect(() => { if (currentUser) fetchCustomers(); }, [currentUser]);

  const checkCrmAlerts = async (customersData: any[]) => {
    if (customersData.length === 0) return;
    const cIds = customersData.map(c => c.id);

    const { data: cons } = await supabase.from('consultations').select('customer_id, created_at').in('customer_id', cIds);
    const { data: purs } = await supabase.from('purchases').select('customer_id, created_at, expiry_date, product_name').in('customer_id', cIds);

    const now = new Date();
    const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);
    const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
    const sevenDaysLater = new Date(now); sevenDaysLater.setDate(now.getDate() + 7);

    const alerts: any[] = [];

    customersData.forEach(customer => {
      const custCons = cons?.filter(c => c.customer_id === customer.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) || [];
      const custPurs = purs?.filter(p => p.customer_id === customer.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) || [];

      let alertReasons: string[] = [];

      const lastConsDate = custCons.length > 0 ? new Date(custCons[0].created_at) : new Date(customer.created_at);
      if (lastConsDate < sevenDaysAgo) alertReasons.push('💬 상담 7일 경과');

      const expiringProducts = custPurs.filter(p => {
        const expDate = new Date(p.expiry_date);
        return expDate <= sevenDaysLater && expDate >= thirtyDaysAgo;
      });
      if (expiringProducts.length > 0) alertReasons.push(`⏰ ${expiringProducts[0].product_name} 만료 임박`);

      const lastPurDate = custPurs.length > 0 ? new Date(custPurs[0].created_at) : new Date(customer.created_at);
      if (lastPurDate < thirtyDaysAgo) alertReasons.push('🛒 구매 1개월 미진행');

      if (alertReasons.length > 0) {
        alerts.push({
          ...customer,
          reasons: alertReasons,
          priority: expiringProducts.length > 0 ? 3 : (lastPurDate < thirtyDaysAgo ? 2 : 1)
        });
      }
    });

    alerts.sort((a, b) => b.priority - a.priority);
    setCrmAlerts(alerts);

    if (alerts.length > 0 && !hasAutoShownCrm.current) {
      setShowCrmPopup(true);
      hasAutoShownCrm.current = true;
    }
  };

  const fetchCustomers = async () => {
    const { data } = await supabase.from('customers').select('*').eq('creator_id', currentUser.id).order('created_at', { ascending: false });
    if (data) {
      const decryptedData = data.map(c => ({
        ...c, name: decrypt(c.name), phone: decrypt(c.phone), address: c.address ? decrypt(c.address) : '', memo: c.memo ? decrypt(c.memo) : ''
      }));
      setCustomers(decryptedData);
      checkCrmAlerts(decryptedData);
    }
  };

  useEffect(() => {
    const fetchPurchasers = async () => {
      if (searchType === 'product' && searchKeyword.trim() !== '') {
        const { data } = await supabase.from('purchases').select('customer_id').ilike('product_name', `%${searchKeyword}%`);
        if (data) setPurchasedCustomerIds(data.map(p => p.customer_id));
      } else setPurchasedCustomerIds([]);
    };
    fetchPurchasers();
  }, [searchKeyword, searchType]);

  const filteredCustomers = customers.filter(c => {
    if (searchKeyword.trim() === '') return true;
    if (searchType === 'name') return c.name.includes(searchKeyword);
    if (searchType === 'product') return purchasedCustomerIds.includes(c.id);
    return true;
  });

  const openAddCustomer = () => {
    setEditingCustomerId(null);
    setFormData({ name: '', phone: '', address: '', memo: '' });
    setIsModalOpen(true);
  };

  const openEditCustomer = (e: React.MouseEvent, customer: any) => {
    e.stopPropagation();
    setEditingCustomerId(customer.id);
    setFormData({ name: customer.name, phone: customer.phone, address: customer.address, memo: customer.memo });
    setIsModalOpen(true);
  };

  const handleCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: encrypt(formData.name), phone: encrypt(formData.phone), address: formData.address ? encrypt(formData.address) : '', memo: formData.memo ? encrypt(formData.memo) : ''
    };
    if (editingCustomerId) {
      await supabase.from('customers').update(payload).eq('id', editingCustomerId);
      if (selectedCustomer?.id === editingCustomerId) setSelectedCustomer({ ...selectedCustomer, ...formData });
    } else await supabase.from('customers').insert([{ ...payload, creator_id: currentUser.id }]);
    setIsModalOpen(false);
    fetchCustomers();
  };

  const handleDeleteCustomer = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (window.confirm("정말 이 소비자를 삭제하시겠습니까? 관련된 모든 이력이 삭제됩니다.")) {
      await supabase.from('customers').delete().eq('id', id);
      if (selectedCustomer?.id === id) setSelectedCustomer(null);
      fetchCustomers();
    }
  };

  const openCustomerModal = (customer: any) => {
    setSelectedCustomer(customer);
    setEditingConsultationId(null);
    setConsultationData({ date: today, content: '' });
    setEditingPurchaseId(null);
    setPurchaseData({ date: today, product_name: '', duration: '30' });
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

  useEffect(() => { if (selectedCustomer) fetchHistory(); }, [selectedCustomer]);

  const scrollToTop = () => {
    if (modalScrollRef.current) modalScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleConsultationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { customer_id: selectedCustomer.id, content: encrypt(consultationData.content), created_at: new Date(consultationData.date).toISOString() };
    if (editingConsultationId) await supabase.from('consultations').update(payload).eq('id', editingConsultationId);
    else await supabase.from('consultations').insert([payload]);
    setConsultationData({ date: today, content: '' });
    setEditingConsultationId(null);
    fetchHistory();
    fetchCustomers();
    scrollToTop();
  };

  const editConsultation = (item: any) => {
    setEditingConsultationId(item.id);
    setConsultationData({ date: new Date(item.created_at).toISOString().split('T')[0], content: item.content });
    scrollToTop();
  };

  const deleteConsultation = async (id: number) => {
    if (window.confirm("상담 이력을 삭제하시겠습니까?")) { await supabase.from('consultations').delete().eq('id', id); fetchHistory(); fetchCustomers(); }
  };

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pDate = new Date(purchaseData.date);
    const expiryDate = new Date(pDate);
    expiryDate.setDate(pDate.getDate() + parseInt(purchaseData.duration));

    const payload = {
      customer_id: selectedCustomer.id, product_name: purchaseData.product_name, duration_days: parseInt(purchaseData.duration),
      created_at: pDate.toISOString(), expiry_date: expiryDate.toISOString()
    };

    if (editingPurchaseId) await supabase.from('purchases').update(payload).eq('id', editingPurchaseId);
    else await supabase.from('purchases').insert([payload]);
    setPurchaseData({ date: today, product_name: '', duration: '30' });
    setEditingPurchaseId(null);
    fetchHistory();
    fetchCustomers();
    scrollToTop();
  };

  const editPurchase = (item: any) => {
    setEditingPurchaseId(item.id);
    setPurchaseData({ date: new Date(item.created_at).toISOString().split('T')[0], product_name: item.product_name, duration: item.duration_days.toString() });
    scrollToTop();
  };

  const deletePurchase = async (id: number) => {
    if (window.confirm("구매 이력을 삭제하시겠습니까?")) { await supabase.from('purchases').delete().eq('id', id); fetchHistory(); fetchCustomers(); }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/'); };
  const handleDeleteAccount = async () => {
    if (window.confirm("정말로 탈퇴하시겠습니까? 등록하신 모든 데이터가 삭제됩니다.")) {
      const { error } = await supabase.rpc('delete_user');
      if (!error) { await supabase.auth.signOut(); alert("탈퇴 완료"); router.push('/'); }
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 sm:py-8 font-sans">
      <div className="w-full max-w-md mx-auto bg-slate-50 min-h-screen sm:min-h-[850px] sm:rounded-[2.5rem] shadow-2xl overflow-hidden relative flex flex-col">

        <header className="px-6 pt-10 pb-6 bg-blue-600 text-white shadow-md z-10">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">소비자 관리</h1>
              <p className="text-blue-200 text-sm mt-1">{currentUser?.user_name}님 환영합니다</p>
            </div>
            <div className="flex gap-4 items-center">
              <button onClick={() => setShowCrmPopup(true)} className="relative p-1 active:scale-90 transition-transform">
                <span className="text-2xl">🔔</span>
                {crmAlerts.length > 0 && (
                  <span className="absolute top-0 -right-1 w-5 h-5 bg-red-500 text-white text-[11px] font-bold flex items-center justify-center rounded-full border border-blue-600 shadow-sm">
                    {crmAlerts.length}
                  </span>
                )}
              </button>
              <button onClick={handleDeleteAccount} className="text-blue-300 hover:text-white text-xs">탈퇴</button>
              <button onClick={handleLogout} className="text-white font-bold text-sm">로그아웃</button>
            </div>
          </div>
        </header>

        <div className="p-4 flex-1 overflow-y-auto">
          <div className="mb-6 space-y-3">
            <button onClick={openAddCustomer} className="w-full bg-slate-800 text-white py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-transform text-lg">
              + 새 소비자 등록
            </button>
            <div className="flex gap-2">
              <select className="px-3 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none shrink-0" value={searchType} onChange={(e) => { setSearchType(e.target.value); setSearchKeyword(''); }}>
                <option value="name">이름</option>
                <option value="product">제품</option>
              </select>
              <input type="text" placeholder={searchType === 'name' ? "이름 검색" : "제품명 검색"} className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3 pb-10">
            {filteredCustomers.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 text-slate-400 text-sm">결과가 없습니다.</div>
            ) : (
              filteredCustomers.map((c) => (
                <div key={c.id} onClick={() => openCustomerModal(c)} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center active:bg-blue-50 cursor-pointer transition-colors">
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg">{c.name}</h3>
                    <p className="text-slate-500 text-sm mt-0.5">{c.phone}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={(e) => openEditCustomer(e, c)} className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 rounded-lg text-sm">수정</button>
                    <button onClick={(e) => handleDeleteCustomer(e, c.id)} className="p-2 text-slate-400 hover:text-red-500 bg-slate-50 rounded-lg text-sm">삭제</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 🚨 CRM 알림 팝업 (레이아웃 개선) */}
      {showCrmPopup && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4 z-[60]">
          <div className="bg-white w-full max-w-md max-h-[85vh] overflow-y-auto rounded-t-[2rem] sm:rounded-[2.5rem] p-6 shadow-2xl relative animate-slide-up sm:animate-none flex flex-col">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-5 shrink-0 sm:hidden"></div>

            <div className="flex justify-between items-center mb-2 shrink-0">
              {/* 🚀 수정하신 헤더 반영 */}
              <h2 className="text-2xl font-bold text-slate-900">🚨 알림</h2>
              <button onClick={() => setShowCrmPopup(false)} className="p-2 bg-slate-100 rounded-full text-sm font-bold">닫기</button>
            </div>
            <p className="text-slate-600 text-sm mb-6 shrink-0">
              안부 전화나 제품 재구매 안내가 필요한 소비자 목록입니다.
            </p>

            <div className="space-y-3 overflow-y-auto pb-6">
              {crmAlerts.length === 0 ? (
                <div className="py-10 text-center bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-slate-500 font-bold">🎉 모든 소비자가 잘 관리되고 있습니다!</p>
                </div>
              ) : (
                crmAlerts.map(c => (
                  // 🚀 위/아래 2단 분리로 긴 글자 완벽 대응
                  <div key={`crm-${c.id}`} onClick={() => { setShowCrmPopup(false); openCustomerModal(c); }} className="bg-red-50/50 p-4 rounded-2xl border border-red-100 flex flex-col gap-3 cursor-pointer active:bg-red-100 transition-colors">

                    {/* 1층: 이름과 관리하기 버튼 */}
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-red-900 text-lg">{c.name}</h3>
                      <button className="px-3 py-1.5 bg-white text-red-600 rounded-xl text-xs font-bold shadow-sm border border-red-100 shrink-0">관리하기</button>
                    </div>

                    {/* 2층: 알림 사유 (글자가 길면 자연스럽게 밑으로 내려감) */}
                    <div className="flex flex-col gap-1.5 w-full">
                      {c.reasons.map((r: string, idx: number) => (
                        <span key={idx} className="text-xs font-medium text-red-700 bg-white px-2.5 py-1.5 rounded-lg border border-red-100 shadow-sm break-keep leading-snug w-full">
                          {r}
                        </span>
                      ))}
                    </div>

                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 새 소비자 등록/수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-t-[2rem] sm:rounded-[2.5rem] p-6 pt-8 pb-10 shadow-2xl relative animate-slide-up sm:animate-none">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden"></div>
            <h2 className="text-2xl font-bold text-slate-900 mb-6">{editingCustomerId ? '소비자 정보 수정' : '새 소비자 등록'}</h2>
            <form onSubmit={handleCustomerSubmit} className="space-y-4">
              <input type="text" placeholder="이름" required className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              <input type="text" placeholder="전화번호" required className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
              <input type="text" placeholder="주소 (선택)" className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
              <textarea placeholder="특이사항 메모 (선택)" className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-xl h-24 resize-none outline-none" value={formData.memo} onChange={e => setFormData({...formData, memo: e.target.value})} />
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-xl text-lg">취소</button>
                <button type="submit" className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-xl text-lg">{editingCustomerId ? '수정 완료' : '등록하기'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 소비자 이력 관리 모달 */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4 z-40">
          <div ref={modalScrollRef} className="bg-white w-full max-w-md h-[92vh] sm:h-[800px] overflow-y-auto rounded-t-[2rem] sm:rounded-[2.5rem] p-5 shadow-2xl relative scroll-smooth flex flex-col">

            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 shrink-0 sm:hidden"></div>

            <div className="flex justify-between items-start mb-4 shrink-0">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{selectedCustomer.name}</h2>
                <p className="text-slate-500 mt-0.5">{selectedCustomer.phone}</p>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="p-2 bg-slate-100 rounded-full text-sm font-bold">닫기</button>
            </div>

            {selectedCustomer.address && <p className="text-slate-600 mb-2 text-sm shrink-0">📍 {selectedCustomer.address}</p>}
            {selectedCustomer.memo && <p className="text-slate-600 mb-4 text-sm bg-slate-50 p-3 rounded-xl border border-slate-100 shrink-0">📝 {selectedCustomer.memo}</p>}

            <div className="sticky top-0 z-10 bg-white pb-4 border-b border-slate-100 mb-4 shrink-0 space-y-3">
              <form onSubmit={handleConsultationSubmit} className="bg-blue-50 p-4 rounded-2xl border border-blue-100 space-y-2">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-blue-900 text-sm">{editingConsultationId ? '✏️ 상담 이력 수정' : '💬 상담 기록하기'}</h3>
                </div>
                <div className="flex gap-2 mb-2">
                  <input type="date" required className="w-1/3 px-2 py-2 bg-white border border-blue-200 rounded-lg text-sm outline-none" value={consultationData.date} onChange={e => setConsultationData({...consultationData, date: e.target.value})} />
                  <input type="text" placeholder="상담 내용 입력" required className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm outline-none" value={consultationData.content} onChange={e => setConsultationData({...consultationData, content: e.target.value})} />
                </div>
                <div className="flex gap-2">
                  {editingConsultationId && <button type="button" onClick={() => {setEditingConsultationId(null); setConsultationData({date: today, content: ''});}} className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold">취소</button>}
                  <button type="submit" className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm">{editingConsultationId ? '상담 수정 완료' : '상담 등록'}</button>
                </div>
              </form>

              <form onSubmit={handlePurchaseSubmit} className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 space-y-2">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-emerald-900 text-sm">{editingPurchaseId ? '✏️ 구매 이력 수정' : '🛒 구매 기록하기'}</h3>
                </div>
                <div className="flex gap-2 mb-2">
                  <input type="date" required className="w-1/3 px-2 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none" value={purchaseData.date} onChange={e => setPurchaseData({...purchaseData, date: e.target.value})} />

                  <input
                    list="product-list"
                    type="text"
                    placeholder="제품명 검색"
                    required
                    autoComplete="off"
                    className="flex-1 px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none"
                    value={purchaseData.product_name}
                    onChange={e => setPurchaseData({...purchaseData, product_name: e.target.value})}
                  />
                  <datalist id="product-list">
                    {purchaseData.product_name.length > 0 && productList.map((p) => (
                      <option key={p.id} value={p.name} />
                    ))}
                  </datalist>
                </div>
                <div className="flex gap-2">
                  <select className="w-1/2 px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none" value={purchaseData.duration} onChange={e => setPurchaseData({...purchaseData, duration: e.target.value})}>
                    <option value="15">15일분</option>
                    <option value="30">1개월 (30일)</option>
                    <option value="60">2개월 (60일)</option>
                    <option value="90">3개월 (90일)</option>
                    <option value="120">4개월 (120일)</option>
                    <option value="180">6개월 (180일)</option>
                  </select>
                  {editingPurchaseId && <button type="button" onClick={() => {setEditingPurchaseId(null); setPurchaseData({date: today, product_name: '', duration: '30'});}} className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold">취소</button>}
                  <button type="submit" className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-sm">{editingPurchaseId ? '구매 수정 완료' : '구매 등록'}</button>
                </div>
              </form>
            </div>

            <div className="space-y-6 pb-10">
              <div className="space-y-2">
                <h4 className="font-bold text-slate-700 text-sm flex items-center gap-1"><span className="text-blue-500">💬</span> 지난 상담</h4>
                {history.filter(h => h.type === 'consultation').length === 0 ? (
                  <p className="text-slate-400 text-center py-4 text-xs bg-slate-50 rounded-xl border border-slate-100">상담 내역이 없습니다.</p>
                ) : (
                  history.filter(h => h.type === 'consultation').map((item) => (
                    <div key={`cons-${item.id}`} className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{new Date(item.created_at).toLocaleDateString('ko-KR')}</span>
                        <div className="flex gap-2">
                          <button onClick={() => editConsultation(item)} className="text-[11px] text-slate-400 hover:text-blue-600 font-bold">수정</button>
                          <button onClick={() => deleteConsultation(item.id)} className="text-[11px] text-slate-400 hover:text-red-500 font-bold">삭제</button>
                        </div>
                      </div>
                      <p className="text-slate-800 text-sm whitespace-pre-wrap">{item.content}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-700 text-sm flex items-center gap-1"><span className="text-emerald-500">🛒</span> 지난 구매</h4>
                {history.filter(h => h.type === 'purchase').length === 0 ? (
                  <p className="text-slate-400 text-center py-4 text-xs bg-slate-50 rounded-xl border border-slate-100">구매 내역이 없습니다.</p>
                ) : (
                  history.filter(h => h.type === 'purchase').map((item) => (
                    <div key={`pur-${item.id}`} className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">{new Date(item.created_at).toLocaleDateString('ko-KR')}</span>
                        <div className="flex gap-2">
                          <button onClick={() => editPurchase(item)} className="text-[11px] text-slate-400 hover:text-emerald-600 font-bold">수정</button>
                          <button onClick={() => deletePurchase(item.id)} className="text-[11px] text-slate-400 hover:text-red-500 font-bold">삭제</button>
                        </div>
                      </div>
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-slate-900 font-bold text-sm">{item.product_name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">종료 예정: {new Date(item.expiry_date).toLocaleDateString('ko-KR')}</p>
                        </div>
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-bold">{item.duration_days}일분</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}