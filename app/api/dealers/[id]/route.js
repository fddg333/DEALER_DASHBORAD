import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseClient';

export async function DELETE(req, { params }) {
  const supabase = supabaseServer();
  const { error } = await supabase.from('dealers').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
