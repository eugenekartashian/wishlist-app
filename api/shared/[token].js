import { getSupabaseAdmin } from '../../server/lib/supabaseAdmin.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = req.query.token
  if (!token) {
    return res.status(400).json({ error: 'Missing token' })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: wishlist, error: wishlistError } = await supabaseAdmin
    .from('wishlists')
    .select('id, title, created_at')
    .eq('share_token', token)
    .maybeSingle()

  if (wishlistError) {
    return res.status(500).json({ error: wishlistError.message })
  }

  if (!wishlist) {
    return res.status(404).json({ error: 'Not found' })
  }

  const { data: items, error: itemsError } = await supabaseAdmin
    .from('wishlist_items')
    .select('id, source_url, title, description, image_url, price, currency, site_name, created_at')
    .eq('wishlist_id', wishlist.id)
    .order('created_at', { ascending: false })

  if (itemsError) {
    return res.status(500).json({ error: itemsError.message })
  }

  return res.status(200).json({ wishlist, items })
}
