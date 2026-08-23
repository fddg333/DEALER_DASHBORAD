import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseClient';

export async function POST(req) {
  const body = await req.json();
  const { dealer_id, amount, date, note } = body;

  const amount_ = Number(amount);
  if (!dealer_id || isNaN(amount_) || amount_ <= 0) {
    return NextResponse.json({ error: 'Invalid payment details' }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from('payments')
    .insert({
      dealer_id,
      amount: amount_,
      date: date || new Date().toISOString().slice(0, 10),
      note: (note || '').trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payment: data });
}
