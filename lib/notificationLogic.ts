export type NotificationType =
  | 'birthday'
  | 'meeting'
  | 'consultation'
  | 'purchase'
  | 'expiry'
  | 'new_customer';

export type NotificationSettingsForPush = {
  partner_id: string;
  birthday_alert: boolean;
  meeting_alert: boolean;
  consultation_alert: boolean;
  purchase_alert: boolean;
  expiry_alert: boolean;
  new_customer_alert: boolean;
  daily_push_enabled: boolean;
  daily_push_time: string;
  push_subscription: any;
};

export type CrmAlert = {
  id: number | string;
  name: string;
  reasons: string[];
  priority: number;
  [key: string]: any;
};

export type MonthlyStats = {
  newCustomers: number;
  consultations: number;
  purchases: number;
};

export type NotificationItem = {
  type: NotificationType;
  customerId?: number | string;
  customerName?: string;
  reason: string;
  productName?: string;
  priority: number;
};

export type NotificationCounts = Record<NotificationType, number>;

export type NotificationReport = {
  items: NotificationItem[];
  counts: NotificationCounts;
  total: number;
  summary: string;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function getKstParts(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');

  const today = `${yyyy}-${mm}-${dd}`;
  const currentTime = `${hh}:00`;
  const todayStart = new Date(`${today}T00:00:00+09:00`);
  const firstDayOfMonth = new Date(`${yyyy}-${mm}-01T00:00:00+09:00`);

  return { today, currentTime, todayStart, firstDayOfMonth, now };
}

function daysBetween(target: Date, base: Date) {
  return Math.ceil((target.getTime() - base.getTime()) / MS_PER_DAY);
}

function safeDate(value: any) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function emptyCounts(): NotificationCounts {
  return {
    birthday: 0,
    meeting: 0,
    consultation: 0,
    purchase: 0,
    expiry: 0,
    new_customer: 0,
  };
}

function isEnabled(type: NotificationType, settings?: Partial<NotificationSettingsForPush>) {
  if (!settings) return true;

  const keyMap: Record<NotificationType, keyof NotificationSettingsForPush> = {
    birthday: 'birthday_alert',
    meeting: 'meeting_alert',
    consultation: 'consultation_alert',
    purchase: 'purchase_alert',
    expiry: 'expiry_alert',
    new_customer: 'new_customer_alert',
  };

  return settings[keyMap[type]] !== false;
}

export function buildPushMessage(report: NotificationReport) {
  const parts: string[] = [];

  if (report.counts.birthday > 0) parts.push(`생일 ${report.counts.birthday}명`);
  if (report.counts.meeting > 0) parts.push(`미팅 ${report.counts.meeting}건`);
  if (report.counts.consultation > 0) parts.push(`상담 경과 ${report.counts.consultation}명`);
  if (report.counts.purchase > 0) parts.push(`미구매 ${report.counts.purchase}명`);
  if (report.counts.expiry > 0) parts.push(`제품 만료 ${report.counts.expiry}건`);
  if (report.counts.new_customer > 0) parts.push('신규 소비자 7일 없음');

  const summary = parts.join(' · ');

  return {
    total: report.total,
    summary,
    title: '🔔 Partner Care 알림',
    body: report.total > 0
      ? `오늘 확인할 CRM ${report.total}건이 있습니다. ${summary}`
      : '',
  };
}

function addItem(items: NotificationItem[], counts: NotificationCounts, item: NotificationItem) {
  items.push(item);
  counts[item.type] += 1;
}

function groupReportItemsByCustomer(customersData: any[], report: NotificationReport): CrmAlert[] {
  const customerMap = new Map<string, CrmAlert>();

  for (const customer of customersData) {
    customerMap.set(String(customer.id), {
      ...customer,
      reasons: [],
      priority: 1,
    });
  }

  for (const item of report.items) {
    if (!item.customerId) continue;

    const key = String(item.customerId);
    const existing = customerMap.get(key);

    if (existing) {
      existing.reasons.push(item.reason);
      existing.priority = Math.max(existing.priority || 1, item.priority);
    } else {
      customerMap.set(key, {
        id: item.customerId,
        name: item.customerName || '',
        reasons: [item.reason],
        priority: item.priority,
      });
    }
  }

  const groupedAlerts = Array.from(customerMap.values())
    .filter((customer) => customer.reasons.length > 0)
    .sort((a, b) => b.priority - a.priority);

  if (report.counts.new_customer > 0) {
    groupedAlerts.unshift({
      id: 'new_customer_alert',
      name: '신규 소비자 활동',
      reasons: ['💪 최근 7일 동안 신규 소비자가 없습니다. 오늘 한 분에게 제품을 소개해보세요!'],
      priority: 10,
      isGeneralAlert: true,
    });
  }

  return groupedAlerts;
}

export async function buildNotificationReportFromCustomers(
  supabase: any,
  customersData: any[],
  options?: {
    settings?: Partial<NotificationSettingsForPush>;
  }
): Promise<{ report: NotificationReport; monthlyStats: MonthlyStats }> {
  const { todayStart, now, firstDayOfMonth } = getKstParts();
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
  const sevenDaysLater = new Date(now); sevenDaysLater.setDate(now.getDate() + 7);

  const monthlyStats: MonthlyStats = {
    newCustomers: customersData.filter((customer) => new Date(customer.created_at) >= firstDayOfMonth).length,
    consultations: 0,
    purchases: 0,
  };

  const items: NotificationItem[] = [];
  const counts = emptyCounts();

  if (isEnabled('new_customer', options?.settings)) {
    const recentNewCustomerCount = customersData.filter((customer) => new Date(customer.created_at) >= sevenDaysAgo).length;
    if (recentNewCustomerCount === 0) {
      addItem(items, counts, {
        type: 'new_customer',
        reason: '💪 최근 7일 동안 신규 소비자가 없습니다. 오늘 한 분에게 제품을 소개해보세요!',
        priority: 10,
      });
    }
  }

  if (customersData.length === 0) {
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const report = { items, counts, total, summary: '' };
    report.summary = buildPushMessage(report).summary;
    return { report, monthlyStats };
  }

  const customerIds = customersData.map((customer) => customer.id);

  const [{ data: consultations, error: consultationsError }, { data: purchases, error: purchasesError }] = await Promise.all([
    supabase
      .from('consultations')
      .select('customer_id, created_at, next_meeting_date')
      .in('customer_id', customerIds),
    supabase
      .from('purchases')
      .select('customer_id, created_at, expiry_date, product_name')
      .in('customer_id', customerIds),
  ]);

  if (consultationsError) throw consultationsError;
  if (purchasesError) throw purchasesError;

  const cons = consultations || [];
  const purs = purchases || [];

  monthlyStats.consultations = cons.filter((item: any) => new Date(item.created_at) >= firstDayOfMonth).length;
  monthlyStats.purchases = purs.filter((item: any) => new Date(item.created_at) >= firstDayOfMonth).length;

  for (const customer of customersData) {
    const custCons = cons
      .filter((item: any) => item.customer_id === customer.id)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const custPurs = purs
      .filter((item: any) => item.customer_id === customer.id)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (isEnabled('birthday', options?.settings) && customer.birthday) {
      const birthday = safeDate(`${customer.birthday}T00:00:00+09:00`);
      if (birthday) {
        const thisYearBirthday = new Date(todayStart);
        thisYearBirthday.setMonth(birthday.getMonth(), birthday.getDate());
        const diffDays = daysBetween(thisYearBirthday, todayStart);

        if (diffDays === 0) {
          addItem(items, counts, {
            type: 'birthday',
            customerId: customer.id,
            customerName: customer.name,
            reason: '🎂 오늘 생일입니다! (D-Day)',
            priority: 5,
          });
        } else if (diffDays > 0 && diffDays <= 3) {
          addItem(items, counts, {
            type: 'birthday',
            customerId: customer.id,
            customerName: customer.name,
            reason: `🎂 생일 ${diffDays}일 전입니다!`,
            priority: 1,
          });
        }
      }
    }

    if (isEnabled('meeting', options?.settings)) {
      const upcomingMeetings = custCons
        .filter((item: any) => item.next_meeting_date)
        .map((item: any) => safeDate(item.next_meeting_date))
        .filter((date: Date | null): date is Date => !!date && date >= todayStart)
        .sort((a: Date, b: Date) => a.getTime() - b.getTime());

      if (upcomingMeetings.length > 0) {
        const diffDays = daysBetween(upcomingMeetings[0], todayStart);
        if (diffDays === 0) {
          addItem(items, counts, {
            type: 'meeting',
            customerId: customer.id,
            customerName: customer.name,
            reason: '🗓️ 오늘 미팅이 예정되어 있습니다!',
            priority: 5,
          });
        } else if (diffDays > 0 && diffDays <= 3) {
          addItem(items, counts, {
            type: 'meeting',
            customerId: customer.id,
            customerName: customer.name,
            reason: `🗓️ 다음 미팅 D-${diffDays}일 전입니다!`,
            priority: 5,
          });
        }
      }
    }

    if (isEnabled('consultation', options?.settings)) {
      const lastConsultationDate = custCons.length > 0
        ? new Date(custCons[0].created_at)
        : new Date(customer.created_at);
      if (lastConsultationDate < sevenDaysAgo) {
        addItem(items, counts, {
          type: 'consultation',
          customerId: customer.id,
          customerName: customer.name,
          reason: '💬 상담 7일 경과',
          priority: 1,
        });
      }
    }

    if (isEnabled('expiry', options?.settings)) {
      const expiringProducts = custPurs.filter((item: any) => {
        const expiryDate = safeDate(item.expiry_date);
        return !!expiryDate && expiryDate <= sevenDaysLater && expiryDate >= thirtyDaysAgo;
      });

      for (const product of expiringProducts) {
        addItem(items, counts, {
          type: 'expiry',
          customerId: customer.id,
          customerName: customer.name,
          reason: `⏰ ${product.product_name} 만료 임박`,
          productName: product.product_name,
          priority: 5,
        });
      }
    }

    if (isEnabled('purchase', options?.settings)) {
      const lastPurchaseDate = custPurs.length > 0
        ? new Date(custPurs[0].created_at)
        : new Date(customer.created_at);
      if (lastPurchaseDate < thirtyDaysAgo) {
        addItem(items, counts, {
          type: 'purchase',
          customerId: customer.id,
          customerName: customer.name,
          reason: '🛒 구매 1개월 미진행',
          priority: 1,
        });
      }
    }
  }

  items.sort((a, b) => b.priority - a.priority);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const report = { items, counts, total, summary: '' };
  report.summary = buildPushMessage(report).summary;

  return { report, monthlyStats };
}

export async function buildCrmAlertsAndStats(supabase: any, customersData: any[]) {
  const { report, monthlyStats } = await buildNotificationReportFromCustomers(supabase, customersData);
  return { alerts: groupReportItemsByCustomer(customersData, report), monthlyStats, report };
}

export async function buildPushReportForPartner(
  supabase: any,
  setting: NotificationSettingsForPush,
  decryptValue: (value: any) => string
): Promise<NotificationReport> {
  const { data: rawCustomers, error: customersError } = await supabase
    .from('customers')
    .select('*')
    .eq('creator_id', setting.partner_id);

  if (customersError) throw customersError;

  const customers = (rawCustomers || []).map((customer: any) => ({
    ...customer,
    name: decryptValue(customer.name),
    phone: decryptValue(customer.phone),
    address: decryptValue(customer.address),
    memo: decryptValue(customer.memo),
    birthday: decryptValue(customer.birthday),
  }));

  const { report } = await buildNotificationReportFromCustomers(supabase, customers, { settings: setting });
  return report;
}
