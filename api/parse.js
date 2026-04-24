import { parseProductUrl } from '../server/lib/parser.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { url } = req.body ?? {}
  const result = await parseProductUrl(url)
  return res.status(result.status).json(result.body)
}
