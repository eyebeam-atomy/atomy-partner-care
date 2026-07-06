import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { decrypt } from '@/lib/crypto';
import {
  buildPushMessage,
  buildPushReportForPartner,
  getKstParts,
  NotificationSettingsForPush,
} from '@/lib/notificationLogic';

export const dynamic = 'force-dynamic';

function safeDecrypt(value: any) {
  if (!value) return '';
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

function getAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");

  if (!cronSecret) return false;

  return (
    authorization === `Bearer ${cronSecret}` ||
    querySecret === cronSecret
  );
}

export async function GET(request: NextRequest) {
  try {
    if (!getAuthorized(request)) {
      return NextResponse.json({ error: '인증 실패' }, { status: 401 });
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!publicKey || !privateKey) {
      return NextResponse.json({ error: 'VAPID 키가 없습니다.' }, { status: 500 });
    }

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Supabase 서버 키가 없습니다.' }, { status: 500 });
    }

    const { today, currentTime } = getKstParts();
    // Vercel Hobby 플랜에서는 Cron을 하루 1회만 실행할 수 있으므로
    // Partner Care의 자동 푸시는 매일 오전 8시(KST) 1회로 고정합니다.
    const targetTime = '08:00';

    webpush.setVapidDetails('mailto:admin@partner-care.local', publicKey, privateKey);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as any;

    const { data: settings, error: settingsError } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('daily_push_enabled', true)
      .not('push_subscription', 'is', null);

    if (settingsError) throw settingsError;

    const results: any[] = [];

    for (const setting of (settings || []) as NotificationSettingsForPush[]) {
      const { data: existingLog, error: logSelectError } = await supabase
        .from('notification_push_logs')
        .select('id')
        .eq('partner_id', setting.partner_id)
        .eq('push_date', today)
        .eq('push_time', targetTime)
        .maybeSingle();

      if (logSelectError) throw logSelectError;

      if (existingLog) {
        results.push({ partner_id: setting.partner_id, status: 'skipped_duplicate' });
        continue;
      }

      const report = await buildPushReportForPartner(supabase, setting, safeDecrypt);
      const message = buildPushMessage(report);

      if (message.total <= 0) {
        results.push({ partner_id: setting.partner_id, status: 'skipped_no_alerts', counts: report.counts });
        continue;
      }

      try {
        await webpush.sendNotification(
          setting.push_subscription,
          JSON.stringify({
            title: message.title,
            body: message.body,
            url: '/dashboard',
          })
        );

        await supabase
          .from('notification_push_logs')
          .insert({
            partner_id: setting.partner_id,
            push_date: today,
            push_time: targetTime,
            alert_count: message.total,
            summary: message.summary,
          });

        results.push({
          partner_id: setting.partner_id,
          status: 'sent',
          total: message.total,
          counts: report.counts,
          body: message.body,
        });
      } catch (pushError: any) {
        const statusCode = pushError?.statusCode;

        if (statusCode === 404 || statusCode === 410) {
          await supabase
            .from('notification_settings')
            .update({ push_subscription: null, updated_at: new Date().toISOString() })
            .eq('partner_id', setting.partner_id);
        }

        results.push({
          partner_id: setting.partner_id,
          status: 'failed',
          error: pushError?.message || String(pushError),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      date: today,
      current_time: currentTime,
      target_time: targetTime,
      target_count: settings?.length || 0,
      sent_count: results.filter((item) => item.status === 'sent').length,
      results,
    });
  } catch (error: any) {
    console.error('자동 푸시 처리 실패:', error);
    return NextResponse.json(
      { error: error?.message || '자동 푸시 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
