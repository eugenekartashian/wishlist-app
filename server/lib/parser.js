import { load } from 'cheerio'

export function absoluteUrl(baseUrl, maybeRelative) {
  if (!maybeRelative) return null

  try {
    return new URL(maybeRelative, baseUrl).toString()
  } catch {
    return null
  }
}

export function parseJsonLdPrice(rawHtml) {
  const scriptMatches = rawHtml.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? []

  for (const script of scriptMatches) {
    const contentMatch = script.match(/>([\s\S]*?)<\/script>/i)
    if (!contentMatch) continue

    const jsonText = contentMatch[1].trim()
    if (!jsonText) continue

    try {
      const parsed = JSON.parse(jsonText)
      const nodes = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.['@graph'])
          ? parsed['@graph']
          : [parsed]

      for (const node of nodes) {
        const offers = node?.offers
        const candidateOffers = Array.isArray(offers) ? offers : offers ? [offers] : []

        for (const offer of candidateOffers) {
          const priceRaw = offer?.price ?? offer?.lowPrice ?? offer?.highPrice
          const currencyRaw = offer?.priceCurrency ?? offer?.priceSpecification?.priceCurrency

          if (priceRaw != null) {
            const normalized = Number(String(priceRaw).replace(',', '.'))
            return {
              price: Number.isFinite(normalized) ? normalized : null,
              currency: typeof currencyRaw === 'string' ? currencyRaw : null,
            }
          }
        }
      }
    } catch {
      continue
    }
  }

  return { price: null, currency: null }
}

export function parseHtml(url, html) {
  const $ = load(html)
  const pick = (selectors) => {
    for (const selector of selectors) {
      const value = ($(selector).attr('content') || $(selector).text() || '').trim()
      if (value) return value
    }
    return null
  }

  const title = pick(["meta[property='og:title']", "meta[name='twitter:title']", "meta[name='title']", 'title'])

  const description = pick([
    "meta[property='og:description']",
    "meta[name='description']",
    "meta[name='twitter:description']",
  ])

  const siteName = pick(["meta[property='og:site_name']", "meta[name='application-name']"])

  const imageCandidate = pick(["meta[property='og:image']", "meta[name='twitter:image']", "meta[itemprop='image']"])
  const imageUrl = absoluteUrl(url, imageCandidate)

  let priceText = pick([
    "meta[property='product:price:amount']",
    "meta[property='og:price:amount']",
    "meta[itemprop='price']",
    "[itemprop='price']",
  ])

  let currency = pick([
    "meta[property='product:price:currency']",
    "meta[property='og:price:currency']",
    "meta[itemprop='priceCurrency']",
    "[itemprop='priceCurrency']",
  ])

  const jsonLd = parseJsonLdPrice(html)

  if (jsonLd.price !== null) {
    priceText = String(jsonLd.price)
  }
  if (!currency && jsonLd.currency) {
    currency = jsonLd.currency
  }

  const normalizedPrice = priceText ? Number(priceText.replace(/[^0-9.,-]/g, '').replace(',', '.')) : NaN

  return {
    sourceUrl: url,
    title,
    description,
    imageUrl,
    siteName,
    price: Number.isFinite(normalizedPrice) ? normalizedPrice : null,
    currency: currency || null,
  }
}

export async function parseProductUrl(url) {
  if (!url) {
    return { status: 400, body: { error: 'url is required' } }
  }

  let parsedUrl
  try {
    parsedUrl = new URL(url)
  } catch {
    return { status: 400, body: { error: 'invalid URL' } }
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { status: 400, body: { error: 'only http/https URLs are allowed' } }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)

    let response
    try {
      response = await fetch(parsedUrl.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': 'WishlistBot/1.0 (+https://wishlist.local)',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      return { status: 400, body: { error: `failed to fetch page (${response.status})` } }
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) {
      return { status: 400, body: { error: 'URL is not an HTML page' } }
    }

    const html = await response.text()
    return { status: 200, body: parseHtml(parsedUrl.toString(), html) }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        status: 504,
        body: {
          error: 'parser_timeout',
          message: 'Parsing timed out. This site may block bots or respond too slowly.',
        },
      }
    }

    return {
      status: 500,
      body: {
        error: 'parser_failed',
        message: error instanceof Error ? error.message : 'Unknown parser error',
      },
    }
  }
}
