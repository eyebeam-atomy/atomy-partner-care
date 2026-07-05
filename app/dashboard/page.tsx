'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { encrypt, decrypt } from '@/lib/crypto';
import { useRouter } from 'next/navigation';
import { buildCrmAlertsAndStats } from '@/lib/notificationLogic';

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
  const [historyGroups, setHistoryGroups] = useState<any[]>([]);
  const [isPwdModalOpen, setIsPwdModalOpen] = useState(false);
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [isSavingNotification, setIsSavingNotification] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState({
    birthday_alert: true,
    meeting_alert: true,
    consultation_alert: true,
    purchase_alert: true,
    expiry_alert: true,
    new_customer_alert: true,
    daily_push_enabled: true,
    daily_push_time: '08:00',
    push_subscription: null as any
  });

  const getKSTDate = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const kstDate = new Date(now.getTime() - offset);
    return kstDate.toISOString().split('T')[0];
  };
  const today = getKSTDate();

  const [editingConsultationId, setEditingConsultationId] = useState<number | null>(null);
  const [consultationData, setConsultationData] = useState({ date: today, content: '', next_meeting_date: '' });
  const [editingPurchaseId, setEditingPurchaseId] = useState<number | null>(null);
  const [purchaseData, setPurchaseData] = useState({ date: today, duration: '30' });
  const productNameRef = useRef<HTMLInputElement>(null);
  const [crmAlerts, setCrmAlerts] = useState<any[]>([]);
  const [showCrmPopup, setShowCrmPopup] = useState(false);
  const [hasReadTodayNotifications, setHasReadTodayNotifications] = useState(false);
  const hasAutoShownCrm = useRef(false);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [monthlyStats, setMonthlyStats] = useState({ newCustomers: 0, consultations: 0, purchases: 0 });
  const modalScrollRef = useRef<HTMLDivElement>(null);

  const showAlert = (title: string, message: string) => { setAlertModal({ isOpen: true, title, message }); };
  const showConfirm = (title: string, message: string, onConfirm: () => void) => { setConfirmModal({ isOpen: true, title, message, onConfirm }); };

  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
      showConfirm("로그아웃", "로그아웃 하시겠습니까?", async () => {
        await supabase.auth.signOut();
        router.replace('/');
      });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push('/');

      const { data: userData } = await supabase.from('partners').select('*').eq('id', session.user.id).single();

      if (userData) {
        setCurrentUser({ ...userData, auth_created_at: session.user.created_at });

        // 🚀 [추가됨] 자동 출석 체크 (방문 통계 센서)
        const sessionKey = `visited_${today}`;
        if (!sessionStorage.getItem(sessionKey)) {
          const { data: existingLog } = await supabase
            .from('visit_logs')
            .select('*')
            .eq('partner_id', session.user.id)
            .eq('visit_date', today)
            .single();

          if (existingLog) {
            // 오늘 온 적 있으면 방문 횟수(count) + 1
            await supabase.from('visit_logs')
              .update({
                visit_count: existingLog.visit_count + 1,
                last_visited_at: new Date().toISOString()
              })
              .eq('id', existingLog.id);
          } else {
            // 오늘 처음 왔으면 새로 한 줄 추가
            await supabase.from('visit_logs')
              .insert([{ partner_id: session.user.id, visit_date: today }]);
          }
          // 이번 창에서는 도장 찍었음을 브라우저에 기억시킴 (새로고침 도배 방지)
          sessionStorage.setItem(sessionKey, 'true');
        }
      } else {
        router.push('/');
      }
    };

    checkUser();

    const fetchProducts = async () => {
      const { data } = await supabase.from('products').select('*');
      if (data) setProductList(data);
    };
    fetchProducts();
  }, [router]);

  useEffect(() => {
    if (currentUser) {
      fetchCustomers();
      fetchNotificationSettings();
    }
  }, [currentUser]);

  const handleChangePassword = async () => {
    if (newPwd.length < 8) return showAlert("입력 오류", "비밀번호는 8자리 이상이어야 합니다.");
    if (newPwd !== confirmPwd) return showAlert("일치 확인", "비밀번호와 확인 칸의 입력이 서로 다릅니다.");
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    if (error) showAlert("변경 실패", error.message);
    else {
      showAlert("🎉 완료", "비밀번호가 성공적으로 변경되었습니다.");
      setIsPwdModalOpen(false); setNewPwd(''); setConfirmPwd('');
    }
  };

  const fetchNotificationSettings = async () => {
    if (!currentUser?.id) return;

    const { data, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('partner_id', currentUser.id)
      .maybeSingle();

    if (error) {
      console.error('알림 설정 조회 실패:', error);
      return;
    }

    if (data) {
      setNotificationSettings({
        birthday_alert: data.birthday_alert ?? true,
        meeting_alert: data.meeting_alert ?? true,
        consultation_alert: data.consultation_alert ?? true,
        purchase_alert: data.purchase_alert ?? true,
        expiry_alert: data.expiry_alert ?? true,
        new_customer_alert: data.new_customer_alert ?? true,
        daily_push_enabled: data.daily_push_enabled ?? true,
        daily_push_time: '08:00',
        push_subscription: data.push_subscription ?? null
      });
    }
  };

  const toggleNotificationSetting = (key: keyof typeof notificationSettings) => {
    setNotificationSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveNotificationSettings = async () => {
    if (!currentUser?.id) return showAlert('저장 실패', '로그인 정보를 확인할 수 없습니다.');

    setIsSavingNotification(true);

    const payload = {
      partner_id: currentUser.id,
      birthday_alert: notificationSettings.birthday_alert,
      meeting_alert: notificationSettings.meeting_alert,
      consultation_alert: notificationSettings.consultation_alert,
      purchase_alert: notificationSettings.purchase_alert,
      expiry_alert: notificationSettings.expiry_alert,
      new_customer_alert: notificationSettings.new_customer_alert,
      daily_push_enabled: notificationSettings.daily_push_enabled,
      daily_push_time: '08:00',
      push_subscription: notificationSettings.push_subscription,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('notification_settings')
      .upsert(payload, { onConflict: 'partner_id' });

    setIsSavingNotification(false);

    if (error) {
      console.error('알림 설정 저장 실패:', error);
      return showAlert('저장 실패', error.message);
    }

    setIsNotificationModalOpen(false);
    showAlert('저장 완료', '알림 설정이 저장되었습니다.');
  };

  const fetchTodayNotificationReadStatus = async () => {
    if (!currentUser?.id) return false;

    const { data, error } = await supabase
      .from('notification_reads')
      .select('partner_id')
      .eq('partner_id', currentUser.id)
      .eq('read_date', today)
      .maybeSingle();

    if (error) {
      console.error('종 알림 읽음 조회 실패:', error);
      return false;
    }

    const isRead = !!data;
    setHasReadTodayNotifications(isRead);
    return isRead;
  };

  const markTodayNotificationsAsRead = async () => {
    if (!currentUser?.id) return;

    setHasReadTodayNotifications(true);

    const { error } = await supabase
      .from('notification_reads')
      .upsert(
        {
          partner_id: currentUser.id,
          read_date: today,
          read_at: new Date().toISOString()
        },
        { onConflict: 'partner_id,read_date' }
      );

    if (error) {
      console.error('종 알림 읽음 저장 실패:', error);
      setHasReadTodayNotifications(false);
    }
  };

  const openCrmPopup = async () => {
    if (crmAlerts.length === 0) return;
    setShowCrmPopup(true);
    await markTodayNotificationsAsRead();
  };

  const checkCrmAlertsAndStats = async (customersData: any[]) => {
    setCrmAlerts([]);

    const { alerts, monthlyStats } = await buildCrmAlertsAndStats(supabase, customersData);

    setMonthlyStats(monthlyStats);
    setCrmAlerts(alerts);

    const alreadyReadToday = await fetchTodayNotificationReadStatus();

    if (!hasAutoShownCrm.current) {
      if (alerts.length > 0 && !alreadyReadToday) {
        setShowCrmPopup(true);
        await markTodayNotificationsAsRead();
      }
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
    const payload = { name: encrypt(formData.name), phone: encrypt(formData.phone), address: formData.address ? encrypt(formData.address) : '', memo: formData.memo ? encrypt(formData.memo) : '', birthday: formData.birthday ? encrypt(formData.birthday) : '' };
    if (editingCustomerId) await supabase.from('customers').update(payload).eq('id', editingCustomerId);
    else await supabase.from('customers').insert([{ ...payload, creator_id: currentUser.id }]);
    setIsModalOpen(false); fetchCustomers();
  };

  const handleDeleteCustomer = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    showConfirm("⚠️ 소비자 삭제", "상담이력과 구매이력이 모두 삭제됩니다. 삭제하시겠습니까?", async () => {
      await supabase.from('customers').delete().eq('id', id);
      if (selectedCustomer?.id === id) setSelectedCustomer(null);
      fetchCustomers(); showAlert("완료", "소비자 정보가 삭제되었습니다.");
    });
  };

  const openCustomerModal = (customer: any) => {
    setSelectedCustomer(customer);
    setEditingConsultationId(null);
    setConsultationData({ date: today, content: '', next_meeting_date: '' });
    setEditingPurchaseId(null);
    setPurchaseData({ date: today, duration: '30' });
    if (productNameRef.current) productNameRef.current.value = '';
  };

  const fetchHistory = async () => {
    if (!selectedCustomer) return;
    const { data: cons } = await supabase.from('consultations').select('*').eq('customer_id', selectedCustomer.id);
    const { data: purs } = await supabase.from('purchases').select('*').eq('customer_id', selectedCustomer.id);
    const combined = [...(cons?.map(i => ({ ...i, type: 'consultation', content: decrypt(i.content) })) || []), ...(purs?.map(i => ({ ...i, type: 'purchase' })) || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const groups: any[] = [];
    combined.forEach(item => {
      const dateKey = new Date(item.created_at).toLocaleDateString('ko-KR');
      const existingGroup = groups.find(g => g.date === dateKey);
      if (existingGroup) existingGroup.items.push(item);
      else groups.push({ date: dateKey, items: [item] });
    });
    setHistoryGroups(groups);
  };

  useEffect(() => { if (selectedCustomer) fetchHistory(); }, [selectedCustomer]);

  const scrollToTop = () => { if (modalScrollRef.current) modalScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' }); };

  const handleConsultationSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!consultationData.content.trim()) return showAlert("내용 입력", "상담 내용을 입력해주세요.");
    const payload = { customer_id: selectedCustomer.id, content: encrypt(consultationData.content), created_at: new Date(consultationData.date).toISOString(), next_meeting_date: consultationData.next_meeting_date || null };
    if (editingConsultationId) await supabase.from('consultations').update(payload).eq('id', editingConsultationId);
    else await supabase.from('consultations').insert([payload]);
    setConsultationData({ date: today, content: '', next_meeting_date: '' });
    setEditingConsultationId(null);
    fetchHistory(); fetchCustomers(); scrollToTop();
  };

  const editConsultation = (item: any) => {
    setEditingConsultationId(item.id);
    setConsultationData({ date: new Date(item.created_at).toISOString().split('T')[0], content: item.content, next_meeting_date: item.next_meeting_date || '' });
    scrollToTop();
  };

  const deleteConsultation = (id: number) => { showConfirm("삭제", "상담 이력을 삭제하시겠습니까?", async () => { await supabase.from('consultations').delete().eq('id', id); fetchHistory(); fetchCustomers(); }); };

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pDate = new Date(purchaseData.date);
    const expiryDate = new Date(pDate);
    expiryDate.setDate(pDate.getDate() + parseInt(purchaseData.duration));
    const productName = productNameRef.current?.value || '';
    if (!productName) return showAlert("입력 확인", "제품명을 입력해주세요.");
    const payload = { customer_id: selectedCustomer.id, product_name: productName, duration_days: parseInt(purchaseData.duration), created_at: pDate.toISOString(), expiry_date: expiryDate.toISOString() };
    if (editingPurchaseId) await supabase.from('purchases').update(payload).eq('id', editingPurchaseId);
    else await supabase.from('purchases').insert([payload]);
    setPurchaseData({ date: today, duration: '30' });
    if (productNameRef.current) productNameRef.current.value = '';
    setEditingPurchaseId(null);
    fetchHistory(); fetchCustomers(); scrollToTop();
  };

  const editPurchase = (item: any) => {
    setEditingPurchaseId(item.id);
    setPurchaseData({ date: new Date(item.created_at).toISOString().split('T')[0], duration: item.duration_days.toString() });
    if (productNameRef.current) productNameRef.current.value = item.product_name;
    scrollToTop();
  };

  const deletePurchase = (id: number) => { showConfirm("삭제", "구매 이력을 삭제하시겠습니까?", async () => { await supabase.from('purchases').delete().eq('id', id); fetchHistory(); fetchCustomers(); }); };

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/'); };
  const handleDeleteAccount = () => { showConfirm("⚠️ 회원 탈퇴", "탈퇴 시 모든 데이터가 즉시 삭제됩니다.", async () => { const { error } = await supabase.rpc('delete_user'); if (!error) { await supabase.auth.signOut(); router.push('/'); } }); };

  return (
    <div className="min-h-screen bg-slate-100 sm:py-8 font-sans overflow-x-hidden">
      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator { background: transparent; bottom: 0; color: transparent; cursor: pointer; height: auto; left: 0; position: absolute; right: 0; top: 0; width: auto; }
      `}</style>
      <div className="w-full max-w-md mx-auto bg-slate-50 min-h-screen sm:min-h-[850px] sm:rounded-[2.5rem] shadow-2xl overflow-hidden relative flex flex-col">

        <header className="px-6 pt-12 pb-6 bg-blue-600 text-white shadow-md z-10">
          <div className="flex flex-col gap-4">

            {/* 🚀 [해결 완료] 1단: 환영 인사 & 총단장님 전용 전체 관리 버튼 (오른쪽 끝으로 이동!) */}
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight truncate">
                {currentUser?.user_name}님, <span className="text-blue-200 font-medium text-lg">환영합니다! 👋</span>
              </h1>

              {/* 총단장님 VIP 마스터 키 */}
              {currentUser?.user_id === '01093693777' && (
                <button onClick={() => router.push('/admin')} className="whitespace-nowrap px-3 py-2 bg-amber-500 hover:bg-amber-400 rounded-xl text-white font-bold text-[11px] transition-colors shadow-lg animate-pulse flex items-center shrink-0">
                  🛠️ 전체 관리
                </button>
              )}
            </div>

            {/* 2단: 관리 도구 (다시 3구역 정렬로 깔끔하게 복구) */}
            <div className="flex items-center justify-between bg-blue-700/30 p-2 rounded-2xl border border-blue-500/30">

              {/* 왼쪽: 암호변경 (이제 넓게 혼자 씁니다!) */}
              <div className="flex-1 flex justify-start">
                <button onClick={() => setIsPwdModalOpen(true)} className="whitespace-nowrap px-3 py-2 bg-blue-500/50 hover:bg-blue-500 rounded-xl text-white font-bold text-xs transition-colors flex items-center gap-1">
                  🔒 암호변경
                </button>
              </div>

              {/* 가운데: 알림 종 + 알림 설정 */}
              <div className="flex-1 flex justify-center items-center gap-1">
                <button
                  onClick={openCrmPopup}
                  className={`relative p-2 rounded-xl transition-all active:scale-90 ${crmAlerts.length > 0 ? 'bg-white/20' : 'opacity-30'}`}
                >
                  <span className="text-xl">🔔</span>
                  {crmAlerts.length > 0 && !hasReadTodayNotifications && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-extrabold flex items-center justify-center rounded-full border-2 border-blue-600 shadow-sm">
                      {crmAlerts.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setIsNotificationModalOpen(true)}
                  className="whitespace-nowrap px-2.5 py-2 bg-white/15 hover:bg-white/25 rounded-xl text-white font-bold text-[11px] transition-colors active:scale-95"
                >
                  ⚙️ 설정
                </button>
              </div>

              {/* 오른쪽: 로그아웃 */}
              <div className="flex-1 flex justify-end">
                <button onClick={handleLogout} className="whitespace-nowrap px-4 py-2 bg-white text-blue-600 rounded-xl font-extrabold text-xs shadow-sm hover:bg-blue-50 transition-colors">
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* 비밀번호 변경 모달 */}
        {isPwdModalOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-[110]">
            <div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl">
              <h3 className="text-xl font-bold text-slate-900 mb-4 text-center">비밀번호 변경</h3>
              <p className="text-xs text-slate-500 mb-4 text-center">보안을 위해 **8자리 이상** 입력해 주세요.</p>
              <div className="space-y-3 mb-6">
                <input type="password" placeholder="새 비밀번호 (8자 이상)" className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 font-medium text-center" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
                <input type="password" placeholder="비밀번호 확인" className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-900 font-medium text-center" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
                {newPwd && confirmPwd && newPwd !== confirmPwd && <p className="text-red-500 text-[11px] font-bold text-center">❗ 비밀번호가 서로 일치하지 않습니다.</p>}
                {newPwd && confirmPwd && newPwd === confirmPwd && <p className="text-emerald-600 text-[11px] font-bold text-center">✅ 비밀번호가 일치합니다.</p>}
              </div>
              <div className="flex gap-3">
                <button onClick={() => {setIsPwdModalOpen(false); setNewPwd(''); setConfirmPwd('');}} className="flex-1 py-3.5 bg-slate-100 text-slate-600 font-bold rounded-xl active:bg-slate-200">취소</button>
                <button onClick={handleChangePassword} className="flex-1 py-3.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform disabled:opacity-50" disabled={newPwd !== confirmPwd || newPwd.length < 8}>변경하기</button>
              </div>
            </div>
          </div>
        )}

        {/* 나머지 대시보드 콘텐츠 */}
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
            {filteredCustomers.length === 0 ? (<div className="text-center py-10 bg-white rounded-2xl border border-slate-200 text-slate-400 text-sm">소비자 목록이 없습니다.</div>) : (
              filteredCustomers.map((c) => (
                <div key={c.id} onClick={() => openCustomerModal(c)} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3 active:bg-blue-50 cursor-pointer">
                  <div className="flex justify-between items-start">
                    <div><h3 className="font-bold text-slate-900 text-lg mb-0.5">{c.name}</h3><p className="text-slate-500 text-sm">{c.phone}</p></div>
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


      {isNotificationModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 z-[115]">
          <div className="bg-white w-full max-w-md rounded-t-[2rem] sm:rounded-[2.5rem] p-6 pt-8 pb-8 shadow-2xl relative">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-900">알림 설정</h2>
              <button onClick={() => setIsNotificationModalOpen(false)} className="px-3 py-1.5 bg-slate-200 rounded-full text-sm font-bold text-slate-800 active:bg-slate-300">닫기</button>
            </div>

            <div className="space-y-3">
              {[
                { key: 'birthday_alert', label: '생일 알림' },
                { key: 'meeting_alert', label: '미팅 알림' },
                { key: 'consultation_alert', label: '상담 7일 경과' },
                { key: 'purchase_alert', label: '구매 30일 미구매' },
                { key: 'expiry_alert', label: '제품 만료' },
                { key: 'new_customer_alert', label: '신규 소비자 7일 없음' }
              ].map(item => (
                <label key={item.key} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 cursor-pointer active:bg-blue-50">
                  <span className="text-slate-800 font-bold text-sm">{item.label}</span>
                  <input
                    type="checkbox"
                    checked={notificationSettings[item.key as keyof typeof notificationSettings] as boolean}
                    onChange={() => toggleNotificationSetting(item.key as keyof typeof notificationSettings)}
                    className="w-5 h-5 accent-blue-600"
                  />
                </label>
              ))}
            </div>

            <div className="my-6 border-t border-slate-200"></div>

            <div className="space-y-3">
              <label className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 cursor-pointer active:bg-blue-100">
                <span className="text-blue-900 font-extrabold text-sm">매일 오전 8시 푸시 받기</span>
                <input
                  type="checkbox"
                  checked={notificationSettings.daily_push_enabled}
                  onChange={() => toggleNotificationSetting('daily_push_enabled')}
                  className="w-5 h-5 accent-blue-600"
                />
              </label>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
                <p className="text-[11px] font-bold text-slate-500 mb-1">푸시 시간</p>
                <p className="text-slate-900 font-extrabold text-sm">매일 오전 8시</p>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">오늘 확인할 CRM이 있을 때만 푸시가 발송됩니다.</p>
              </div>
            </div>

            <button
              onClick={handleSaveNotificationSettings}
              disabled={isSavingNotification}
              className="w-full mt-6 py-4 bg-blue-600 disabled:bg-slate-300 text-white font-bold rounded-2xl shadow-lg active:scale-95 transition-transform"
            >
              {isSavingNotification ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}

      {alertModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-[120]">
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">{alertModal.title}</h3>
            <p className="text-slate-600 mb-6 leading-relaxed">{alertModal.message}</p>
            <button onClick={() => setAlertModal({ ...alertModal, isOpen: false })} className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform">확인</button>
          </div>
        </div>
      )}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-[120]">
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
            <div className="flex justify-between items-center mb-4 shrink-0"><h2 className="text-2xl font-bold text-slate-900">🚨 알림</h2><button onClick={() => setShowCrmPopup(false)} className="px-4 py-2 bg-slate-200 rounded-full text-sm font-bold text-slate-800 active:bg-slate-300">닫기</button></div>
            <div className="space-y-3 overflow-y-auto pb-6">
              {crmAlerts.map(c => (
                <div key={c.id} onClick={() => { if(!c.isSystem) { setShowCrmPopup(false); openCustomerModal(c); } }} className={`${c.priority >= 5 ? 'bg-orange-50 border-orange-100' : (c.isSystem ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100')} p-4 rounded-2xl border flex flex-col gap-3 cursor-pointer`}>
                  <div className="flex justify-between items-center"><h3 className={`font-bold text-lg ${c.priority >= 5 ? 'text-orange-900' : (c.isSystem ? 'text-blue-900' : 'text-red-900')}`}>{c.name}</h3>{!c.isSystem && <button className="px-3 py-1.5 bg-white rounded-xl text-xs font-bold shadow-sm border text-red-600 border-red-100">관리하기</button>}</div>
                  <div className="flex flex-col gap-1.5 w-full">{c.reasons.map((r: string, idx: number) => (<span key={idx} className={`text-xs font-medium bg-white px-2.5 py-1.5 rounded-lg shadow-sm border ${c.isSystem ? 'text-blue-700 border-blue-100' : 'text-red-700 border-red-100'}`}>{r}</span>))}</div>
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
              <input type="text" placeholder="이름" required className="w-full px-4 py-4 bg-white border border-slate-200 rounded-xl outline-none text-slate-900 font-medium" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              <input type="tel" placeholder="전화번호" required className="w-full px-4 py-4 bg-white border border-slate-200 rounded-xl outline-none text-slate-900 font-medium" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
              <div className="space-y-1"><label className="text-[11px] font-bold text-slate-500 ml-1">생일 (알림용)</label><div className="relative"><input type="date" className={`w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none text-slate-900 font-medium ${!formData.birthday ? 'text-transparent' : ''}`} value={formData.birthday} onChange={e => setFormData({...formData, birthday: e.target.value})} />{!formData.birthday && <div className="absolute inset-0 flex items-center px-4 pointer-events-none text-slate-400 text-sm font-medium">연도-월-일 선택</div>}<div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-lg">📅</div></div></div>
              <input type="text" placeholder="주소 (선택)" className="w-full px-4 py-4 bg-white border border-slate-200 rounded-xl outline-none text-slate-900 font-medium" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
              <textarea placeholder="메모(소비자 특징)" className="w-full px-4 py-4 bg-white border border-slate-200 rounded-xl h-24 resize-none outline-none text-slate-900 font-medium" value={formData.memo} onChange={e => setFormData({...formData, memo: e.target.value})} />
              <div className="flex gap-3 pt-2"><button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-slate-200 text-slate-800 font-bold rounded-xl">취소</button><button type="submit" className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-xl">{editingCustomerId ? '수정 완료' : '등록하기'}</button></div>
            </form>
          </div>
        </div>
      )}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4 z-40">
          <div ref={modalScrollRef} className="bg-white w-full max-w-md h-[92vh] sm:h-[800px] overflow-y-auto rounded-t-[2rem] sm:rounded-[2.5rem] p-5 shadow-2xl relative scroll-smooth flex flex-col">
            <div className="sticky top-0 z-20 bg-white -mx-5 px-5 -mt-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 shrink-0 sm:hidden"></div>
              <div className="flex justify-between items-start mb-2">
                <div><h2 className="text-2xl font-bold text-slate-900">{selectedCustomer.name}</h2><div className="flex items-center gap-3 mt-1.5"><p className="text-slate-500 font-medium">{selectedCustomer.phone}</p><div className="flex gap-1.5"><a href={`tel:${selectedCustomer.phone}`} className="w-7 h-7 flex items-center justify-center bg-green-50 text-green-600 rounded-full border border-green-100 text-sm">📞</a><a href={`sms:${selectedCustomer.phone}`} className="w-7 h-7 flex items-center justify-center bg-blue-50 text-blue-600 rounded-full border border-blue-100 shadow-sm text-sm">✉️</a></div></div></div>
                <button onClick={() => setSelectedCustomer(null)} className="px-3 py-1.5 bg-slate-200 rounded-full text-sm font-bold text-slate-800 active:bg-slate-300">닫기</button>
              </div>
              <div className="space-y-2 mt-1">
                {selectedCustomer.address && (<p className="text-[12px] text-slate-500 flex items-center gap-1"><span className="grayscale opacity-70">📍</span> {selectedCustomer.address}</p>)}
                {selectedCustomer.memo && (<div className="bg-blue-50/50 border border-blue-100/50 rounded-2xl p-3 shadow-sm"><p className="text-[13px] text-blue-800 leading-relaxed"><span className="mr-1">📝</span> {selectedCustomer.memo}</p></div>)}
              </div>
            </div>
            <div className="mt-4 mb-6 shrink-0 space-y-3">
              <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 space-y-3">
                <h3 className="font-bold text-blue-900 text-sm">{editingConsultationId ? '✏️ 상담 수정' : '💬 상담 기록'}</h3>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1"><label className="text-[10px] font-bold text-blue-600 ml-1">상담일</label><div className="relative"><input type="date" className="w-full px-3 py-3 bg-white border border-blue-200 rounded-xl text-sm outline-none text-slate-900 font-medium" value={consultationData.date} onChange={e => setConsultationData({...consultationData, date: e.target.value})} /><div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-sm">📅</div></div></div>
                    <div className="flex-1 space-y-1"><label className="text-[10px] font-bold text-blue-600 ml-1">다음 미팅일</label><div className="relative"><input type="date" className={`w-full px-3 py-3 bg-white border border-blue-200 rounded-xl text-sm outline-none text-slate-900 font-medium ${!consultationData.next_meeting_date ? 'text-transparent' : ''}`} value={consultationData.next_meeting_date} onChange={e => setConsultationData({...consultationData, next_meeting_date: e.target.value})} />{!consultationData.next_meeting_date && <div className="absolute inset-0 flex items-center px-3 pointer-events-none text-slate-400 text-[11px] font-medium">연도-월-일 선택</div>}<div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-sm">📅</div></div></div>
                  </div>
                  <textarea placeholder="상담 내용 입력 (엔터는 줄바꿈)" className="w-full px-3 py-3 bg-white border border-blue-200 rounded-xl text-sm outline-none text-slate-900 font-medium h-20 resize-none" value={consultationData.content} onChange={e => setConsultationData({...consultationData, content: e.target.value})} />
                </div>
                <div className="flex gap-2 pt-1">{editingConsultationId && <button type="button" onClick={() => {setEditingConsultationId(null); setConsultationData({date: today, content: '', next_meeting_date: ''});}} className="flex-1 py-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-700">취소</button>}<button onClick={() => handleConsultationSubmit()} className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-sm">{editingConsultationId ? '수정 완료' : '등록하기'}</button></div>
              </div>
              <form onSubmit={handlePurchaseSubmit} className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 space-y-3">
                <h3 className="font-bold text-emerald-900 text-sm">{editingPurchaseId ? '✏️ 구매 수정' : '🛒 구매 기록'}</h3>
                <div className="flex flex-col gap-2"><div className="relative"><input type="date" required className="w-full px-3 py-3 bg-white border border-emerald-200 rounded-xl text-sm outline-none text-slate-900 font-medium" value={purchaseData.date} onChange={e => setPurchaseData({...purchaseData, date: e.target.value})} /><div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-sm">📅</div></div><input list="product-list" type="text" ref={productNameRef} placeholder="제품명 입력 (예: 헤모힘)" required autoComplete="off" className="w-full px-4 py-4 bg-white border border-emerald-200 rounded-xl outline-none text-slate-900 font-medium" /><datalist id="product-list">{productList.map((p) => (<option key={p.id} value={p.name} />))}</datalist></div>
                <div className="flex gap-2 pt-1"><select className="flex-1 px-3 py-3 bg-white border border-emerald-200 rounded-xl text-sm outline-none text-slate-900 font-medium" value={purchaseData.duration} onChange={e => setPurchaseData({...purchaseData, duration: e.target.value})}><option value="15">15일분</option><option value="30">1개월 (30일)</option><option value="60">2개월 (60일)</option><option value="90">3개월 (90일)</option><option value="120">4개월 (120일)</option><option value="180">6개월 (180일)</option></select>{editingPurchaseId && <button type="button" onClick={() => {setEditingPurchaseId(null); setPurchaseData({date: today, duration: '30'}); if(productNameRef.current) productNameRef.current.value = '';}} className="flex-1 py-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-700">취소</button>}<button type="submit" className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-sm">{editingPurchaseId ? '수정 완료' : '등록하기'}</button></div>
              </form>
            </div>
            <div className="space-y-6 pb-10">
              <h4 className="font-bold text-slate-700 text-sm flex items-center gap-1">📜 통합 활동 이력</h4>
              {historyGroups.length === 0 ? (<p className="text-slate-400 text-center py-10 text-sm bg-slate-50 rounded-2xl border border-dashed border-slate-200">아직 활동 이력이 없습니다.</p>) : (
                historyGroups.map((group) => (
                  <div key={group.date} className="relative pl-4 border-l-2 border-blue-100 ml-2 space-y-3">
                    <div className="absolute -left-[9px] top-0 w-4 h-4 bg-blue-600 rounded-full border-4 border-white shadow-sm"></div>
                    <span className="text-sm font-extrabold text-blue-600 mb-2 block">{group.date}</span>
                    <div className="space-y-2">
                      {group.items.map((item: any) => (
                        <div key={`${item.type}-${item.id}`} className={`p-4 rounded-xl border shadow-sm ${item.type === 'consultation' ? 'bg-white border-slate-200' : 'bg-emerald-50/30 border-emerald-100'}`}>
                          <div className="flex justify-between items-start mb-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${item.type === 'consultation' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-100 text-emerald-700'}`}>{item.type === 'consultation' ? '상담' : '구매'}</span>
                            <div className="flex gap-2"><button onClick={() => item.type === 'consultation' ? editConsultation(item) : editPurchase(item)} className="text-[11px] text-slate-400 font-bold">수정</button><button onClick={() => item.type === 'consultation' ? deleteConsultation(item.id) : deletePurchase(item.id)} className="text-[11px] text-slate-400 font-bold">삭제</button></div>
                          </div>
                          {item.type === 'consultation' ? (<><p className="text-slate-800 text-sm whitespace-pre-wrap leading-relaxed">{item.content}</p>{item.next_meeting_date && (<p className="mt-3 text-[11px] font-bold text-blue-600 bg-blue-50/50 inline-block px-2.5 py-1.5 rounded-lg">🗓️ 다음 미팅: {new Date(item.next_meeting_date).toLocaleDateString('ko-KR')}</p>)}</>) : (
                            <div className="flex justify-between items-end gap-3 flex-nowrap"><div className="flex-1 min-w-0"><p className="text-slate-900 font-bold text-sm truncate">{item.product_name}</p><p className="text-[11px] text-slate-500 mt-1">종료 예정: {new Date(item.expiry_date).toLocaleDateString('ko-KR')}</p></div><span className="shrink-0 text-[11px] bg-white text-emerald-700 border border-emerald-100 px-2 py-1 rounded-lg font-bold whitespace-nowrap">{item.duration_days}일분</span></div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}