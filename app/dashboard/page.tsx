'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Dashboard() {
  const [partners, setPartners] = useState<any[]>([]);

  // 페이지가 열리자마자 DB에서 파트너 목록 가져오기
  useEffect(() => {
    const fetchPartners = async () => {
      const { data, error } = await supabase
        .from('partners')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) setPartners(data);
    };

    fetchPartners();
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">파트너 관리 수첩</h1>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
            + 새 파트너 등록
          </button>
        </header>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">이름</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">연락처(아이디)</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">등록일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {partners.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4 font-medium">{p.user_name}</td>
                  <td className="px-6 py-4 text-slate-500">{p.user_id}</td>
                  <td className="px-6 py-4 text-slate-400 text-sm">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}