import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseClient';

export async function POST(req) {
  const body = await req.json();
  const { dealer_id, product, qty, rate, date, due_date } = body;

  const product_ = (product || '').trim();
  const qty_ = Number(qty);
  const rate_ = Number(rate);

  if (!dealer_id || !product_ || !qty_ || qty_ <= 0 || isNaN(rate_) || rate_ < 0) {
    return NextResponse.json({ error: 'Invalid purchase details' }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from('purchases')
    .insert({
      dealer_id,
      product: product_,
      qty: qty_,
      rate: rate_,
      date: date || new Date().toISOString().slice(0, 10),
      due_date: due_date || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ purchase: data });
}

