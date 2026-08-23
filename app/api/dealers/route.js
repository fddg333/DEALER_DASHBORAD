import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseClient';

export async function GET() {
  const supabase = supabaseServer();
  const { data: dealers, error: dealersErr } = await supabase
    .from('dealers')
    .select('*')
    .order('created_at', { ascending: true });
  if (dealersErr) return NextResponse.json({ error: dealersErr.message }, { status: 500 });

  const { data: purchases, error: purchasesErr } = await supabase
    .from('purchases')
    .select('*')
    .order('date', { ascending: false });
  if (purchasesErr) return NextResponse.json({ error: purchasesErr.message }, { status: 500 });

  const { data: payments, error: paymentsErr } = await supabase
    .from('payments')
    .select('*')
    .order('date', { ascending: false });
  if (paymentsErr) return NextResponse.json({ error: paymentsErr.message }, { status: 500 });

  const merged = dealers.map((d) => ({
    ...d,
    purchases: purchases.filter((p) => p.dealer_id === d.id),
    payments: payments.filter((p) => p.dealer_id === d.id),
  }));

  return NextResponse.json({ dealers: merged });
}

export async function POST(req) {
  const body = await req.json();
  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim();

  if (!name) {
    return NextResponse.json({ error: 'Dealer name is required' }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from('dealers')
    .insert({ name, phone })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ dealer: data });
}
