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

type CronLogStatus = 'started' | 'success' | 'failed' | 'unauthorized';

type CronLogPayload = {
  type?: string;
  status: CronLogStatus;
  message: string;
  target_count?: number;
  sent_count?: number;
  error_count?: number;
};

async function writeCronLog(
  supabase: ReturnType<typeof createClient>,
  payload: CronLogPayload
) {
  try {
    await supabase.from('cron_logs').insert({
      type: payload.type || 'daily_push',
      status: payload.status,
      message: payload.message,
      target_count: payload.target_count || 0,
      sent_count: payload.sent_count || 0,
      error_count: payload.error_count || 0,
    });
  } catch (logError) {
    console.error('cron_logs 저장 실패:', logError);
  }
}

export async function GET(request: NextRequest) {
  let supabase: ReturnType<typeof createClient> | null = null;

  try {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { today, currentTime } = getKstParts();
    // Vercel Hobby 플랜에서는 Cron을 하루 1회만 실행할 수 있으므로
    // Partner Care의 자동 푸시는 매일 오전 8시(KST) 1회로 고정합니다.
    const targetTime = '08:00';

    if (supabaseUrl && serviceRoleKey) {
      supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }

    if (!getAuthorized(request)) {
      if (supabase) {
        await writeCronLog(supabase, {
          status: 'unauthorized',
          message: '인증 실패: CRON_SECRET 또는 Authorization 헤더를 확인하세요.',
          error_count: 1,
        });
      }

      return NextResponse.json({ error: '인증 실패' }, { status: 401 });
    }

    if (!publicKey || !privateKey) {
      if (supabase) {
        await writeCronLog(supabase, {
          status: 'failed',
          message: 'VAPID 키가 없습니다.',
          error_count: 1,
        });
      }

      return NextResponse.json({ error: 'VAPID 키가 없습니다.' }, { status: 500 });
    }

    if (!supabaseUrl || !serviceRoleKey || !supabase) {
      return NextResponse.json({ error: 'Supabase 서버 키가 없습니다.' }, { status: 500 });
    }

    await writeCronLog(supabase, {
      status: 'started',
      message: `자동 푸시 실행 시작: ${today} ${currentTime}, target ${targetTime}`,
    });

    webpush.setVapidDetails('mailto:admin@partner-care.local', publicKey, privateKey);

    const { data: settings, error: settingsError } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('daily_push_enabled', true)
      .not('push_subscription', 'is', null);

    if (settingsError) throw settingsError;

    await writeCronLog(supabase, {
      status: 'started',
      message: `푸시 설정 조회 완료: 대상 후보 ${settings?.length || 0}명`,
      target_count: settings?.length || 0,
    });

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

    const sentCount = results.filter((item) => item.status === 'sent').length;
    const failedCount = results.filter((item) => item.status === 'failed').length;
    const duplicateCount = results.filter((item) => item.status === 'skipped_duplicate').length;
    const noAlertCount = results.filter((item) => item.status === 'skipped_no_alerts').length;

    await writeCronLog(supabase, {
      status: failedCount > 0 ? 'failed' : 'success',
      message: `자동 푸시 완료: 대상 ${settings?.length || 0}명, 발송 ${sentCount}건, 중복 제외 ${duplicateCount}건, 알림 없음 ${noAlertCount}건, 실패 ${failedCount}건`,
      target_count: settings?.length || 0,
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
      duplicate_count: duplicateCount,
      no_alert_count: noAlertCount,
      failed_count: failedCount,
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
