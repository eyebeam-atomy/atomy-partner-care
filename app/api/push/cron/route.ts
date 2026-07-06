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
  const authorization = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');

  if (!cronSecret) return false;

  return authorization === `Bearer ${cronSecret}` || querySecret === cronSecret;
}

async function writeCronLog(
  supabase: any,
  payload: {
    type?: string;
    status: string;
    message?: string;
    target_count?: number;
    sent_count?: number;
    error_count?: number;
  }
) {
  try {
    await supabase.from('cron_logs' as any).insert({
      type: payload.type || 'daily_push',
      status: payload.status,
      message: payload.message || '',
      target_count: payload.target_count ?? 0,
      sent_count: payload.sent_count ?? 0,
      error_count: payload.error_count ?? 0,
    } as any);
  } catch (logError) {
    console.error('cron_logs 저장 실패:', logError);
  }
}

export async function GET(request: NextRequest) {
  let supabase: any = null;

  try {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Supabase 서버 키가 없습니다.' }, { status: 500 });
    }

    supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as any;

    if (!getAuthorized(request)) {
      await writeCronLog(supabase, {
        status: 'auth_failed',
        message: '자동 푸시 인증 실패',
        error_count: 1,
      });

      return NextResponse.json({ error: '인증 실패' }, { status: 401 });
    }

    if (!publicKey || !privateKey) {
      await writeCronLog(supabase, {
        status: 'failed',
        message: 'VAPID 키가 없습니다.',
        error_count: 1,
      });

      return NextResponse.json({ error: 'VAPID 키가 없습니다.' }, { status: 500 });
    }

    const { today, currentTime } = getKstParts();
    // Vercel Hobby 플랜에서는 Cron을 하루 1회만 실행할 수 있으므로
    // Partner Care의 자동 푸시는 매일 오전 8시(KST) 1회로 고정합니다.
    const targetTime = '08:00';

    webpush.setVapidDetails('mailto:admin@partner-care.local', publicKey, privateKey);

    await writeCronLog(supabase, {
      status: 'started',
      message: `자동 푸시 실행 시작: ${today} ${currentTime}`,
    });

    const { data: settings, error: settingsError } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('daily_push_enabled', true)
      .not('push_subscription', 'is', null);

    if (settingsError) throw settingsError;

    await writeCronLog(supabase, {
      status: 'settings_loaded',
      message: `푸시 설정 조회 완료: 대상 후보 ${(settings || []).length}명`,
      target_count: (settings || []).length,
    });

    const results: any[] = [];

    for (const setting of (settings || []) as NotificationSettingsForPush[]) {
      const { data: existingLog, error: logSelectError } = await supabase
        .from('notification_push_logs' as any)
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

        await supabase.from('notification_push_logs' as any).insert({
          partner_id: setting.partner_id,
          push_date: today,
          push_time: targetTime,
          alert_count: message.total,
          summary: message.summary,
        } as any);

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
            .from('notification_settings' as any)
            .update({ push_subscription: null, updated_at: new Date().toISOString() } as any)
            .eq('partner_id', setting.partner_id);
        }

        results.push({
          partner_id: setting.partner_id,
          status: 'failed',
          error: pushError?.message || String(pushError),
        });
      }
    }

    const sentCount = results.filter((item) => item.status === 'sent').length;
    const failedCount = results.filter((item) => item.status === 'failed').length;
    const duplicateCount = results.filter((item) => item.status === 'skipped_duplicate').length;
    const noAlertCount = results.filter((item) => item.status === 'skipped_no_alerts').length;

    await writeCronLog(supabase, {
      status: failedCount > 0 ? 'completed_with_errors' : 'completed',
      message: `자동 푸시 완료: 대상 ${(settings || []).length}명, 발송 ${sentCount}명, 실패 ${failedCount}명, 중복 제외 ${duplicateCount}명, 알림 없음 ${noAlertCount}명`,
      target_count: (settings || []).length,
      sent_count: sentCount,
      error_count: failedCount,
    });

    return NextResponse.json({
      ok: true,
      date: today,
      current_time: currentTime,
      target_time: targetTime,
      target_count: settings?.length || 0,
      sent_count: sentCount,
      failed_count: failedCount,
      duplicate_count: duplicateCount,
      no_alert_count: noAlertCount,
      results,
    });
  } catch (error: any) {
    console.error('자동 푸시 처리 실패:', error);

    if (supabase) {
      await writeCronLog(supabase, {
        status: 'failed',
        message: error?.message || '자동 푸시 처리 중 오류가 발생했습니다.',
        error_count: 1,
      });
    }

    return NextResponse.json(
      { error: error?.message || '자동 푸시 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
