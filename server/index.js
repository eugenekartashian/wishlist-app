import cors from 'cors'
import express from 'express'
import { parseProductUrl } from './lib/parser.js'
import { getSupabaseAdmin } from './lib/supabaseAdmin.js'

const app = express()
const port = Number(process.env.PORT ?? 8787)
const supabaseAdmin = getSupabaseAdmin()

app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/parse', async (req, res) => {
  const { url } = req.body ?? {}
  const result = await parseProductUrl(url)
  return res.status(result.status).json(result.body)
})

app.get('/api/shared/:token', async (req, res) => {
  const token = req.params.token
  if (!token) {
    return res.status(400).json({ error: 'Missing token' })
  }

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

  return res.json({ wishlist, items })
})

app.listen(port, () => {
  console.log(`Wishlist API running on http://localhost:${port}`)
})
