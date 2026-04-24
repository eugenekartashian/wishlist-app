import { useCallback, useEffect, useMemo, useState } from 'react'
import { nanoid } from 'nanoid'
import { type Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import './index.css'

type Wishlist = {
  id: string
  title: string
  share_token: string | null
}

type WishlistItem = {
  id: string
  source_url: string
  title: string | null
  description: string | null
  image_url: string | null
  price: number | null
  currency: string | null
  site_name: string | null
  created_at: string
}

type ParseResponse = {
  sourceUrl: string
  title: string | null
  description: string | null
  imageUrl: string | null
  siteName: string | null
  price: number | null
  currency: string | null
}

const isSharedView = window.location.pathname.startsWith('/shared/')
const sharedToken = isSharedView ? decodeURIComponent(window.location.pathname.replace('/shared/', '')) : null

function toUserMessage(input: unknown) {
  if (input && typeof input === 'object') {
    const anyInput = input as Record<string, unknown>
    const message =
      (typeof anyInput.message === 'string' && anyInput.message) ||
      (typeof anyInput.error_description === 'string' && anyInput.error_description) ||
      (typeof anyInput.error === 'string' && anyInput.error) ||
      (typeof anyInput.details === 'string' && anyInput.details)

    if (message) {
      if (message.includes('failed to fetch page (403)')) {
        return 'This website blocks automated parsing (403). Try another product URL or add manually later.'
      }
      if (message.includes('Parsing timed out')) {
        return 'This website is too slow or blocks bot requests. Try another product URL or add manually later.'
      }

      if (message.includes("Could not find the table 'public.wishlists'")) {
        return 'Supabase schema is not created yet. Run SQL from supabase/schema.sql in SQL Editor.'
      }

      return message
    }
  }

  const text = input instanceof Error ? input.message : String(input ?? 'Unknown error')

  if (text.includes("Could not find the table 'public.wishlists'")) {
    return 'Supabase schema is not created yet. Run SQL from supabase/schema.sql in SQL Editor.'
  }

  if (text.includes('failed to fetch page (403)')) {
    return 'This website blocks automated parsing (403). Try another product URL or add manually later.'
  }
  if (text.includes('Parsing timed out')) {
    return 'This website is too slow or blocks bot requests. Try another product URL or add manually later.'
  }

  return text
}

function extractAuthErrorFromUrl() {
  const params = new URLSearchParams(window.location.search)
  const raw = params.get('error_description') ?? params.get('error')
  if (!raw) return null

  try {
    return decodeURIComponent(raw.replaceAll('+', ' '))
  } catch {
    return raw
  }
}

function formatPrice(price: number | null, currency: string | null) {
  if (price === null) return null
  if (!currency) return String(price)

  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(price)
  } catch {
    return `${price} ${currency}`
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [sendingLink, setSendingLink] = useState(false)

  const [wishlist, setWishlist] = useState<Wishlist | null>(null)
  const [items, setItems] = useState<WishlistItem[]>([])

  const [urlInput, setUrlInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [sharedTitle, setSharedTitle] = useState<string>('Shared Wishlist')
  const [sharedItems, setSharedItems] = useState<WishlistItem[]>([])
  const [sharedLoading, setSharedLoading] = useState(false)

  const shareLink = useMemo(() => {
    if (!wishlist?.share_token) return null
    return `${window.location.origin}/shared/${wishlist.share_token}`
  }, [wishlist?.share_token])

  const loadItems = useCallback(async (wishlistId: string) => {
    const { data, error } = await supabase
      .from('wishlist_items')
      .select('id, source_url, title, description, image_url, price, currency, site_name, created_at')
      .eq('wishlist_id', wishlistId)
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(toUserMessage(error))
      return
    }

    setItems((data ?? []) as WishlistItem[])
  }, [])

  const initializeWishlist = useCallback(
    async (currentSession: Session) => {
      const userId = currentSession.user.id

      const { data: existingWishlist, error: selectError } = await supabase
        .from('wishlists')
        .select('id, title, share_token')
        .eq('user_id', userId)
        .maybeSingle()

      if (selectError) {
        setMessage(toUserMessage(selectError))
        return
      }

      let activeWishlist = existingWishlist as Wishlist | null

      if (!activeWishlist) {
        const { error: upsertError } = await supabase
          .from('wishlists')
          .upsert({ user_id: userId, title: 'My Wishlist' }, { onConflict: 'user_id' })

        if (upsertError) {
          setMessage(toUserMessage(upsertError))
          return
        }

        const { data: createdOrExisting, error: reselectError } = await supabase
          .from('wishlists')
          .select('id, title, share_token')
          .eq('user_id', userId)
          .maybeSingle()

        if (reselectError || !createdOrExisting) {
          setMessage(toUserMessage(reselectError ?? { message: 'Failed to load wishlist after upsert' }))
          return
        }

        activeWishlist = createdOrExisting as Wishlist
      }

      setWishlist(activeWishlist)
      await loadItems(activeWishlist.id)
    },
    [loadItems],
  )

  const bootstrapSession = useCallback(async () => {
    const params = new URLSearchParams(window.location.search)
    const authError = extractAuthErrorFromUrl()
    if (authError) {
      setMessage(authError)
    }

    const { data } = await supabase.auth.getSession()
    setSession(data.session)

    if (data.session) {
      await initializeWishlist(data.session)
    }

    if (params.has('code') || params.has('error') || params.has('error_description')) {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [initializeWishlist])

  const loadShared = useCallback(async (token: string) => {
    setSharedLoading(true)
    setMessage(null)

    try {
      const response = await fetch(`/api/shared/${encodeURIComponent(token)}`)
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to load shared wishlist')
      }

      setSharedTitle(payload.wishlist?.title ?? 'Shared Wishlist')
      setSharedItems(payload.items ?? [])
    } catch (error) {
      setMessage(toUserMessage(error))
    } finally {
      setSharedLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isSharedView && sharedToken) {
      void loadShared(sharedToken)
      return
    }

    void bootstrapSession()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
      if (currentSession) {
        void initializeWishlist(currentSession)
      } else {
        setWishlist(null)
        setItems([])
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [bootstrapSession, initializeWishlist, loadShared])

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setSendingLink(true)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })

    setSendingLink(false)
    if (error) {
      setMessage(toUserMessage(error))
      return
    }

    setMessage('Magic link sent. Check your email.')
  }

  async function signInWithGoogle() {
    setMessage(null)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })

    if (error) {
      setMessage(toUserMessage(error))
    }
  }

  async function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!wishlist || !session) return

    setSubmitting(true)
    setMessage(null)

    try {
      const parseResponse = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      })

      const parsePayload = (await parseResponse.json()) as ParseResponse & { error?: string; message?: string }

      if (!parseResponse.ok) {
        throw new Error(parsePayload.message ?? parsePayload.error ?? 'Failed to parse URL')
      }

      const { error } = await supabase.from('wishlist_items').insert({
        wishlist_id: wishlist.id,
        user_id: session.user.id,
        source_url: parsePayload.sourceUrl,
        title: parsePayload.title,
        description: parsePayload.description,
        image_url: parsePayload.imageUrl,
        price: parsePayload.price,
        currency: parsePayload.currency,
        site_name: parsePayload.siteName,
      })

      if (error) {
        throw new Error(error.message)
      }

      setUrlInput('')
      await loadItems(wishlist.id)
    } catch (error) {
      setMessage(toUserMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  async function createShareLink() {
    if (!wishlist) return

    const token = wishlist.share_token ?? nanoid(20)

    const { data, error } = await supabase
      .from('wishlists')
      .update({ share_token: token })
      .eq('id', wishlist.id)
      .select('id, title, share_token')
      .single()

    if (error) {
      setMessage(toUserMessage(error))
      return
    }

    setWishlist(data as Wishlist)
    setMessage('Share link is ready.')
  }

  async function copyShareLink() {
    if (!shareLink) return

    await navigator.clipboard.writeText(shareLink)
    setMessage('Share link copied.')
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  if (isSharedView && sharedToken) {
    return (
      <main className="container">
        <header className="topbar">
          <h1>{sharedTitle}</h1>
          <a className="button ghost" href="/">
            Create your own wishlist
          </a>
        </header>

        {sharedLoading && <p>Loading shared wishlist...</p>}
        {!sharedLoading && sharedItems.length === 0 && <p>No items yet.</p>}
        <ul className="grid">
          {sharedItems.map((item) => (
            <li className="card" key={item.id}>
              {item.image_url ? <img src={item.image_url} alt={item.title ?? 'Wishlist item'} /> : null}
              <div className="card-body">
                <h3>{item.title ?? 'Untitled item'}</h3>
                {item.description ? <p>{item.description}</p> : null}
                <div className="row">
                  {item.price !== null ? <strong>{formatPrice(item.price, item.currency)}</strong> : <span>No price</span>}
                  <a href={item.source_url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {message ? <p className="message">{message}</p> : null}
      </main>
    )
  }

  if (!session) {
    return (
      <main className="auth">
        <h1>Wishlist</h1>
        <p>Sign in with magic link to manage your list.</p>
        <form onSubmit={sendMagicLink} className="auth-form">
          <input
            required
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button type="submit" disabled={sendingLink}>
            {sendingLink ? 'Sending...' : 'Send magic link'}
          </button>
        </form>
        <div className="auth-divider">or</div>
        <button className="button google" onClick={signInWithGoogle}>
          Continue with Google
        </button>
        {message ? <p className="message">{message}</p> : null}
      </main>
    )
  }

  return (
    <main className="container">
      <header className="topbar">
        <h1>{wishlist?.title ?? 'My Wishlist'}</h1>
        <div className="actions">
          <button className="button ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <section className="panel">
        <form className="row-form" onSubmit={addItem}>
          <input
            required
            type="url"
            placeholder="Paste product URL"
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
          />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Adding...' : 'Add item'}
          </button>
        </form>
      </section>

      <section className="panel share">
        <button className="button" onClick={createShareLink}>
          {shareLink ? 'Refresh share link' : 'Create share link'}
        </button>
        <button className="button ghost" onClick={copyShareLink} disabled={!shareLink}>
          Copy link
        </button>
        {shareLink ? (
          <a href={shareLink} target="_blank" rel="noreferrer" className="share-link">
            {shareLink}
          </a>
        ) : (
          <span className="muted">Create link to share publicly</span>
        )}
      </section>

      <ul className="grid">
        {items.map((item) => (
          <li className="card" key={item.id}>
            {item.image_url ? <img src={item.image_url} alt={item.title ?? 'Wishlist item'} /> : null}
            <div className="card-body">
              <h3>{item.title ?? 'Untitled item'}</h3>
              {item.description ? <p>{item.description}</p> : null}
              <div className="row">
                {item.price !== null ? <strong>{formatPrice(item.price, item.currency)}</strong> : <span>No price</span>}
                <a href={item.source_url} target="_blank" rel="noreferrer">
                  Open
                </a>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {items.length === 0 ? <p className="muted">No items yet. Add the first product link.</p> : null}
      {message ? <p className="message">{message}</p> : null}
    </main>
  )
}

export default App
