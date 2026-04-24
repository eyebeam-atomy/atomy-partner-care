import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const { targetPhone, newPassword, masterCode } = await request.json();

    // 💡 [비장의 무기] 프론트에서 넘어온 글자가 정확히 뭔지 서버 터미널에 찍어봅니다!
    console.log("✅ 화면에서 입력한 마스터코드:", `[${masterCode}]`);

    // 🚀 1. 마스터 암호 확인 (외부 해커 접근 완벽 차단)
    if (masterCode !== '당정최고_표승준') {
      console.log("❌ 암호가 틀려서 튕겨냅니다!"); // 터미널 확인용
      return NextResponse.json({ error: '마스터 권한이 없습니다.' }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      return NextResponse.json({ error: '서버에 마스터 키가 세팅되지 않았습니다.' }, { status: 500 });
    }

    // 🚀 2. 마스터 권한으로 DB 강제 연결
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 🚀 3. 파트너 전화번호로 유저 고유 ID 찾아내기
    const { data: partnerData, error: findError } = await supabaseAdmin
      .from('partners')
      .select('id')
      .eq('user_id', targetPhone)
      .single();

    if (findError || !partnerData) {
      return NextResponse.json({ error: '해당 번호로 가입된 파트너가 없습니다.' }, { status: 404 });
    }

    // 🚀 4. 해당 유저의 비밀번호를 강제로 업데이트!
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(partnerData.id, {
      password: newPassword
    });

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}