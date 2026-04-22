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
  const [consultedCustomerIds, setConsultedCustomerIds] = useState<number[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', address: '', memo: '', birthday: '' });

  const [history, setHistory] = useState<any[]>([]);
  const today = new Date().toISOString().split('T')[0];

  const [editingConsultationId, setEditingConsultationId] = useState<number | null>(null);
  const [consultationData, setConsultationData] = useState({ date: today, content: '' });

  const [editingPurchaseId, setEditingPurchaseId] = useState<number | null>(null);
  const [purchaseData, setPurchaseData] = useState({ date: today, product_name: '', duration: '30' });

  const [crmAlerts, setCrmAlerts] = useState<any[]>([]);
  const [showCrmPopup, setShowCrmPopup] = useState(false);
  const hasAutoShownCrm = useRef(false);

  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const [monthlyStats, setMonthlyStats] = useState({ newCustomers: 0, consultations: 0, purchases: 0 });

  const modalScrollRef = useRef<HTMLDivElement>(null);

  const showAlert = (title: string, message: string) => { setAlertModal({ isOpen: true, title, message }); };
  const showConfirm = (title: string, message: string, onConfirm: () => void) => { setConfirmModal({ isOpen: true, title, message, onConfirm }); };

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push('/');
      const { data: userData } = await supabase.from('partners').select('*').eq('id', session.user.id).single();
      if (userData) setCurrentUser({ ...userData, auth_created_at: session.user.created_at });
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

  const checkCrmAlertsAndStats = async (customersData: any[]) => {
    setCrmAlerts([]);

    const now = new Date();
    const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);
    const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
    const sevenDaysLater = new Date(now); sevenDaysLater.setDate(now.getDate() + 7);
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const newCustCount = customersData.filter(c => new Date(c.created_at) >= firstDayOfMonth).length;

    let alerts: any[] = [];

    if (customersData.length === 0) {
       setMonthlyStats({ newCustomers: 0, consultations: 0, purchases: 0 });
       if (currentUser && currentUser.auth_created_at) {
         const partnerRegDate = new Date(currentUser.auth_created_at);
         if (partnerRegDate < sevenDaysAgo) {
           alerts = [{ id: 'system-msg', name: '🚀 파이팅!', reasons: ['가입하신 지 7일이 지났습니다. 첫 소비자를 등록해 보세요!'], priority: 10, isSystem: true }];
           setCrmAlerts(alerts);
           if (!hasAutoShownCrm.current) { setShowCrmPopup(true); hasAutoShownCrm.current = true; }
         }
       }
       return;
    }

    const cIds = customersData.map(c => c.id);
    const { data: cons } = await supabase.from('consultations').select('customer_id, created_at').in('customer_id', cIds);
    const { data: purs } = await supabase.from('purchases').select('customer_id, created_at, expiry_date, product_name').in('customer_id', cIds);

    const consCount = cons?.filter(c => new Date(c.created_at) >= firstDayOfMonth).length || 0;
    const pursCount = purs?.filter(p => new Date(p.created_at) >= firstDayOfMonth).length || 0;
    setMonthlyStats({ newCustomers: newCustCount, consultations: consCount, purchases: pursCount });

    const lastRegDate = new Date(Math.max(...customersData.map(c => new Date(c.created_at).getTime())));
    if (lastRegDate < sevenDaysAgo) {
      alerts.push({ id: 'system-new-customer', name: '🚀 파이팅!', reasons: ['최근 7일간 신규 소비자 등록이 없었습니다.'], priority: 10, isSystem: true });
    }

    customersData.forEach(customer => {
      const custCons = cons?.filter(c => c.customer_id === customer.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) || [];
      const custPurs = purs?.filter(p => p.customer_id === customer.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) || [];
      let alertReasons: string[] = [];

      if (customer.birthday) {
        const bday = new Date(customer.birthday);
        const thisYearBday = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
        const diffDays = Math.ceil((thisYearBday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) alertReasons.push('🎂 오늘 생일입니다! (D-Day)');
        else if (diffDays > 0 && diffDays <= 3) alertReasons.push(`🎂 생일 ${diffDays}일 전입니다!`);
      }

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
        // 🚀 [수정] r 매개변수의 타입을 string으로 명시했습니다.
        alerts.push({ ...customer, reasons: alertReasons, priority: alertReasons.some((r: string) => r.includes('🎂')) ? 5 : 1 });
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
        ...c,
        name: decrypt(c.name),
        phone: decrypt(c.phone),
        address: c.address ? decrypt(c.address) : '',
        memo: c.memo ? decrypt(c.memo) : '',
        birthday: c.birthday ? decrypt(c.birthday) : ''
      }));
      setCustomers(decryptedData);
      checkCrmAlertsAndStats(decryptedData);
    }
  };

  useEffect(() => {
    const fetchSearchResults = async () => {
      if (searchKeyword.trim() === '') { setPurchasedCustomerIds([]); setConsultedCustomerIds([]); return; }
      if (searchType === 'product') {
        const { data } = await supabase.from('purchases').select('customer_id').ilike('product_name', `%${searchKeyword}%`);
        if (data) setPurchasedCustomerIds(data.map(p => p.customer_id));
      } else if (searchType === 'consultation') {
        const cIds = customers.map(c => c.id);
        const { data } = await supabase.from('consultations').select('customer_id, content').in('customer_id', cIds);
        if (data) {
          const matchedIds = data.filter(item => decrypt(item.content).includes(searchKeyword)).map(item => item.customer_id);
          setConsultedCustomerIds([...new Set(matchedIds)]);
        }
      }
    };
    fetchSearchResults();
  }, [searchKeyword, searchType, customers]);

  const filteredCustomers = customers.filter(c => {
    if (searchKeyword.trim() === '') return true;
    if (searchType === 'name') return c.name.includes(searchKeyword);
    if (searchType === 'product') return purchasedCustomerIds.includes(c.id);
    if (searchType === 'consultation') return consultedCustomerIds.includes(c.id);
    return true;
  });

  const openAddCustomer = () => {
    setEditingCustomerId(null);
    setFormData({ name: '', phone: '', address: '', memo: '', birthday: '' });
    setIsModalOpen(true);
  };

  const openEditCustomer = (e: React.MouseEvent, customer: any) => {
    e.stopPropagation();
    setEditingCustomerId(customer.id);
    setFormData({ name: customer.name, phone: customer.phone, address: customer.address, memo: customer.memo, birthday: customer.birthday || '' });
    setIsModalOpen(true);
  };

  const handleCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: encrypt(formData.name), phone: encrypt(formData.phone), address: formData.address ? encrypt(formData.address) : '', memo: formData.memo ? encrypt(formData.memo) : '', birthday: formData.birthday ? encrypt(formData.birthday) : ''
    };
    if (editingCustomerId) await supabase.from('customers').update(payload).eq('id', editingCustomerId);
    else await supabase.from('customers').insert([{ ...payload, creator_id: currentUser.id }]);
    setIsModalOpen(false);
    fetchCustomers();
  };

  const handleDeleteCustomer = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    showConfirm("⚠️ 소비자 삭제", "상담이력과 구매이력이 모두 삭제됩니다. 삭제하시겠습니까?", async () => {
      await supabase.from('customers').delete().eq('id', id);
      if (selectedCustomer?.id === id) setSelectedCustomer(null);
      fetchCustomers();
      showAlert("완료", "소비자 정보가 삭제되었습니다.");
    });
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

  const scrollToTop = () => { if (modalScrollRef.current) modalScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' }); };

  const handleConsultationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { customer_id: selectedCustomer.id, content: encrypt(consultationData.content), created_at: new Date(consultationData.date).toISOString() };
    if (editingConsultationId) await supabase.from('consultations').update(payload).eq('id', editingConsultationId);
    else await supabase.from('consultations').insert([payload]);
    setConsultationData({ date: today, content: '' });
    setEditingConsultationId(null);
    fetchHistory(); fetchCustomers(); scrollToTop();
  };

  const editConsultation = (item: any) => { setEditingConsultationId(item.id); setConsultationData({ date: new Date(item.created_at).toISOString().split('T')[0], content: item.content }); scrollToTop(); };
  const deleteConsultation = (id: number) => { showConfirm("삭제", "상담 이력을 삭제하시겠습니까?", async () => { await supabase.from('consultations').delete().eq('id', id); fetchHistory(); fetchCustomers(); }); };

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pDate = new Date(purchaseData.date);
    const expiryDate = new Date(pDate);
    expiryDate.setDate(pDate.getDate() + parseInt(purchaseData.duration));
    const payload = { customer_id: selectedCustomer.id, product_name: purchaseData.product_name, duration_days: parseInt(purchaseData.duration), created_at: pDate.toISOString(), expiry_date: expiryDate.toISOString() };
    if (editingPurchaseId) await supabase.from('purchases').update(payload).eq('id', editingPurchaseId);
    else await supabase.from('purchases').insert([payload]);
    setPurchaseData({ date: today, product_name: '', duration: '30' });
    setEditingPurchaseId(null);
    fetchHistory(); fetchCustomers(); scrollToTop();
  };

  const editPurchase = (item: any) => { setEditingPurchaseId(item.id); setPurchaseData({ date: new Date(item.created_at).toISOString().split('T')[0], product_name: item.product_name, duration: item.duration_days.toString() }); scrollToTop(); };
  const deletePurchase = (id: number) => { showConfirm("삭제", "구매 이력을 삭제하시겠습니까?", async () => { await supabase.from('purchases').delete().eq('id', id); fetchHistory(); fetchCustomers(); }); };

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/'); };
  const handleDeleteAccount = () => { showConfirm("⚠️ 회원 탈퇴", "탈퇴 시 모든 데이터가 즉시 삭제되며 복구할 수 없습니다. 정말 탈퇴하시겠습니까?", async () => { const { error } = await supabase.rpc('delete_user'); if (!error) { await supabase.auth.signOut(); router.push('/'); } }); };

  return (
    <div className="min-h-screen bg-slate-100 sm:py-8 font-sans overflow-x-hidden">
      <div className="w-full max-w-md mx-auto bg-slate-50 min-h-screen sm:min-h-[850px] sm:rounded-[2.5rem] shadow-2xl overflow-hidden relative flex flex-col">

        <header className="px-6 pt-10 pb-6 bg-blue-600 text-white shadow-md z-10">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">
                {currentUser?.user_name}님,&nbsp;
                <span className="text-blue-200 font-medium text-lg">환영합니다! 👋</span>
              </h1>
            </div>
            <div className="flex gap-4 items-center">
              {crmAlerts.length > 0 && (
                <button onClick={() => setShowCrmPopup(true)} className="relative p-1 active:scale-90 transition-transform text-2xl">🔔
                  <span className="absolute top-0 -right-1 w-5 h-5 bg-red-500 text-white text-[11px] font-bold flex items-center justify-center rounded-full border border-blue-600 shadow-sm">{crmAlerts.length}</span>
                </button>
              )}
              <button onClick={handleLogout} className="px-3 py-2 bg-blue-700/50 rounded-lg text-white font-bold text-sm hover:bg-blue-700 transition-colors">로그아웃</button>
            </div>
          </div>
        </header>

        <div className="p-4 flex-1 overflow-y-auto flex flex-col">

          <div className="mb-6 grid grid-cols-3 gap-2 shrink-0">
            <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 text-center flex flex-col justify-center">
              <p className="text-[11px] font-bold text-slate-400 mb-1">이번 달 신규</p>
              <p className="text-xl font-extrabold text-blue-600">{monthlyStats.newCustomers}<span className="text-sm font-medium text-slate-500 ml-0.5">명</span></p>
            </div>
            <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 text-center flex flex-col justify-center">
              <p className="text-[11px] font-bold text-slate-400 mb-1">이번 달 상담</p>
              <p className="text-xl font-extrabold text-slate-800">{monthlyStats.consultations}<span className="text-sm font-medium text-slate-500 ml-0.5">건</span></p>
            </div>
            <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 text-center flex flex-col justify-center">
              <p className="text-[11px] font-bold text-slate-400 mb-1">이번 달 구매</p>
              <p className="text-xl font-extrabold text-emerald-600">{monthlyStats.purchases}<span className="text-sm font-medium text-slate-500 ml-0.5">건</span></p>
            </div>
          </div>

          <div className="mb-6 space-y-3 shrink-0">
            <button onClick={openAddCustomer} className="w-full bg-slate-800 text-white py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-transform text-lg">+ 새 소비자 등록</button>
            <div className="flex gap-2">
              <select className="px-3 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none shrink-0" value={searchType} onChange={(e) => { setSearchType(e.target.value); setSearchKeyword(''); }}>
                <option value="name">이름</option><option value="product">제품</option><option value="consultation">상담 내용</option>
              </select>
              <input type="text" placeholder="검색어 입력" className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-500 font-medium outline-none" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3 flex-1">
            {filteredCustomers.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 text-slate-400 text-sm">소비자 목록이 없습니다.</div>
            ) : (
              filteredCustomers.map((c) => (
                <div key={c.id} onClick={() => openCustomerModal(c)} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3 active:bg-blue-50 cursor-pointer">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg mb-0.5">{c.name}</h3>
                      <p className="text-slate-500 text-sm">{c.phone}</p>
                    </div>
                    <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <a href={`tel:${c.phone}`} className="w-9 h-9 flex items-center justify-center bg-green-50 text-green-600 rounded-full border border-green-100 shadow-sm active:bg-green-100 text-lg">📞</a>
                      <a href={`sms:${c.phone}`} className="w-9 h-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-full border border-blue-100 shadow-sm active:bg-blue-100 text-lg">✉️</a>
                    </div>
                  </div>
                  <div className="flex justify-end gap-1 border-t border-slate-50 pt-2 mt-1">
                    <button onClick={(e) => openEditCustomer(e, c)} className="px-3 py-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 rounded-lg text-xs font-bold">정보 수정</button>
                    <button onClick={(e) => handleDeleteCustomer(e, c.id)} className="px-3 py-1.5 text-slate-400 hover:text-red-500 bg-slate-50 rounded-lg text-xs font-bold">삭제</button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-8 pt-6 pb-4 border-t border-slate-200 text-center shrink-0">
            <button onClick={handleDeleteAccount} className="text-[11px] text-slate-400 font-medium underline underline-offset-2 hover:text-slate-600">계정 탈퇴하기</button>
          </div>
        </div>
      </div>

      {alertModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-[100]">
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">{alertModal.title}</h3>
            <p className="text-slate-600 mb-6 leading-relaxed">{alertModal.message}</p>
            <button onClick={() => setAlertModal({ ...alertModal, isOpen: false })} className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform">확인</button>
          </div>
        </div>
      )}

      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-[100]">
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">{confirmModal.title}</h3>
            <p className="text-slate-600 mb-6 leading-relaxed">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })} className="flex-1 py-3.5 bg-slate-100 text-slate-600 font-bold rounded-xl active:bg-slate-200">취소</button>
              <button onClick={() => { confirmModal.onConfirm(); setConfirmModal({ ...confirmModal, isOpen: false }); }} className="flex-1 py-3.5 bg-red-500 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform">삭제</button>
            </div>
          </div>
        </div>
      )}

      {showCrmPopup && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4 z-[60]">
          <div className="bg-white w-full max-w-md max-h-[85vh] overflow-y-auto rounded-t-[2rem] sm:rounded-[2.5rem] p-6 shadow-2xl relative flex flex-col">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h2 className="text-2xl font-bold text-slate-900">🚨 알림</h2>
              <button onClick={() => setShowCrmPopup(false)} className="px-4 py-2 bg-slate-200 rounded-full text-sm font-bold text-slate-800 active:bg-slate-300">닫기</button>
            </div>
            <div className="space-y-3 overflow-y-auto pb-6">
              {crmAlerts.map(c => (
                // 🚀 [수정] r 매개변수의 타입을 string으로 명시했습니다.
                <div key={c.id} onClick={() => { if(!c.isSystem) { setShowCrmPopup(false); openCustomerModal(c); } }} className={`${c.reasons.some((r: string) => r.includes('🎂')) ? 'bg-orange-50 border-orange-100' : (c.isSystem ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100')} p-4 rounded-2xl border flex flex-col gap-3 cursor-pointer`}>
                  <div className="flex justify-between items-center">
                    {/* 🚀 [수정] r 매개변수의 타입을 string으로 명시했습니다. */}
                    <h3 className={`font-bold text-lg ${c.reasons.some((r: string) => r.includes('🎂')) ? 'text-orange-900' : (c.isSystem ? 'text-blue-900' : 'text-red-900')}`}>{c.name}</h3>
                    {!c.isSystem && <button className="px-3 py-1.5 bg-white rounded-xl text-xs font-bold shadow-sm border text-red-600 border-red-100">관리하기</button>}
                  </div>
                  <div className="flex flex-col gap-1.5 w-full">
                    {/* 🚀 [수정] r, idx 매개변수의 타입을 명시했습니다. */}
                    {c.reasons.map((r: string, idx: number) => (
                      <span key={idx} className={`text-xs font-medium bg-white px-2.5 py-1.5 rounded-lg shadow-sm border ${c.isSystem ? 'text-blue-700 border-blue-100' : 'text-red-700 border-red-100'}`}>{r}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-t-[2rem] sm:rounded-[2.5rem] p-6 pt-8 pb-10 shadow-2xl relative">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">{editingCustomerId ? '정보 수정' : '새 소비자 등록'}</h2>
            <form onSubmit={handleCustomerSubmit} className="space-y-3">
              <input type="text" placeholder="이름" required className="w-full px-4 py-4 bg-white border border-slate-200 rounded-xl outline-none text-slate-900 placeholder:text-slate-500 font-medium" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              <input type="tel" placeholder="전화번호" required className="w-full px-4 py-4 bg-white border border-slate-200 rounded-xl outline-none text-slate-900 placeholder:text-slate-500 font-medium" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
              <div className="space-y-1"><label className="text-xs font-bold text-slate-500 ml-1">생일 (알림용)</label><input type="date" className="w-full px-4 py-4 bg-white border border-slate-200 rounded-xl outline-none text-slate-900 font-medium" value={formData.birthday} onChange={e => setFormData({...formData, birthday: e.target.value})} /></div>
              <input type="text" placeholder="주소 (선택)" className="w-full px-4 py-4 bg-white border border-slate-200 rounded-xl outline-none text-slate-900 placeholder:text-slate-500 font-medium" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
              <textarea placeholder="메모" className="w-full px-4 py-4 bg-white border border-slate-200 rounded-xl h-24 resize-none outline-none text-slate-900 placeholder:text-slate-500 font-medium" value={formData.memo} onChange={e => setFormData({...formData, memo: e.target.value})} />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-slate-200 text-slate-800 font-bold rounded-xl">취소</button>
                <button type="submit" className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-xl">{editingCustomerId ? '수정 완료' : '등록하기'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4 z-40">
          <div ref={modalScrollRef} className="bg-white w-full max-w-md h-[92vh] sm:h-[800px] overflow-y-auto rounded-t-[2rem] sm:rounded-[2.5rem] p-5 shadow-2xl relative scroll-smooth flex flex-col">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 shrink-0 sm:hidden"></div>
            <div className="flex justify-between items-start mb-4 shrink-0">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{selectedCustomer.name}</h2>
                <div className="flex items-center gap-3 mt-1.5">
                  <p className="text-slate-500 font-medium">{selectedCustomer.phone}</p>
                  <div className="flex gap-1.5">
                    <a href={`tel:${selectedCustomer.phone}`} className="w-7 h-7 flex items-center justify-center bg-green-50 text-green-600 rounded-full border border-green-100 shadow-sm text-sm">📞</a>
                    <a href={`sms:${selectedCustomer.phone}`} className="w-7 h-7 flex items-center justify-center bg-blue-50 text-blue-600 rounded-full border border-blue-100 shadow-sm text-sm">✉️</a>
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="px-3 py-1.5 bg-slate-200 rounded-full text-sm font-bold text-slate-800 active:bg-slate-300">닫기</button>
            </div>
            {selectedCustomer.address && <p className="text-slate-600 mb-2 text-sm shrink-0">📍 {selectedCustomer.address}</p>}
            {selectedCustomer.memo && <p className="text-slate-600 mb-4 text-sm bg-slate-50 p-3 rounded-xl border border-slate-200 shrink-0">📝 {selectedCustomer.memo}</p>}

            <div className="sticky top-0 z-10 bg-white pb-4 border-b border-slate-100 mb-4 shrink-0 space-y-3">
              <form onSubmit={handleConsultationSubmit} className="bg-blue-50 p-4 rounded-2xl border border-blue-100 space-y-3">
                <h3 className="font-bold text-blue-900 text-sm">{editingConsultationId ? '✏️ 상담 수정' : '💬 상담 기록'}</h3>
                <div className="flex flex-col gap-2"><input type="date" required className="w-full px-3 py-3 bg-white border border-blue-200 rounded-xl text-sm outline-none text-slate-900 font-medium" value={consultationData.date} onChange={e => setConsultationData({...consultationData, date: e.target.value})} /><input type="text" placeholder="상담 내용 입력" required className="w-full px-3 py-3 bg-white border border-blue-200 rounded-xl text-sm outline-none text-slate-900 placeholder:text-slate-500 font-medium" value={consultationData.content} onChange={e => setConsultationData({...consultationData, content: e.target.value})} /></div>
                <div className="flex gap-2 pt-1">{editingConsultationId && <button type="button" onClick={() => {setEditingConsultationId(null); setConsultationData({date: today, content: ''});}} className="flex-1 py-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-700">취소</button>}<button type="submit" className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-sm">{editingConsultationId ? '수정 완료' : '등록하기'}</button></div>
              </form>
              <form onSubmit={handlePurchaseSubmit} className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 space-y-3">
                <h3 className="font-bold text-emerald-900 text-sm">{editingPurchaseId ? '✏️ 구매 수정' : '🛒 구매 기록'}</h3>
                <div className="flex flex-col gap-2"><input type="date" required className="w-full px-3 py-3 bg-white border border-emerald-200 rounded-xl text-sm outline-none text-slate-900 font-medium" value={purchaseData.date} onChange={e => setPurchaseData({...purchaseData, date: e.target.value})} /><input list="product-list" type="text" placeholder="제품명 검색" required autoComplete="off" className="w-full px-3 py-3 bg-white border border-emerald-200 rounded-xl text-sm outline-none text-slate-900 placeholder:text-slate-500 font-medium" value={purchaseData.product_name} onChange={e => setPurchaseData({...purchaseData, product_name: e.target.value})} /><datalist id="product-list">{purchaseData.product_name.length > 0 && productList.map((p) => (<option key={p.id} value={p.name} />))}</datalist></div>
                <div className="flex gap-2 pt-1"><select className="flex-1 px-3 py-3 bg-white border border-emerald-200 rounded-xl text-sm outline-none text-slate-900 font-medium" value={purchaseData.duration} onChange={e => setPurchaseData({...purchaseData, duration: e.target.value})}><option value="15">15일분</option><option value="30">1개월 (30일)</option><option value="60">2개월 (60일)</option><option value="90">3개월 (90일)</option><option value="120">4개월 (120일)</option><option value="180">6개월 (180일)</option></select>{editingPurchaseId && <button type="button" onClick={() => {setEditingPurchaseId(null); setPurchaseData({date: today, product_name: '', duration: '30'});}} className="flex-1 py-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-700">취소</button>}<button type="submit" className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-sm">{editingPurchaseId ? '수정 완료' : '등록하기'}</button></div>
              </form>
            </div>

            <div className="space-y-6 pb-10">
              <div className="space-y-2"><h4 className="font-bold text-slate-700 text-sm flex items-center gap-1"><span className="text-blue-500">💬</span> 지난 상담</h4>{history.filter(h => h.type === 'consultation').length === 0 ? (<p className="text-slate-400 text-center py-4 text-xs bg-slate-50 rounded-xl border border-slate-200">상담 내역 없음</p>) : (history.filter(h => h.type === 'consultation').map((item) => (<div key={`cons-${item.id}`} className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm"><div className="flex justify-between items-center mb-2"><span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">{new Date(item.created_at).toLocaleDateString('ko-KR')}</span><div className="flex gap-2"><button onClick={() => editConsultation(item)} className="text-xs text-slate-500 font-bold">수정</button><button onClick={() => deleteConsultation(item.id)} className="text-xs text-slate-500 font-bold">삭제</button></div></div><p className="text-slate-800 text-sm whitespace-pre-wrap leading-relaxed">{item.content}</p></div>)))}</div>
              <div className="space-y-2"><h4 className="font-bold text-slate-700 text-sm flex items-center gap-1"><span className="text-emerald-500">🛒</span> 지난 구매</h4>{history.filter(h => h.type === 'purchase').length === 0 ? (<p className="text-slate-400 text-center py-4 text-xs bg-slate-50 rounded-xl border border-slate-200">구매 내역 없음</p>) : (history.filter(h => h.type === 'purchase').map((item) => (<div key={`pur-${item.id}`} className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm"><div className="flex justify-between items-center mb-2"><span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">{new Date(item.created_at).toLocaleDateString('ko-KR')}</span><div className="flex gap-2"><button onClick={() => editPurchase(item)} className="text-xs text-slate-500 font-bold">수정</button><button onClick={() => deletePurchase(item.id)} className="text-xs text-slate-500 font-bold">삭제</button></div></div><div className="flex justify-between items-end"><div><p className="text-slate-900 font-bold text-base">{item.product_name}</p><p className="text-xs text-slate-500 mt-1">종료 예정: {new Date(item.expiry_date).toLocaleDateString('ko-KR')}</p></div><span className="text-sm bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg font-bold">{item.duration_days}일분</span></div></div>)))}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}