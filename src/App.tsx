import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDollarSign,
  CircleMinus,
  Cloud,
  CloudOff,
  Download,
  Eye,
  EyeOff,
  HeartPulse,
  Landmark,
  LogOut,
  Menu,
  Mail,
  MoreHorizontal,
  Pencil,
  PieChart as PieChartIcon,
  Plus,
  Search,
  ShieldCheck,
  Scale,
  Sparkles,
  Sprout,
  Target,
  Trash2,
  TrendingUp,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type Page = 'networth' | 'income' | 'overview' | 'allocation' | 'holdings' | 'plan'
type AssetClass = 'US equity' | 'International equity' | 'Fixed income' | 'Cash' | 'Real assets'
type NetWorthCategory = 'Cash' | 'Stocks / funds' | 'Bonds / deposits' | 'Property' | 'Vehicle' | 'Other asset' | 'Mortgage' | 'Loan' | 'Credit card' | 'Other liability'
type CurrencyCode = 'THB' | 'USD' | 'AUD'

type Holding = {
  id: string
  ticker: string
  name: string
  assetClass: AssetClass
  account: string
  value: number
  isSample?: boolean
}

type NetWorthItem = {
  id: string
  name: string
  category: NetWorthCategory
  value: number
  note: string
  isSample?: boolean
}

type NetWorthSnapshot = {
  month: string
  assets: number
  liabilities: number
  netWorth: number
  updatedAt: string
}

type IncomePeriod = {
  id: string
  company: string
  role: string
  monthlyIncome: number
  startMonth: string
  endMonth: string
  note: string
}

type AppSettings = {
  currency: CurrencyCode
  monthlyEssentials: number
  emergencyTargetMonths: number
  savingsRate: number
  monthlyContribution: number
  hasHighInterestDebt: boolean
  autoContributions: boolean
  riskProfile: 'Conservative' | 'Balanced' | 'Growth'
  driftThreshold: number
  goalName: string
  goalAmount: number
  goalYear: number
  lastReviewed: string
  cashReturnRate: number
  incomeReturnRate: number
  growthReturnRate: number
  lastNetWorthUpdated: string
}

type Reminder = {
  id: 'monthly-update' | 'emergency-fund' | 'high-interest-debt' | 'asset-review' | 'sample-data'
  title: string
  message: string
  page: Page
  action: string
  tone: 'green' | 'sand' | 'coral' | 'blue'
  canComplete?: boolean
}

type AppData = {
  dataVersion?: number
  holdings: Holding[]
  netWorthItems: NetWorthItem[]
  targets: Record<AssetClass, number>
  settings: AppSettings
  netWorthHistory: NetWorthSnapshot[]
  incomePeriods: IncomePeriod[]
  isSample: boolean
}

type SyncStatus = 'local' | 'loading' | 'saving' | 'synced' | 'error'

const ASSET_CLASSES: AssetClass[] = [
  'US equity',
  'International equity',
  'Fixed income',
  'Cash',
  'Real assets',
]

const CLASS_META: Record<AssetClass, { color: string; soft: string; short: string }> = {
  'US equity': { color: '#173f35', soft: '#dce9e3', short: 'US' },
  'International equity': { color: '#77a991', soft: '#e5efe9', short: 'INTL' },
  'Fixed income': { color: '#d5a85d', soft: '#f3e8d4', short: 'BOND' },
  Cash: { color: '#8498a2', soft: '#e8edef', short: 'CASH' },
  'Real assets': { color: '#c87756', soft: '#f1dfd7', short: 'REAL' },
}

const NET_WORTH_META: Record<NetWorthCategory | 'Investment portfolio', { color: string; soft: string }> = {
  'Investment portfolio': { color: '#173f35', soft: '#dce9e3' },
  Cash: { color: '#77a991', soft: '#e5efe9' },
  'Stocks / funds': { color: '#173f35', soft: '#dce9e3' },
  'Bonds / deposits': { color: '#7896a0', soft: '#e5edef' },
  Property: { color: '#d5a85d', soft: '#f3e8d4' },
  Vehicle: { color: '#8498a2', soft: '#e8edef' },
  'Other asset': { color: '#c87756', soft: '#f1dfd7' },
  Mortgage: { color: '#b7634a', soft: '#f1dfd7' },
  Loan: { color: '#8d6d62', soft: '#eee6e2' },
  'Credit card': { color: '#a44f48', soft: '#f3dfdc' },
  'Other liability': { color: '#776a65', soft: '#ebe7e5' },
}

const ASSET_CATEGORIES: NetWorthCategory[] = ['Cash', 'Stocks / funds', 'Bonds / deposits', 'Property', 'Vehicle', 'Other asset']
const LIABILITY_CATEGORIES: NetWorthCategory[] = ['Mortgage', 'Loan', 'Credit card', 'Other liability']

const NAV_ITEMS: Array<{ id: Page; label: string; shortLabel: string; icon: LucideIcon; tone: 'gold' | 'mint' | 'coral' | 'blue' }> = [
  { id: 'networth', label: 'Net Worth', shortLabel: 'Net Worth', icon: WalletCards, tone: 'gold' },
  { id: 'income', label: 'Income Progress', shortLabel: 'Income', icon: Briefcase, tone: 'blue' },
  { id: 'allocation', label: 'Investment Plan', shortLabel: 'Invest', icon: TrendingUp, tone: 'mint' },
  { id: 'plan', label: 'Financial Health', shortLabel: 'Health', icon: HeartPulse, tone: 'coral' },
]

const CURRENCIES = [
  { code: 'THB', label: 'Thai baht' },
  { code: 'USD', label: 'US dollar' },
  { code: 'AUD', label: 'Australian dollar' },
] as const

const STORAGE_KEY = 'steady-portfolio-v1'
const EXCHANGE_RATE_CACHE_KEY = 'steady-exchange-rates-v1'
const BASE_CURRENCY: CurrencyCode = 'THB'

type ExchangeRateSnapshot = {
  rates: Partial<Record<CurrencyCode, number>>
  date: string | null
  fetchedAt: number | null
}

function loadCachedExchangeRates(): ExchangeRateSnapshot {
  try {
    const cached = JSON.parse(window.localStorage.getItem(EXCHANGE_RATE_CACHE_KEY) ?? '') as ExchangeRateSnapshot
    if (!cached.rates || typeof cached.rates.USD !== 'number' || typeof cached.rates.AUD !== 'number') throw new Error('Invalid rate cache')
    return { ...cached, rates: { ...cached.rates, THB: 1 } }
  } catch {
    return { rates: { THB: 1 }, date: null, fetchedAt: null }
  }
}

function makeInitialData(): AppData {
  const reviewed = new Date()
  reviewed.setDate(reviewed.getDate() - 60)
  return {
    dataVersion: 5,
    holdings: [],
    netWorthItems: [
      { id: 'sample-cash', name: 'Cash and savings', category: 'Cash', value: 32000, note: 'Bank accounts', isSample: true },
      { id: 'sample-stocks', name: 'Stocks and funds', category: 'Stocks / funds', value: 78000, note: 'Total across investment accounts', isSample: true },
      { id: 'sample-bonds', name: 'Deposits and bonds', category: 'Bonds / deposits', value: 30000, note: 'Fixed income total', isSample: true },
      { id: 'sample-condo', name: 'Primary condo', category: 'Property', value: 285000, note: 'Estimated current value', isSample: true },
      { id: 'sample-mortgage', name: 'Condo mortgage', category: 'Mortgage', value: 178000, note: 'Current loan balance', isSample: true },
    ],
    targets: {
      'US equity': 40,
      'International equity': 20,
      'Fixed income': 25,
      Cash: 10,
      'Real assets': 5,
    },
    settings: {
      currency: BASE_CURRENCY,
      monthlyEssentials: 4200,
      emergencyTargetMonths: 6,
      savingsRate: 18,
      monthlyContribution: 1500,
      hasHighInterestDebt: false,
      autoContributions: true,
      riskProfile: 'Balanced',
      driftThreshold: 5,
      goalName: 'Financial independence',
      goalAmount: 750000,
      goalYear: new Date().getFullYear() + 18,
      lastReviewed: reviewed.toISOString(),
      cashReturnRate: 2,
      incomeReturnRate: 4,
      growthReturnRate: 7,
      lastNetWorthUpdated: reviewed.toISOString(),
    },
    netWorthHistory: [],
    incomePeriods: [],
    isSample: true,
  }
}

function normalizeAppData(value: unknown): AppData | null {
  try {
    const parsed = value as AppData
    if (!parsed || !Array.isArray(parsed.holdings) || !parsed.targets || !parsed.settings) return null
    if (!Array.isArray(parsed.netWorthItems)) parsed.netWorthItems = []
    if (!parsed.dataVersion || parsed.dataVersion < 2) {
      const legacyHoldings = parsed.holdings ?? []
      const legacyGroups = [
        { id: 'migrated-stocks', name: 'Stocks and funds', category: 'Stocks / funds' as NetWorthCategory, value: legacyHoldings.filter((holding) => ['US equity', 'International equity', 'Real assets'].includes(holding.assetClass)).reduce((sum, holding) => sum + holding.value, 0), note: 'Migrated from Holdings' },
        { id: 'migrated-income', name: 'Bonds and deposits', category: 'Bonds / deposits' as NetWorthCategory, value: legacyHoldings.filter((holding) => holding.assetClass === 'Fixed income').reduce((sum, holding) => sum + holding.value, 0), note: 'Migrated from Holdings' },
        { id: 'migrated-cash', name: 'Portfolio cash', category: 'Cash' as NetWorthCategory, value: legacyHoldings.filter((holding) => holding.assetClass === 'Cash').reduce((sum, holding) => sum + holding.value, 0), note: 'Migrated from Holdings' },
      ].filter((item) => item.value > 0)
      parsed.netWorthItems = [...parsed.netWorthItems, ...legacyGroups.map((item) => ({ ...item, isSample: legacyHoldings.length > 0 && legacyHoldings.every((holding) => holding.isSample) }))]
      parsed.holdings = []
      parsed.dataVersion = 2
    }
    if (parsed.dataVersion < 3) {
      // All balances use THB as their permanent base from version 3 onward.
      parsed.settings.currency = BASE_CURRENCY
      parsed.dataVersion = 3
    }
    if (parsed.dataVersion < 4) {
      parsed.netWorthHistory = []
      parsed.dataVersion = 4
    }
    if (!Array.isArray(parsed.netWorthHistory)) parsed.netWorthHistory = []
    if (parsed.dataVersion < 5) {
      parsed.incomePeriods = []
      parsed.dataVersion = 5
    }
    if (!Array.isArray(parsed.incomePeriods)) parsed.incomePeriods = []
    parsed.settings.cashReturnRate ??= 2
    parsed.settings.incomeReturnRate ??= 4
    parsed.settings.growthReturnRate ??= 7
    parsed.settings.lastNetWorthUpdated ??= parsed.settings.lastReviewed ?? new Date().toISOString()
    if (!CURRENCIES.some((currency) => currency.code === parsed.settings.currency)) {
      parsed.settings.currency = BASE_CURRENCY
    }
    if (parsed.isSample && parsed.holdings.length > 0 && parsed.holdings.every((holding) => holding.isSample === undefined)) {
      parsed.holdings = parsed.holdings.map((holding) => ({ ...holding, isSample: true }))
    }
    return parsed
  } catch {
    return null
  }
}

function loadData(): AppData {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return makeInitialData()
    return normalizeAppData(JSON.parse(saved)) ?? makeInitialData()
  } catch {
    return makeInitialData()
  }
}

function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function calculateNetWorthSnapshot(items: NetWorthItem[], date = new Date()): NetWorthSnapshot {
  const assets = items.filter((item) => !isLiabilityCategory(item.category)).reduce((sum, item) => sum + item.value, 0)
  const liabilities = items.filter((item) => isLiabilityCategory(item.category)).reduce((sum, item) => sum + item.value, 0)
  return {
    month: currentMonthKey(date),
    assets,
    liabilities,
    netWorth: assets - liabilities,
    updatedAt: date.toISOString(),
  }
}

function mergeNetWorthSnapshots(...collections: NetWorthSnapshot[][]) {
  const byMonth = new Map<string, NetWorthSnapshot>()
  collections.flat().forEach((snapshot) => {
    const existing = byMonth.get(snapshot.month)
    if (!existing || new Date(snapshot.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      byMonth.set(snapshot.month, snapshot)
    }
  })
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month))
}

function snapshotRowsToHistory(rows: Array<{ month: string; assets: number | string; liabilities: number | string; net_worth: number | string; updated_at: string }>): NetWorthSnapshot[] {
  return rows.map((row) => ({
    month: row.month.slice(0, 7),
    assets: Number(row.assets),
    liabilities: Number(row.liabilities),
    netWorth: Number(row.net_worth),
    updatedAt: row.updated_at,
  }))
}

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}

function currentTimestamp() {
  return Date.now()
}

function normalizeMoneyText(value: string) {
  const digitsOnly = value.replace(/\D/g, '')
  return digitsOnly.replace(/^0+(?=\d)/, '')
}

function moneyInputValue(value: number) {
  return value > 0 ? Math.round(value).toLocaleString('en-US') : ''
}

function moneyNumberFromText(value: string) {
  const normalized = normalizeMoneyText(value)
  return normalized ? Number(normalized) : 0
}

function normalizeRateText(value: string) {
  const cleaned = value.replace(/[^\d.]/g, '')
  if (!cleaned) return ''
  const hasDecimal = cleaned.includes('.')
  const [rawWhole, ...decimalParts] = cleaned.split('.')
  const whole = rawWhole ? rawWhole.replace(/^0+(?=\d)/, '') : '0'
  const decimal = decimalParts.join('').slice(0, 2)
  return `${whole || '0'}${hasDecimal ? '.' : ''}${decimal}`
}

function App() {
  const [data, setData] = useState<AppData>(loadData)
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateSnapshot>(loadCachedExchangeRates)
  const [exchangeRateStatus, setExchangeRateStatus] = useState<'loading' | 'live' | 'cached' | 'error'>('loading')
  const [page, setPage] = useState<Page>('networth')
  const [amountsVisible, setAmountsVisible] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [editingHolding, setEditingHolding] = useState<Holding | null | undefined>(undefined)
  const [editingNetWorthItem, setEditingNetWorthItem] = useState<NetWorthItem | null | undefined>(undefined)
  const [editingIncomePeriod, setEditingIncomePeriod] = useState<IncomePeriod | null | undefined>(undefined)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [reminderClock] = useState(currentTimestamp)
  const [toast, setToast] = useState<string | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(isSupabaseConfigured ? 'loading' : 'local')
  const [syncError, setSyncError] = useState<string | null>(null)
  const dataWithCurrentSnapshot = useMemo(() => ({
    ...data,
    netWorthHistory: mergeNetWorthSnapshots(data.netWorthHistory, [calculateNetWorthSnapshot(data.netWorthItems)]),
  }), [data])
  const dataRef = useRef(dataWithCurrentSnapshot)
  const cloudReadyRef = useRef(false)
  const skipNextCloudSaveRef = useRef(false)
  const lastRemoteUpdateRef = useRef<string | null>(null)

  useEffect(() => {
    dataRef.current = dataWithCurrentSnapshot
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dataWithCurrentSnapshot))
  }, [dataWithCurrentSnapshot])

  useEffect(() => {
    if (!supabase) return
    let active = true

    void supabase.auth.getSession().then(({ data: sessionData }) => {
      if (!active) return
      const sessionUser = sessionData.session?.user ?? null
      setUser(sessionUser)
      setSyncStatus(sessionUser ? 'loading' : 'local')
      setSyncError(null)
    })
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      const sessionUser = session?.user ?? null
      setUser(sessionUser)
      setSyncStatus(sessionUser ? 'loading' : 'local')
      setSyncError(null)
    })

    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    cloudReadyRef.current = false
    lastRemoteUpdateRef.current = null
    if (!supabase || !user) return
    const cloud = supabase

    let active = true
    const hydrateFromCloud = async () => {
      setSyncStatus('loading')
      const [portfolioResult, snapshotResult] = await Promise.all([
        cloud.from('portfolios').select('data, updated_at').eq('user_id', user.id).maybeSingle(),
        cloud.from('net_worth_snapshots').select('month, assets, liabilities, net_worth, updated_at').eq('user_id', user.id).order('month'),
      ])
      if (!active) return
      if (portfolioResult.error) {
        setSyncStatus('error')
        setSyncError(portfolioResult.error.message)
        return
      }
      if (snapshotResult.error) {
        setSyncStatus('error')
        setSyncError(snapshotResult.error.message)
        return
      }

      const portfolioRow = portfolioResult.data
      const remoteData = portfolioRow ? normalizeAppData(portfolioRow.data) : null
      if (remoteData) {
        remoteData.netWorthHistory = mergeNetWorthSnapshots(remoteData.netWorthHistory, snapshotRowsToHistory(snapshotResult.data ?? []))
        skipNextCloudSaveRef.current = true
        lastRemoteUpdateRef.current = portfolioRow!.updated_at
        setData(remoteData)
      } else {
        const now = new Date().toISOString()
        lastRemoteUpdateRef.current = now
        const localData = dataRef.current
        const snapshotRows = localData.netWorthHistory.map((snapshot) => ({
          user_id: user.id,
          month: `${snapshot.month}-01`,
          assets: snapshot.assets,
          liabilities: snapshot.liabilities,
          net_worth: snapshot.netWorth,
          updated_at: snapshot.updatedAt,
        }))
        const portfolioWrite = await cloud.from('portfolios').upsert({ user_id: user.id, data: localData, updated_at: now })
        const snapshotWrite = snapshotRows.length > 0
          ? await cloud.from('net_worth_snapshots').upsert(snapshotRows, { onConflict: 'user_id,month' })
          : { error: null }
        const error = portfolioWrite.error ?? snapshotWrite.error
        if (error) {
          setSyncStatus('error')
          setSyncError(error.message)
          return
        }
      }
      cloudReadyRef.current = true
      setSyncStatus('synced')
    }

    void hydrateFromCloud()
    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    if (!supabase || !user || !cloudReadyRef.current) return
    const cloud = supabase
    if (skipNextCloudSaveRef.current) {
      skipNextCloudSaveRef.current = false
      return
    }

    setSyncStatus('saving')
    const saveTimer = window.setTimeout(async () => {
      const updatedAt = new Date().toISOString()
      lastRemoteUpdateRef.current = updatedAt
      const snapshotRows = dataWithCurrentSnapshot.netWorthHistory.map((snapshot) => ({
        user_id: user.id,
        month: `${snapshot.month}-01`,
        assets: snapshot.assets,
        liabilities: snapshot.liabilities,
        net_worth: snapshot.netWorth,
        updated_at: snapshot.updatedAt,
      }))
      const portfolioResult = await cloud.from('portfolios').upsert({ user_id: user.id, data: dataWithCurrentSnapshot, updated_at: updatedAt })
      const snapshotResult = snapshotRows.length > 0
        ? await cloud.from('net_worth_snapshots').upsert(snapshotRows, { onConflict: 'user_id,month' })
        : { error: null }
      const error = portfolioResult.error ?? snapshotResult.error
      if (error) {
        setSyncStatus('error')
        setSyncError(error.message)
      } else {
        setSyncStatus('synced')
        setSyncError(null)
      }
    }, 700)

    return () => window.clearTimeout(saveTimer)
  }, [dataWithCurrentSnapshot, user])

  useEffect(() => {
    if (!supabase || !user) return
    const cloud = supabase
    const channel = cloud
      .channel(`portfolio-sync-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portfolios', filter: `user_id=eq.${user.id}` }, (payload) => {
        const row = payload.new as { data?: unknown; updated_at?: string }
        if (!row.data || !row.updated_at || row.updated_at === lastRemoteUpdateRef.current) return
        const remoteTimestamp = new Date(row.updated_at).getTime()
        const localTimestamp = lastRemoteUpdateRef.current ? new Date(lastRemoteUpdateRef.current).getTime() : 0
        if (remoteTimestamp <= localTimestamp) return
        const remoteData = normalizeAppData(row.data)
        if (!remoteData) return
        lastRemoteUpdateRef.current = row.updated_at
        skipNextCloudSaveRef.current = true
        setData(remoteData)
        setSyncStatus('synced')
        setSyncError(null)
      })
      .subscribe()

    return () => {
      void cloud.removeChannel(channel)
    }
  }, [user])

  useEffect(() => {
    let active = true
    let hasUsableRates = Boolean(loadCachedExchangeRates().rates.USD && loadCachedExchangeRates().rates.AUD)

    const refreshExchangeRates = async () => {
      setExchangeRateStatus((current) => current === 'live' ? 'live' : 'loading')
      try {
        const response = await fetch('https://api.frankfurter.dev/v2/rates?base=THB&quotes=USD,AUD')
        if (!response.ok) throw new Error(`Exchange-rate request failed: ${response.status}`)
        const payload = await response.json() as Array<{ date: string; base: string; quote: string; rate: number }>
        const usd = payload.find((item) => item.base === BASE_CURRENCY && item.quote === 'USD')
        const aud = payload.find((item) => item.base === BASE_CURRENCY && item.quote === 'AUD')
        if (!usd || !aud || !Number.isFinite(usd.rate) || !Number.isFinite(aud.rate)) throw new Error('Exchange-rate response was incomplete')
        const snapshot: ExchangeRateSnapshot = {
          rates: { THB: 1, USD: usd.rate, AUD: aud.rate },
          date: usd.date,
          fetchedAt: Date.now(),
        }
        if (!active) return
        hasUsableRates = true
        setExchangeRates(snapshot)
        setExchangeRateStatus('live')
        window.localStorage.setItem(EXCHANGE_RATE_CACHE_KEY, JSON.stringify(snapshot))
      } catch {
        if (!active) return
        setExchangeRateStatus(hasUsableRates ? 'cached' : 'error')
      }
    }

    void refreshExchangeRates()
    const refreshTimer = window.setInterval(refreshExchangeRates, 60 * 60 * 1000)
    return () => {
      active = false
      window.clearInterval(refreshTimer)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!notificationsOpen) return
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && setNotificationsOpen(false)
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [notificationsOpen])

  const totals = useMemo(() => {
    const total = data.holdings.reduce((sum, holding) => sum + holding.value, 0)
    const byClass = Object.fromEntries(ASSET_CLASSES.map((assetClass) => [assetClass, 0])) as Record<AssetClass, number>
    data.holdings.forEach((holding) => {
      byClass[holding.assetClass] += holding.value
    })
    const allocations = ASSET_CLASSES.map((assetClass) => {
      const value = byClass[assetClass]
      const current = total > 0 ? (value / total) * 100 : 0
      const target = data.targets[assetClass]
      return { assetClass, value, current, target, drift: current - target }
    })
    return { total, byClass, allocations }
  }, [data.holdings, data.targets])

  const netWorthTotals = useMemo(() => {
    const assets = data.netWorthItems.filter((item) => !isLiabilityCategory(item.category)).reduce((sum, item) => sum + item.value, 0)
    const liabilities = data.netWorthItems.filter((item) => isLiabilityCategory(item.category)).reduce((sum, item) => sum + item.value, 0)
    const cash = data.netWorthItems.filter((item) => item.category === 'Cash').reduce((sum, item) => sum + item.value, 0)
    return { assets, liabilities, cash, netWorth: assets - liabilities }
  }, [data.netWorthItems])

  const formatMoney = (value: number, compact = false) => {
    if (!amountsVisible) return '••••••'
    const rate = exchangeRates.rates[data.settings.currency]
    if (rate === undefined) return 'Rate unavailable'
    return new Intl.NumberFormat(currencyLocale(data.settings.currency), {
      style: 'currency',
      currency: data.settings.currency,
      maximumFractionDigits: compact ? 1 : 0,
      notation: compact ? 'compact' : 'standard',
    }).format(value * rate)
  }

  const selectedExchangeRate = exchangeRates.rates[data.settings.currency]
  const exchangeRateTitle = data.settings.currency === BASE_CURRENCY
    ? 'THB is the base currency used for all saved values'
    : selectedExchangeRate
      ? `1 THB = ${selectedExchangeRate.toFixed(5)} ${data.settings.currency}${exchangeRates.date ? ` · Reference rate ${exchangeRates.date}` : ''}`
      : `Latest ${data.settings.currency} rate is unavailable`

  const reminders: Reminder[] = (() => {
    const items: Reminder[] = []
    const day = 86400000
    const daysSinceNetWorthUpdate = Math.floor((reminderClock - new Date(data.settings.lastNetWorthUpdated).getTime()) / day)
    const daysSinceAssetReview = Math.floor((reminderClock - new Date(data.settings.lastReviewed).getTime()) / day)
    const reserveTarget = data.settings.monthlyEssentials * data.settings.emergencyTargetMonths
    const creditCardDebt = data.netWorthItems.filter((item) => item.category === 'Credit card').reduce((sum, item) => sum + item.value, 0)

    if (data.settings.hasHighInterestDebt || creditCardDebt > 0) {
      items.push({ id: 'high-interest-debt', title: 'Review costly debt', message: creditCardDebt > 0 ? `${formatMoney(creditCardDebt)} in credit-card balances is recorded.` : 'You reported high-interest debt in Financial Health.', page: 'plan', action: 'Open Financial Health', tone: 'coral' })
    }
    if (reserveTarget > 0 && netWorthTotals.cash < reserveTarget) {
      items.push({ id: 'emergency-fund', title: 'Emergency reserve gap', message: `${formatMoney(reserveTarget - netWorthTotals.cash)} remains to reach your ${data.settings.emergencyTargetMonths}-month target.`, page: 'plan', action: 'Review reserve', tone: 'sand' })
    }
    if (daysSinceNetWorthUpdate >= 30) {
      items.push({ id: 'monthly-update', title: 'Monthly net-worth update', message: `Your balances were last confirmed ${daysSinceNetWorthUpdate} days ago.`, page: 'networth', action: 'Review balances', tone: 'green', canComplete: true })
    }
    if (daysSinceAssetReview >= 90) {
      items.push({ id: 'asset-review', title: 'Investment plan review due', message: `Your asset organization was last reviewed ${daysSinceAssetReview} days ago.`, page: 'allocation', action: 'Open investment plan', tone: 'blue', canComplete: true })
    }
    if (data.netWorthItems.some((item) => item.isSample)) {
      items.push({ id: 'sample-data', title: 'Replace sample totals', message: 'Example assets and liabilities are still included in your net worth.', page: 'networth', action: 'Review examples', tone: 'sand' })
    }
    return items
  })()

  const updateSettings = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setData((current) => ({
      ...current,
      settings: { ...current.settings, [key]: value },
    }))
  }

  const sendMagicLink = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase || !authEmail.trim()) return
    setAuthBusy(true)
    setAuthMessage(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setAuthBusy(false)
    setAuthMessage(error ? error.message : 'Check your email and open the secure sign-in link on this device.')
  }

  const signOut = async () => {
    if (!supabase) return
    setAuthBusy(true)
    const { error } = await supabase.auth.signOut()
    setAuthBusy(false)
    if (error) {
      setAuthMessage(error.message)
      return
    }
    cloudReadyRef.current = false
    setAccountOpen(false)
    setToast('Signed out · data remains saved on this device')
  }

  const syncStatusLabel = !isSupabaseConfigured
    ? 'Saved on this device'
    : !user
      ? 'Sign in to sync'
      : syncStatus === 'loading'
        ? 'Loading cloud data'
        : syncStatus === 'saving'
          ? 'Saving changes'
          : syncStatus === 'synced'
            ? 'Synced across devices'
            : syncStatus === 'error'
              ? 'Sync needs attention'
              : 'Saved on this device'

  const navigate = (destination: Page) => {
    setPage(destination)
    setMobileNavOpen(false)
    setNotificationsOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const saveHolding = (holding: Holding) => {
    setData((current) => ({
      ...current,
      holdings: current.holdings.some((item) => item.id === holding.id)
        ? current.holdings.map((item) => (item.id === holding.id ? { ...holding, isSample: false } : item))
        : [...current.holdings, { ...holding, isSample: false }],
    }))
    setEditingHolding(undefined)
    setToast(editingHolding ? 'Holding updated' : 'Holding added')
  }

  const deleteHolding = (id: string) => {
    setData((current) => ({
      ...current,
      holdings: current.holdings.filter((item) => item.id !== id),
    }))
    setEditingHolding(undefined)
    setToast('Holding removed')
  }

  const clearSampleData = () => {
    if (!window.confirm('Remove the remaining sample holdings? Your own holdings will stay in place.')) return
    setData((current) => ({ ...current, holdings: current.holdings.filter((holding) => !holding.isSample), isSample: false }))
    setToast('Sample holdings cleared')
  }

  const saveNetWorthItem = (item: NetWorthItem) => {
    setData((current) => ({
      ...current,
      settings: { ...current.settings, lastNetWorthUpdated: new Date().toISOString() },
      netWorthItems: current.netWorthItems.some((existing) => existing.id === item.id)
        ? current.netWorthItems.map((existing) => (existing.id === item.id ? { ...item, isSample: false } : existing))
        : [...current.netWorthItems, { ...item, isSample: false }],
    }))
    setEditingNetWorthItem(undefined)
    setToast(editingNetWorthItem ? 'Item updated' : 'Item added')
  }

  const deleteNetWorthItem = (id: string) => {
    setData((current) => ({ ...current, settings: { ...current.settings, lastNetWorthUpdated: new Date().toISOString() }, netWorthItems: current.netWorthItems.filter((item) => item.id !== id) }))
    setEditingNetWorthItem(undefined)
    setToast('Item removed')
  }

  const clearSampleNetWorthItems = () => {
    if (!window.confirm('Remove the remaining sample assets and liabilities? Your own items will stay in place.')) return
    setData((current) => ({ ...current, settings: { ...current.settings, lastNetWorthUpdated: new Date().toISOString() }, netWorthItems: current.netWorthItems.filter((item) => !item.isSample) }))
    setToast('Sample net-worth items cleared')
  }

  const saveIncomePeriod = (period: IncomePeriod) => {
    setData((current) => ({
      ...current,
      incomePeriods: current.incomePeriods.some((item) => item.id === period.id)
        ? current.incomePeriods.map((item) => item.id === period.id ? period : item)
        : [...current.incomePeriods, period],
    }))
    setEditingIncomePeriod(undefined)
    setToast(editingIncomePeriod ? 'Income period updated' : 'Income period added')
  }

  const deleteIncomePeriod = (id: string) => {
    setData((current) => ({ ...current, incomePeriods: current.incomePeriods.filter((item) => item.id !== id) }))
    setEditingIncomePeriod(undefined)
    setToast('Income period removed')
  }

  const completeReminder = (reminder: Reminder) => {
    if (reminder.id === 'monthly-update') updateSettings('lastNetWorthUpdated', new Date().toISOString())
    if (reminder.id === 'asset-review') updateSettings('lastReviewed', new Date().toISOString())
    setToast(reminder.id === 'monthly-update' ? 'Balances marked as reviewed' : 'Investment plan marked as reviewed')
  }

  const renderPage = () => {
    switch (page) {
      case 'networth':
        return (
          <NetWorthPage
            items={data.netWorthItems}
            history={dataWithCurrentSnapshot.netWorthHistory}
            portfolioTotal={0}
            formatMoney={formatMoney}
            onAdd={() => setEditingNetWorthItem(null)}
            onEdit={setEditingNetWorthItem}
            onClearSample={clearSampleNetWorthItems}
            onNavigate={navigate}
          />
        )
      case 'allocation':
        return (
          <AssetPlanPage
            items={data.netWorthItems}
            settings={data.settings}
            formatMoney={formatMoney}
            updateSettings={updateSettings}
            onNavigate={navigate}
          />
        )
      case 'income':
        return (
          <IncomePage
            periods={data.incomePeriods}
            formatMoney={formatMoney}
            onAdd={() => setEditingIncomePeriod(null)}
            onEdit={setEditingIncomePeriod}
          />
        )
      case 'holdings':
        return (
          <HoldingsPage
            holdings={data.holdings}
            total={totals.total}
            formatMoney={formatMoney}
            onAdd={() => setEditingHolding(null)}
            onEdit={setEditingHolding}
            currency={BASE_CURRENCY}
          />
        )
      case 'plan':
        return (
          <PlanPage
            data={data}
            cash={netWorthTotals.cash}
            total={netWorthTotals.netWorth}
            formatMoney={formatMoney}
            updateSettings={updateSettings}
          />
        )
      default:
        return (
          <OverviewPage
            data={data}
            allocations={totals.allocations}
            total={totals.total}
            cash={totals.byClass.Cash}
            formatMoney={formatMoney}
            onNavigate={navigate}
            onAdd={() => setEditingHolding(null)}
            onClearSample={clearSampleData}
          />
        )
    }
  }

  return (
    <div className="app-shell">
      <aside className={cx('sidebar', mobileNavOpen && 'sidebar--open')}>
        <div className="brand">
          <div className="brand__mark"><Sprout size={19} strokeWidth={2.4} /></div>
          <span>steady</span>
        </div>

        <nav className="nav-list" aria-label="Main navigation">
          <p className="nav-eyebrow">Workspace</p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <button
                className={cx('nav-item', page === item.id && 'nav-item--active')}
                key={item.id}
                onClick={() => navigate(item.id)}
              >
                <span className={cx('nav-icon', `nav-icon--${item.tone}`)}><Icon size={17} strokeWidth={2.2} /></span>
                <span className="nav-label">{item.label}</span>
                {page === item.id && <span className="nav-dot" />}
              </button>
            )
          })}
        </nav>

        <div className="sidebar__footer">
          <div className="privacy-note">
            <ShieldCheck size={17} />
            <div><strong>Private by default</strong><span>{user ? 'Protected cloud sync' : 'Saved on this device'}</span></div>
          </div>
          <button type="button" className="profile-chip" onClick={() => setAccountOpen(true)}>
            <div className="avatar">{user?.email?.slice(0, 2).toUpperCase() ?? 'ME'}</div>
            <div><strong>{user?.email ?? 'My portfolio'}</strong><span>{syncStatusLabel}</span></div>
            {user && syncStatus !== 'error' ? <Cloud size={17} /> : syncStatus === 'error' ? <CloudOff size={17} /> : <MoreHorizontal size={17} />}
          </button>
        </div>
      </aside>

      {mobileNavOpen && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="topbar__trail">
            <span>My portfolio</span><ChevronRight size={14} /><strong>{NAV_ITEMS.find((item) => item.id === page)?.label}</strong>
          </div>
          <div className="topbar__actions">
            <label className="currency-control" title={exchangeRateTitle}>
              <span className="sr-only">Display currency</span>
              <select value={data.settings.currency} onChange={(event) => updateSettings('currency', event.target.value as CurrencyCode)} aria-label="Display currency">
                {CURRENCIES.map((currency) => <option value={currency.code} key={currency.code}>{currency.code}</option>)}
              </select>
              <span className={cx('exchange-status-dot', `exchange-status-dot--${exchangeRateStatus}`)} aria-hidden="true" />
              <span className="sr-only" aria-live="polite">{exchangeRateStatus === 'live' ? `Latest exchange rates loaded for ${exchangeRates.date}` : exchangeRateStatus === 'cached' ? 'Using the most recently saved exchange rates' : exchangeRateStatus === 'error' ? 'Exchange rates are currently unavailable' : 'Loading latest exchange rates'}</span>
            </label>
            <button
              className="icon-button"
              aria-label={amountsVisible ? 'Hide portfolio amounts' : 'Show portfolio amounts'}
              title={amountsVisible ? 'Hide amounts' : 'Show amounts'}
              onClick={() => setAmountsVisible((visible) => !visible)}
            >
              {amountsVisible ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            <div className="notification-wrap">
              <button
                className="icon-button notification-button"
                aria-label={`${reminders.length} active reminder${reminders.length === 1 ? '' : 's'}`}
                aria-expanded={notificationsOpen}
                aria-controls="reminder-panel"
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <Bell size={18} />
                {reminders.length > 0 && <span className="notification-dot">{reminders.length}</span>}
              </button>
              {notificationsOpen && (
                <div className="notification-panel" id="reminder-panel" role="dialog" aria-label="Financial reminders">
                  <div className="notification-panel__header">
                    <div><span>Stay on track</span><h2>Reminders</h2></div>
                    <span className="reminder-count">{reminders.length} active</span>
                  </div>
                  <div className="reminder-list">
                    {reminders.length > 0 ? reminders.map((reminder) => (
                      <div className="reminder-item" key={reminder.id}>
                        <div className={cx('reminder-icon', `reminder-icon--${reminder.tone}`)}>
                          {reminder.id === 'monthly-update' ? <CalendarClock size={17} /> : reminder.id === 'emergency-fund' ? <Landmark size={17} /> : reminder.id === 'high-interest-debt' ? <CircleMinus size={17} /> : reminder.id === 'asset-review' ? <PieChartIcon size={17} /> : <Sparkles size={17} />}
                        </div>
                        <div className="reminder-item__content">
                          <div><strong>{reminder.title}</strong>{reminder.canComplete && <button className="reminder-complete" aria-label={`Mark ${reminder.title} complete`} title="Mark complete" onClick={() => completeReminder(reminder)}><Check size={14} /></button>}</div>
                          <p>{reminder.message}</p>
                          <button className="text-button" onClick={() => navigate(reminder.page)}>{reminder.action} <ArrowRight size={14} /></button>
                        </div>
                      </div>
                    )) : (
                      <div className="reminder-empty"><BadgeCheck size={25} /><strong>You’re all caught up</strong><span>No reminders need attention right now.</span></div>
                    )}
                  </div>
                  <div className="notification-panel__footer"><ShieldCheck size={14} />Calculated privately from data on this device</div>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="page-wrap">{renderPage()}</div>
      </main>

      <nav className="mobile-tabs" aria-label="Mobile navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          return <button key={item.id} className={cx(page === item.id && 'active')} onClick={() => navigate(item.id)}><span className={cx('mobile-tab-icon', `mobile-tab-icon--${item.tone}`)}><Icon size={17} strokeWidth={2.2} /></span><span>{item.shortLabel}</span></button>
        })}
      </nav>

      {editingHolding !== undefined && (
        <HoldingModal
          holding={editingHolding}
          currency={BASE_CURRENCY}
          onClose={() => setEditingHolding(undefined)}
          onSave={saveHolding}
          onDelete={deleteHolding}
        />
      )}

      {editingNetWorthItem !== undefined && (
        <NetWorthItemModal
          item={editingNetWorthItem}
          currency={BASE_CURRENCY}
          onClose={() => setEditingNetWorthItem(undefined)}
          onSave={saveNetWorthItem}
          onDelete={deleteNetWorthItem}
        />
      )}

      {editingIncomePeriod !== undefined && (
        <IncomePeriodModal
          period={editingIncomePeriod}
          onClose={() => setEditingIncomePeriod(undefined)}
          onSave={saveIncomePeriod}
          onDelete={deleteIncomePeriod}
        />
      )}

      {accountOpen && (
        <AccountModal
          configured={isSupabaseConfigured}
          user={user}
          syncStatus={syncStatus}
          syncStatusLabel={syncStatusLabel}
          syncError={syncError}
          email={authEmail}
          message={authMessage}
          busy={authBusy}
          onEmailChange={setAuthEmail}
          onSubmit={sendMagicLink}
          onSignOut={signOut}
          onClose={() => {
            setAccountOpen(false)
            setAuthMessage(null)
          }}
        />
      )}

      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  )
}

type AllocationRow = {
  assetClass: AssetClass
  value: number
  current: number
  target: number
  drift: number
}

function PageHeading({ eyebrow, title, copy, actions }: { eyebrow?: string; title: string; copy: string; actions?: React.ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {actions && <div className="page-heading__actions">{actions}</div>}
    </div>
  )
}

function isLiabilityCategory(category: NetWorthCategory) {
  return LIABILITY_CATEGORIES.includes(category)
}

function NetWorthPage({ items, history, portfolioTotal, formatMoney, onAdd, onEdit, onClearSample, onNavigate }: {
  items: NetWorthItem[]
  history: NetWorthSnapshot[]
  portfolioTotal: number
  formatMoney: (value: number, compact?: boolean) => string
  onAdd: () => void
  onEdit: (item: NetWorthItem) => void
  onClearSample: () => void
  onNavigate: (page: Page) => void
}) {
  const assets = items.filter((item) => !isLiabilityCategory(item.category))
  const liabilities = items.filter((item) => isLiabilityCategory(item.category))
  const otherAssetsTotal = assets.reduce((sum, item) => sum + item.value, 0)
  const totalAssets = portfolioTotal + otherAssetsTotal
  const totalLiabilities = liabilities.reduce((sum, item) => sum + item.value, 0)
  const netWorth = totalAssets - totalLiabilities
  const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0
  const investableAssets = assets.filter((item) => ['Cash', 'Stocks / funds', 'Bonds / deposits'].includes(item.category)).reduce((sum, item) => sum + item.value, 0)

  const breakdown = [
    { label: 'Investment portfolio', value: portfolioTotal, color: NET_WORTH_META['Investment portfolio'].color },
    ...ASSET_CATEGORIES.map((category) => ({
      label: category,
      value: assets.filter((item) => item.category === category).reduce((sum, item) => sum + item.value, 0),
      color: NET_WORTH_META[category].color,
    })),
  ].filter((item) => item.value > 0)
  const groupedItems = [...ASSET_CATEGORIES, ...LIABILITY_CATEGORIES].map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0)

  return (
    <>
      <PageHeading
        eyebrow="Your complete picture"
        title="Net Worth"
        copy="See what you own, subtract what you owe, and follow the number that reflects your whole financial life."
        actions={<button className="button button--primary" onClick={onAdd}><Plus size={17} /> Add asset or debt</button>}
      />

      {items.some((item) => item.isSample) && (
        <div className="sample-banner">
          <div className="sample-banner__icon"><Sparkles size={18} /></div>
          <div><strong>Sample totals are included</strong><span>The cash, stocks, deposits, condo, and mortgage below are examples. Replace them with your totals.</span></div>
          <button className="button button--small" onClick={onClearSample}>Remove examples</button>
        </div>
      )}

      <section className="metric-grid net-worth-metrics" aria-label="Net Worth summary">
        <MetricCard label="Total net worth" value={formatMoney(netWorth)} helper="Everything you own minus everything you owe" icon={Scale} tone="green" />
        <MetricCard label="Total assets" value={formatMoney(totalAssets)} helper={`${assets.length + (portfolioTotal > 0 ? 1 : 0)} asset group${assets.length + (portfolioTotal > 0 ? 1 : 0) === 1 ? '' : 's'} tracked`} icon={BadgeCheck} tone="sand" />
        <MetricCard label="Total liabilities" value={formatMoney(totalLiabilities)} helper={totalLiabilities > 0 ? `${debtRatio.toFixed(1)}% of total assets` : 'No liabilities recorded'} icon={CircleMinus} tone={totalLiabilities > 0 ? 'coral' : 'green'} />
        <MetricCard label="Investable assets" value={formatMoney(investableAssets)} helper="Cash, stocks, funds, bonds, and deposits" icon={TrendingUp} tone="blue" />
      </section>

      <NetWorthHistoryCard history={history} formatMoney={formatMoney} />

      <section className="net-worth-grid">
        <div className="card net-worth-composition">
          <CardHeader eyebrow="What you own" title="Asset composition" action={<button className="text-button" onClick={() => onNavigate('allocation')}>Organize assets <ArrowRight size={15} /></button>} />
          {totalAssets > 0 ? (
            <div className="net-worth-composition__body">
              <div className="nw-donut-wrap">
                <div className="donut-chart" role="img" aria-label={breakdown.map((item) => `${item.label} ${((item.value / totalAssets) * 100).toFixed(1)} percent`).join(', ')} style={{ background: getBreakdownGradient(breakdown) }} />
                <div className="donut-center"><span>Total assets</span><strong>{formatMoney(totalAssets, true)}</strong></div>
              </div>
              <div className="net-worth-legend">
                {breakdown.map((item) => (
                  <div className="nw-legend-row" key={item.label}>
                    <span className="legend-dot" style={{ background: item.color }} />
                    <div><strong>{item.label}</strong><span>{((item.value / totalAssets) * 100).toFixed(1)}% of assets</span></div>
                    <strong>{formatMoney(item.value)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : <EmptyState icon={Scale} title="Start your balance sheet" copy="Add cash, property, or another asset to calculate your total net worth." action="Add an asset" onAction={onAdd} />}
        </div>

        <div className="card net-worth-equation">
          <CardHeader eyebrow="The calculation" title="How it adds up" />
          <div className="equation-list">
            <div><span className="equation-icon equation-icon--asset"><Plus size={17} /></span><div><span>Total assets</span><strong>{formatMoney(totalAssets)}</strong></div></div>
            <div><span className="equation-icon equation-icon--debt"><CircleMinus size={17} /></span><div><span>Total liabilities</span><strong>− {formatMoney(totalLiabilities)}</strong></div></div>
            <div className="equation-result"><span>Net Worth</span><strong className={cx(netWorth < 0 && 'negative')}>{formatMoney(netWorth)}</strong></div>
          </div>
          <div className="net-worth-guidance">
            <Sprout size={18} />
            <div><strong>Track the direction, not daily noise.</strong><span>Update property and debt periodically. Avoid changing estimates just because markets move for a day.</span></div>
          </div>
        </div>
      </section>

      <section className="card balance-sheet-card">
        <CardHeader eyebrow="Accounts & property" title="Your balance sheet" />
        <div className="balance-sheet-list">
          {groupedItems.map((group) => {
            const liability = isLiabilityCategory(group.category)
            const subtotal = group.items.reduce((sum, item) => sum + item.value, 0)
            const meta = NET_WORTH_META[group.category]
            if (group.items.length === 1) {
              return <SingleBalanceRow key={group.category} item={group.items[0]} formatMoney={formatMoney} onEdit={onEdit} />
            }
            return (
              <div className="balance-group" key={group.category}>
                <div className="balance-group__header">
                  <div className="balance-group__identity">
                    <span style={{ color: meta.color, background: meta.soft }}><CategoryIcon category={group.category} size={16} /></span>
                    <div><strong>{group.category}</strong><small>{group.items.length} item{group.items.length === 1 ? '' : 's'} · {liability ? 'Liability' : 'Asset'}</small></div>
                  </div>
                  <strong className={cx(liability && 'negative')}>{liability ? '− ' : ''}{formatMoney(subtotal)}</strong>
                </div>
                <div className="balance-group__items">
                  {group.items.map((item) => <BalanceRow key={item.id} item={item} formatMoney={formatMoney} onEdit={onEdit} />)}
                </div>
              </div>
            )
          })}
          {portfolioTotal === 0 && items.length === 0 && <EmptyState icon={Scale} title="Nothing tracked yet" copy="Add your cash, property, vehicles, or debts to begin." action="Add asset or debt" onAction={onAdd} />}
        </div>
      </section>

      <div className="double-count-note"><ShieldCheck size={18} /><div><strong>Add each account or property once</strong><span>Category totals are calculated automatically. Record a condo’s current value as an asset and its outstanding mortgage as a separate liability.</span></div></div>
    </>
  )
}

function NetWorthHistoryCard({ history, formatMoney }: { history: NetWorthSnapshot[]; formatMoney: (value: number, compact?: boolean) => string }) {
  const visibleHistory = history.slice(-12)
  const latest = visibleHistory.at(-1)
  const previous = visibleHistory.at(-2)
  const change = latest && previous ? latest.netWorth - previous.netWorth : null
  const changePercent = change !== null && previous && previous.netWorth !== 0 ? (change / Math.abs(previous.netWorth)) * 100 : null
  const values = visibleHistory.map((snapshot) => snapshot.netWorth)
  const chartWidth = 880
  const chartHeight = 260
  const chartLeft = 82
  const chartRight = 24
  const chartTop = 24
  const chartBottom = 34
  const rawMinimum = Math.min(...values)
  const rawMaximum = Math.max(...values)
  const chartBuffer = Math.max((rawMaximum - rawMinimum) * .15, Math.abs(rawMaximum) * .04, 1)
  const minimum = rawMinimum - chartBuffer
  const maximum = rawMaximum + chartBuffer
  const range = Math.max(1, maximum - minimum)
  const points = visibleHistory.map((snapshot, index) => {
    const x = visibleHistory.length === 1 ? chartWidth / 2 : chartLeft + (index / (visibleHistory.length - 1)) * (chartWidth - chartLeft - chartRight)
    const y = chartTop + ((maximum - snapshot.netWorth) / range) * (chartHeight - chartTop - chartBottom)
    return { ...snapshot, x, y }
  })
  const labelEvery = Math.max(1, Math.ceil(visibleHistory.length / 6))
  const gridLevels = [0, .5, 1].map((position) => ({
    position,
    y: chartTop + position * (chartHeight - chartTop - chartBottom),
    value: maximum - position * range,
  }))
  const chartFloor = chartHeight - chartBottom
  const areaPoints = points.length > 1 ? `${points[0].x},${chartFloor} ${points.map((point) => `${point.x},${point.y}`).join(' ')} ${points.at(-1)!.x},${chartFloor}` : ''

  return (
    <section className="card history-card">
      <div className="history-card__header">
        <CardHeader eyebrow="Progress over time" title="Monthly net-worth history" />
        <span className="history-auto-chip"><CalendarClock size={14} /> Saved automatically</span>
      </div>
      {latest ? (
        visibleHistory.length === 1 ? (
          <div className="history-start">
            <div className="history-start__primary"><span>Starting point · {formatSnapshotMonth(latest.month, true)}</span><strong>{formatMoney(latest.netWorth)}</strong><small>Net worth</small></div>
            <div className="history-start__breakdown"><div><span>Total assets</span><strong>{formatMoney(latest.assets)}</strong></div><div><span>Total liabilities</span><strong>{formatMoney(latest.liabilities)}</strong></div></div>
            <div className="history-start__next"><span className="history-start__dot"><Check size={15} /></span><i /><span className="history-start__calendar"><CalendarClock size={17} /></span><div><strong>Next point: {formatSnapshotMonth(nextSnapshotMonth(latest.month), true)}</strong><span>Update your balances next month to reveal your first trend.</span></div></div>
          </div>
        ) : (
          <>
            <div className="history-stats">
              <div><span>Latest net worth</span><strong>{formatMoney(latest.netWorth)}</strong></div>
              <div><span>Monthly change</span><strong className={cx(change !== null && change < 0 && 'negative')}>{change !== null && change >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}{change === null ? '—' : `${change >= 0 ? '+' : '−'}${formatMoney(Math.abs(change))}`}</strong>{changePercent !== null && <small>{changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}%</small>}</div>
              <div><span>Total assets</span><strong>{formatMoney(latest.assets)}</strong></div>
              <div><span>Total liabilities</span><strong>{formatMoney(latest.liabilities)}</strong></div>
            </div>
            <div className="history-chart" role="img" aria-label={visibleHistory.map((snapshot) => `${formatSnapshotMonth(snapshot.month)} net worth ${formatMoney(snapshot.netWorth)}`).join(', ')}>
              <div className="history-chart__legend"><span><i /> Net worth</span><small>{visibleHistory.length} monthly snapshots · latest 12 months</small></div>
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} aria-hidden="true">
                <defs><linearGradient id="history-area-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5f9a85" stopOpacity=".28" /><stop offset="100%" stopColor="#5f9a85" stopOpacity=".02" /></linearGradient></defs>
                {gridLevels.map((level) => <g key={level.position}><line x1={chartLeft} x2={chartWidth - chartRight} y1={level.y} y2={level.y} className="history-grid-line" /><text x={chartLeft - 11} y={level.y + 4} textAnchor="end" className="history-axis-label">{formatMoney(level.value, true)}</text></g>)}
                {minimum < 0 && maximum > 0 && <line x1={chartLeft} x2={chartWidth - chartRight} y1={chartTop + (maximum / range) * (chartHeight - chartTop - chartBottom)} y2={chartTop + (maximum / range) * (chartHeight - chartTop - chartBottom)} className="history-zero-line" />}
                <polygon points={areaPoints} className="history-area" />
                <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} className="history-line" />
                {points.map((point, index) => <g key={point.month}><circle cx={point.x} cy={point.y} r={index === points.length - 1 ? 6 : 4} className={cx('history-point', index === points.length - 1 && 'history-point--latest')}><title>{formatSnapshotMonth(point.month, true)} · {formatMoney(point.netWorth)}</title></circle>{(index % labelEvery === 0 || index === points.length - 1) && <text x={point.x} y={chartHeight - 8} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} className="history-month-label">{formatSnapshotMonth(point.month)}</text>}</g>)}
              </svg>
            </div>
          </>
        )
      ) : <div className="history-empty"><CalendarClock size={22} /><div><strong>Your history starts this month</strong><span>Steady will keep one snapshot for each month when you update your balances.</span></div></div>}
    </section>
  )
}

function formatSnapshotMonth(month: string, longYear = false) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: longYear ? 'numeric' : '2-digit' })
}

function nextSnapshotMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00`)
  date.setMonth(date.getMonth() + 1)
  return currentMonthKey(date)
}

function CategoryIcon({ category, size = 18 }: { category: NetWorthCategory; size?: number }) {
  if (category === 'Cash') return <Banknote size={size} />
  if (category === 'Stocks / funds') return <TrendingUp size={size} />
  if (category === 'Bonds / deposits') return <Landmark size={size} />
  if (category === 'Property') return <Building2 size={size} />
  if (isLiabilityCategory(category)) return <CircleMinus size={size} />
  return <CircleDollarSign size={size} />
}

function SingleBalanceRow({ item, formatMoney, onEdit }: { item: NetWorthItem; formatMoney: (value: number) => string; onEdit: (item: NetWorthItem) => void }) {
  const liability = isLiabilityCategory(item.category)
  const meta = NET_WORTH_META[item.category]
  return (
    <div className={cx('balance-single', liability && 'balance-single--liability')}>
      <span className="balance-single__icon" style={{ color: meta.color, background: meta.soft }}><CategoryIcon category={item.category} size={17} /></span>
      <div className="balance-single__content">
        <span>{item.category}{liability ? ' · Liability' : ''}</span>
        <strong>{item.name}</strong>
        {item.note && <small>{item.note}</small>}
      </div>
      <strong className={cx('balance-value', liability && 'balance-value--debt')}>{liability ? '− ' : ''}{formatMoney(item.value)}</strong>
      <button className="icon-button icon-button--small" aria-label={`Edit ${item.name}`} onClick={() => onEdit(item)}><Pencil size={15} /></button>
    </div>
  )
}

function BalanceRow({ item, formatMoney, onEdit }: { item: NetWorthItem; formatMoney: (value: number) => string; onEdit: (item: NetWorthItem) => void }) {
  const liability = isLiabilityCategory(item.category)
  return (
    <div className={cx('balance-row', liability ? 'balance-row--liability' : 'balance-row--asset')}>
      <div className="balance-name"><strong>{item.name}</strong>{item.note && <span>{item.note}</span>}</div>
      {liability && <span className="balance-kind balance-kind--debt">Liability</span>}
      <strong className={cx('balance-value', liability && 'balance-value--debt')}>{liability ? '− ' : ''}{formatMoney(item.value)}</strong>
      <button className="icon-button icon-button--small" aria-label={`Edit ${item.name}`} onClick={() => onEdit(item)}><Pencil size={15} /></button>
    </div>
  )
}

function getBreakdownGradient(items: Array<{ value: number; color: string }>) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  let cursor = 0
  const slices: string[] = []
  items.forEach((item) => {
    const end = cursor + (item.value / total) * 360
    const gap = Math.min(1.8, (end - cursor) / 4)
    slices.push(`${item.color} ${cursor.toFixed(2)}deg ${(end - gap).toFixed(2)}deg`)
    slices.push(`#fffefa ${(end - gap).toFixed(2)}deg ${end.toFixed(2)}deg`)
    cursor = end
  })
  return `conic-gradient(from -90deg, ${slices.join(', ')})`
}

function OverviewPage({
  data,
  allocations,
  total,
  cash,
  formatMoney,
  onNavigate,
  onAdd,
  onClearSample,
}: {
  data: AppData
  allocations: AllocationRow[]
  total: number
  cash: number
  formatMoney: (value: number, compact?: boolean) => string
  onNavigate: (page: Page) => void
  onAdd: () => void
  onClearSample: () => void
}) {
  const maxDrift = Math.max(...allocations.map((item) => Math.abs(item.drift)), 0)
  const cashMonths = data.settings.monthlyEssentials > 0 ? cash / data.settings.monthlyEssentials : 0
  const readiness = getReadinessScore(data.settings, cashMonths)
  const reviewDate = new Date(data.settings.lastReviewed)
  reviewDate.setDate(reviewDate.getDate() + 90)
  const daysUntilReview = Math.ceil((reviewDate.getTime() - Date.now()) / 86400000)
  const contributionPlan = getContributionPlan(allocations, total, data.settings.monthlyContribution)
  const largestHolding = data.holdings.reduce<Holding | null>((largest, item) => (!largest || item.value > largest.value ? item : largest), null)
  const concentration = largestHolding && total > 0 ? (largestHolding.value / total) * 100 : 0

  const dateText = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date())

  return (
    <>
      <PageHeading
        eyebrow={dateText}
        title="Good to see you."
        copy="A clear view of what you own—and what deserves attention next."
        actions={<button className="button button--secondary" onClick={() => onNavigate('plan')}><CalendarClock size={17} /> Review my plan</button>}
      />

      {data.holdings.some((holding) => holding.isSample) && (
        <div className="sample-banner">
          <div className="sample-banner__icon"><Sparkles size={18} /></div>
          <div><strong>You’re viewing a sample portfolio</strong><span>Explore freely, then clear it when you’re ready to add your own numbers.</span></div>
          <button className="button button--small" onClick={onClearSample}>Start with my numbers</button>
        </div>
      )}

      <section className="metric-grid" aria-label="Portfolio summary">
        <MetricCard
          label="Portfolio value"
          value={formatMoney(total)}
          helper={`${data.holdings.length} holding${data.holdings.length === 1 ? '' : 's'} across ${allocations.filter((item) => item.value > 0).length} asset classes`}
          icon={CircleDollarSign}
          tone="green"
        />
        <MetricCard
          label="Monthly contribution"
          value={formatMoney(data.settings.monthlyContribution)}
          helper={data.settings.autoContributions ? 'Automatic deposits are on' : 'Automatic deposits are off'}
          icon={TrendingUp}
          tone="sand"
        />
        <MetricCard
          label="Largest allocation drift"
          value={`${maxDrift.toFixed(1)}%`}
          helper={maxDrift > data.settings.driftThreshold ? `Above your ${data.settings.driftThreshold}% review band` : `Inside your ${data.settings.driftThreshold}% review band`}
          icon={BarChart3}
          tone={maxDrift > data.settings.driftThreshold ? 'coral' : 'green'}
        />
        <MetricCard
          label="Cash buffer"
          value={`${cashMonths.toFixed(1)} months`}
          helper={`${formatMoney(cash)} of ${data.settings.emergencyTargetMonths} months planned`}
          icon={Landmark}
          tone="blue"
        />
      </section>

      <section className="overview-grid">
        <div className="card allocation-card">
          <CardHeader
            eyebrow="Current mix"
            title="Asset allocation"
            action={<button className="text-button" onClick={() => onNavigate('allocation')}>Edit targets <ArrowRight size={15} /></button>}
          />
          {total > 0 ? (
            <div className="allocation-card__body">
              <div className="donut-wrap">
                <div
                  className="donut-chart"
                  role="img"
                  aria-label={allocations.map((item) => `${item.assetClass} ${item.current.toFixed(1)} percent`).join(', ')}
                  style={{ background: getDonutGradient(allocations) }}
                />
                <div className="donut-center"><span>Total invested</span><strong>{formatMoney(total, true)}</strong></div>
              </div>
              <div className="allocation-legend">
                {allocations.map((item) => (
                  <div className="legend-row" key={item.assetClass}>
                    <span className="legend-dot" style={{ background: CLASS_META[item.assetClass].color }} />
                    <span className="legend-name">{item.assetClass}</span>
                    <strong>{item.current.toFixed(1)}%</strong>
                    <span className={cx('drift-pill', Math.abs(item.drift) < 0.1 ? 'neutral' : item.drift > 0 ? 'up' : 'down')}>
                      {item.drift > 0 ? '+' : ''}{item.drift.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : <EmptyState icon={PieChartIcon} title="No holdings yet" copy="Add your first holding to see your current allocation." action="Add a holding" onAction={onAdd} />}
        </div>

        <div className="card readiness-card">
          <CardHeader eyebrow="Financial foundation" title="Readiness check" />
          <div className="score-row">
            <div className="score-ring" style={{ '--score': `${readiness}%` } as React.CSSProperties}>
              <div><strong>{readiness}</strong><span>/ 100</span></div>
            </div>
            <div><span className="status-badge"><BadgeCheck size={14} /> {readiness >= 75 ? 'On a steady path' : 'Building resilience'}</span><p>A planning checklist, not an investment or credit rating.</p></div>
          </div>
          <div className="check-list">
            <CheckItem done={cashMonths >= data.settings.emergencyTargetMonths} label="Emergency reserve" detail={`${cashMonths.toFixed(1)} of ${data.settings.emergencyTargetMonths} months`} />
            <CheckItem done={!data.settings.hasHighInterestDebt} label="High-interest debt" detail={data.settings.hasHighInterestDebt ? 'Paydown plan needed' : 'None reported'} />
            <CheckItem done={data.settings.autoContributions} label="Automatic investing" detail={data.settings.autoContributions ? 'Running monthly' : 'Not set up'} />
            <CheckItem done={data.settings.savingsRate >= 15} label="Savings habit" detail={`${data.settings.savingsRate}% of income`} />
          </div>
          <button className="button button--secondary button--full" onClick={() => onNavigate('plan')}>Strengthen my plan <ArrowRight size={16} /></button>
        </div>
      </section>

      <section className="card rebalance-card">
        <CardHeader
          eyebrow="Contribution-first rebalancing"
          title="Put your next deposit to work"
          action={<span className="review-chip"><CalendarClock size={14} /> {daysUntilReview > 0 ? `Review in ${daysUntilReview} days` : 'Review due now'}</span>}
        />
        <p className="section-intro">Directing new money toward underweight assets can reduce drift without immediately selling. Check fees and taxes before you trade.</p>
        {contributionPlan.length > 0 ? (
          <div className="action-grid">
            {contributionPlan.slice(0, 3).map((item, index) => (
              <div className="action-item" key={item.assetClass}>
                <div className="action-step">0{index + 1}</div>
                <div className="action-icon" style={{ color: CLASS_META[item.assetClass].color, background: CLASS_META[item.assetClass].soft }}>
                  <ArrowDownRight size={19} />
                </div>
                <div><strong>Add {formatMoney(item.amount)} to {item.assetClass}</strong><span>Currently {item.current.toFixed(1)}% · target {item.target}%</span></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="all-good"><BadgeCheck size={20} /><div><strong>Your allocation is on plan</strong><span>There are no underweight asset classes to fund right now.</span></div></div>
        )}
      </section>

      <section className="insight-strip">
        <div className="insight-strip__icon"><ShieldCheck size={21} /></div>
        <div>
          <strong>{concentration > 25 ? 'Review concentration risk' : 'Your largest holding is within the app’s review level'}</strong>
          <span>{largestHolding ? `${largestHolding.ticker} is ${concentration.toFixed(1)}% of this portfolio. ` : ''}Diversification reduces some risks, but it cannot prevent losses.</span>
        </div>
        <button className="text-button" onClick={() => onNavigate('holdings')}>See holdings <ArrowRight size={15} /></button>
      </section>
    </>
  )
}

function MetricCard({ label, value, helper, icon: Icon, tone }: { label: string; value: string; helper: string; icon: LucideIcon; tone: string }) {
  return (
    <div className="metric-card">
      <div className={cx('metric-icon', `metric-icon--${tone}`)}><Icon size={19} /></div>
      <div className="metric-card__label">{label}</div>
      <div className="metric-card__value">{value}</div>
      <div className="metric-card__helper">{helper}</div>
    </div>
  )
}

function CardHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="card-header">
      <div>{eyebrow && <span>{eyebrow}</span>}<h2>{title}</h2></div>
      {action}
    </div>
  )
}

function getDonutGradient(allocations: AllocationRow[]) {
  let cursor = 0
  const slices: string[] = []
  allocations.filter((item) => item.current > 0).forEach((item) => {
    const end = cursor + (item.current / 100) * 360
    const gap = Math.min(1.8, (end - cursor) / 4)
    slices.push(`${CLASS_META[item.assetClass].color} ${cursor.toFixed(2)}deg ${(end - gap).toFixed(2)}deg`)
    slices.push(`#fffefa ${(end - gap).toFixed(2)}deg ${end.toFixed(2)}deg`)
    cursor = end
  })
  return `conic-gradient(from -90deg, ${slices.join(', ')})`
}

function CheckItem({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div className="check-item">
      <div className={cx('check-mark', done && 'check-mark--done')}>{done ? <Check size={14} /> : <span />}</div>
      <div><strong>{label}</strong><span>{detail}</span></div>
      {!done && <ArrowRight size={15} />}
    </div>
  )
}

function getReadinessScore(settings: AppSettings, cashMonths: number) {
  const reservePoints = Math.min(cashMonths / Math.max(settings.emergencyTargetMonths, 1), 1) * 35
  const savingsPoints = Math.min(settings.savingsRate / 20, 1) * 25
  const debtPoints = settings.hasHighInterestDebt ? 0 : 25
  const automationPoints = settings.autoContributions ? 15 : 0
  return Math.round(reservePoints + savingsPoints + debtPoints + automationPoints)
}

function getContributionPlan(allocations: AllocationRow[], total: number, contribution: number) {
  if (contribution <= 0 || total <= 0) return []
  const gaps = allocations.map((item) => ({ ...item, dollarGap: Math.max(0, (item.target / 100) * total - item.value) })).filter((item) => item.dollarGap > 1)
  const totalGap = gaps.reduce((sum, item) => sum + item.dollarGap, 0)
  return gaps.sort((a, b) => b.dollarGap - a.dollarGap).map((item) => ({ ...item, amount: Math.round((item.dollarGap / totalGap) * contribution) }))
}

type PlanBucket = 'Cash reserve' | 'Income assets' | 'Growth assets'

const PLAN_META: Record<PlanBucket, { color: string; soft: string; description: string }> = {
  'Cash reserve': { color: '#77a991', soft: '#e5efe9', description: 'Cash and accessible savings' },
  'Income assets': { color: '#7896a0', soft: '#e5edef', description: 'Deposits and diversified bonds' },
  'Growth assets': { color: '#173f35', soft: '#dce9e3', description: 'Diversified stocks and funds' },
}

const PROFILE_MIX: Record<AppSettings['riskProfile'], { cash: number; income: number; growth: number; description: string }> = {
  Conservative: { cash: 30, income: 45, growth: 25, description: 'Prioritizes stability and access to money.' },
  Balanced: { cash: 15, income: 35, growth: 50, description: 'Balances stability with long-term growth.' },
  Growth: { cash: 10, income: 20, growth: 70, description: 'Accepts more volatility for higher potential growth.' },
}

function AssetPlanPage({ items, settings, formatMoney, updateSettings, onNavigate }: {
  items: NetWorthItem[]
  settings: AppSettings
  formatMoney: (value: number, compact?: boolean) => string
  updateSettings: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  onNavigate: (page: Page) => void
}) {
  const cash = items.filter((item) => item.category === 'Cash').reduce((sum, item) => sum + item.value, 0)
  const income = items.filter((item) => item.category === 'Bonds / deposits').reduce((sum, item) => sum + item.value, 0)
  const growth = items.filter((item) => item.category === 'Stocks / funds').reduce((sum, item) => sum + item.value, 0)
  const investable = cash + income + growth
  const excludedAssets = items.filter((item) => ASSET_CATEGORIES.includes(item.category) && !['Cash', 'Stocks / funds', 'Bonds / deposits'].includes(item.category)).reduce((sum, item) => sum + item.value, 0)
  const highInterestDebt = settings.hasHighInterestDebt || items.some((item) => item.category === 'Credit card' && item.value > 0)
  const profile = PROFILE_MIX[settings.riskProfile]
  const reserveNeed = Math.max(0, settings.monthlyEssentials * settings.emergencyTargetMonths)
  const cashTarget = investable > 0 ? Math.min(investable, Math.max((profile.cash / 100) * investable, reserveNeed)) : 0
  const remaining = Math.max(0, investable - cashTarget)
  const riskWeightTotal = profile.income + profile.growth
  const incomeTarget = riskWeightTotal > 0 ? remaining * (profile.income / riskWeightTotal) : 0
  const growthTarget = riskWeightTotal > 0 ? remaining * (profile.growth / riskWeightTotal) : 0
  const targets: Array<{ bucket: PlanBucket; current: number; target: number; rate: number }> = [
    { bucket: 'Cash reserve', current: cash, target: cashTarget, rate: settings.cashReturnRate },
    { bucket: 'Income assets', current: income, target: incomeTarget, rate: settings.incomeReturnRate },
    { bucket: 'Growth assets', current: growth, target: growthTarget, rate: settings.growthReturnRate },
  ]
  const currentAnnualGrowth = cash * settings.cashReturnRate / 100 + income * settings.incomeReturnRate / 100 + growth * settings.growthReturnRate / 100
  const targetAnnualGrowth = targets.reduce((sum, item) => sum + item.target * item.rate / 100, 0)
  const targetRate = investable > 0 ? (targetAnnualGrowth / investable) * 100 : 0
  const projected5 = futureValue(investable, targetRate, 5, settings.monthlyContribution)
  const projected10 = futureValue(investable, targetRate, 10, settings.monthlyContribution)

  return (
    <>
      <PageHeading
        eyebrow="Illustrative organization"
        title="Investment Plan"
        copy="Use your asset totals to compare your current mix with a simple cash, income, and growth framework."
        actions={<span className="assumption-chip"><Sparkles size={14} /> Uses editable assumptions</span>}
      />

      {highInterestDebt && (
        <div className="priority-banner"><CircleMinus size={19} /><div><strong>High-interest debt comes first</strong><span>The assumed investment return may be lower and less certain than the cost of costly debt. Review your payoff plan before reallocating for growth.</span></div></div>
      )}

      <section className="metric-grid" aria-label="Investment Plan summary">
        <MetricCard label="Investable assets" value={formatMoney(investable)} helper="Cash, deposits, bonds, stocks, and funds" icon={CircleDollarSign} tone="green" />
        <MetricCard label="Illustrative annual rate" value={`${targetRate.toFixed(1)}%`} helper="Weighted from your editable assumptions" icon={TrendingUp} tone="sand" />
        <MetricCard label="Estimated first-year growth" value={formatMoney(targetAnnualGrowth)} helper={`Current mix estimate: ${formatMoney(currentAnnualGrowth)}`} icon={BarChart3} tone="blue" />
        <MetricCard label="10-year illustration" value={formatMoney(projected10)} helper={`Includes ${formatMoney(settings.monthlyContribution)} monthly`} icon={CalendarClock} tone="coral" />
      </section>

      <div className="asset-plan-grid">
        <section className="card suggested-mix-card">
          <CardHeader eyebrow={`${settings.riskProfile} framework`} title="Current vs. suggested mix" />
          <p className="section-intro">The cash target is increased when necessary to cover your {settings.emergencyTargetMonths}-month emergency-reserve goal.</p>
          {investable > 0 ? (
            <div className="plan-allocation-list">
              {targets.map((item) => {
                const currentPercent = (item.current / investable) * 100
                const targetPercent = (item.target / investable) * 100
                const difference = item.target - item.current
                return (
                  <div className="plan-allocation-row" key={item.bucket}>
                    <div className="plan-allocation-row__title"><span className="plan-swatch" style={{ background: PLAN_META[item.bucket].color }} /><div><strong>{item.bucket}</strong><span>{PLAN_META[item.bucket].description}</span></div><strong>{formatMoney(item.target)}</strong></div>
                    <div className="compare-bars">
                      <div><span>Current</span><i><b style={{ width: `${Math.min(currentPercent, 100)}%`, background: '#c7cfca' }} /></i><strong>{currentPercent.toFixed(1)}%</strong></div>
                      <div><span>Suggested</span><i><b style={{ width: `${Math.min(targetPercent, 100)}%`, background: PLAN_META[item.bucket].color }} /></i><strong>{targetPercent.toFixed(1)}%</strong></div>
                    </div>
                    <div className={cx('plan-adjustment', Math.abs(difference) < investable * .005 && 'plan-adjustment--steady', difference < 0 && 'plan-adjustment--reduce')}>
                      {Math.abs(difference) < investable * .005 ? <Check size={14} /> : difference > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      {Math.abs(difference) < investable * .005 ? 'Close to suggested' : `${difference > 0 ? 'Increase' : 'Reduce'} by ${formatMoney(Math.abs(difference))}`}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : <EmptyState icon={PieChartIcon} title="Add your asset totals first" copy="Enter cash, stocks or funds, and bonds or deposits on the Net Worth page to generate a plan." action="Go to Net Worth" onAction={() => onNavigate('networth')} />}
        </section>

        <section className="card calculator-card">
          <CardHeader eyebrow="Your assumptions" title="Growth calculator" />
          <p className="section-intro">These rates are estimates for comparison—not promises or forecasts.</p>
          <label className="field"><span>Risk framework</span><select value={settings.riskProfile} onChange={(event) => updateSettings('riskProfile', event.target.value as AppSettings['riskProfile'])}><option>Conservative</option><option>Balanced</option><option>Growth</option></select><small>{profile.description}</small></label>
          <div className="rate-list">
            <RateInput label="Cash rate" value={settings.cashReturnRate} onChange={(value) => updateSettings('cashReturnRate', value)} />
            <RateInput label="Income rate" value={settings.incomeReturnRate} onChange={(value) => updateSettings('incomeReturnRate', value)} />
            <RateInput label="Growth return" value={settings.growthReturnRate} onChange={(value) => updateSettings('growthReturnRate', value)} />
          </div>
          <label className="field"><span>Monthly contribution (THB)</span><div className="money-input"><span>{currencySymbol(BASE_CURRENCY)}</span><input type="text" inputMode="numeric" pattern="[0-9,]*" placeholder="0" value={moneyInputValue(settings.monthlyContribution)} onChange={(event) => updateSettings('monthlyContribution', moneyNumberFromText(event.target.value))} /></div></label>
          <div className="projection-box">
            <div><span>Today</span><strong>{formatMoney(investable)}</strong></div>
            <ArrowRight size={16} />
            <div><span>5 years</span><strong>{formatMoney(projected5)}</strong></div>
            <ArrowRight size={16} />
            <div><span>10 years</span><strong>{formatMoney(projected10)}</strong></div>
          </div>
        </section>
      </div>

      {excludedAssets > 0 && <div className="excluded-note"><Building2 size={18} /><div><strong>{formatMoney(excludedAssets)} is excluded from the allocation calculation</strong><span>Property, vehicles, and other personal assets count toward net worth but may not be liquid or suitable for this investment mix.</span></div></div>}

      <section className="education-note asset-plan-disclaimer">
        <div><ShieldCheck size={20} /><strong>Understand the illustration</strong></div>
        <p>Actual returns can be negative, and taxes, fees, inflation, product risk, and timing will change results. The suggested mix is a general educational framework based on the inputs you provide—not personalized investment advice.</p>
        <div className="source-links">
          <a href="https://www.investor.gov/introduction-investing/getting-started/asset-allocation" target="_blank" rel="noreferrer">Investor.gov: asset allocation <ArrowRight size={14} /></a>
          <a href="https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator" target="_blank" rel="noreferrer">Investor.gov: compound interest <ArrowRight size={14} /></a>
        </div>
      </section>
    </>
  )
}

function RateInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value))

  const changeValue = (rawValue: string) => {
    const normalized = normalizeRateText(rawValue)
    const numericValue = normalized ? Number(normalized) : 0
    const nextText = numericValue > 30 ? '30' : normalized
    setText(nextText)
    onChange(Math.max(0, Math.min(30, numericValue)))
  }

  const finishEditing = () => {
    const numericValue = Math.max(0, Math.min(30, Number(text || 0)))
    setText(String(numericValue))
    onChange(numericValue)
  }

  return <label><span>{label}</span><div><input type="text" inputMode="decimal" aria-label={label} value={text} onFocus={(event) => text === '0' && event.currentTarget.select()} onChange={(event) => changeValue(event.target.value)} onBlur={finishEditing} /><span>%</span></div></label>
}

function futureValue(principal: number, annualRate: number, years: number, monthlyContribution: number) {
  const months = years * 12
  const monthlyRate = annualRate / 100 / 12
  if (monthlyRate === 0) return principal + monthlyContribution * months
  const factor = (1 + monthlyRate) ** months
  return principal * factor + monthlyContribution * ((factor - 1) / monthlyRate)
}

export function AllocationPage({
  data,
  setData,
  allocations,
  total,
  formatMoney,
  onToast,
}: {
  data: AppData
  setData: React.Dispatch<React.SetStateAction<AppData>>
  allocations: AllocationRow[]
  total: number
  formatMoney: (value: number, compact?: boolean) => string
  onToast: (message: string) => void
}) {
  const [draft, setDraft] = useState(data.targets)
  const draftTotal = ASSET_CLASSES.reduce((sum, assetClass) => sum + draft[assetClass], 0)
  const threshold = data.settings.driftThreshold
  const attentionCount = allocations.filter((item) => Math.abs(item.drift) >= threshold).length

  const saveTargets = () => {
    if (Math.abs(draftTotal - 100) > 0.01) return
    setData((current) => ({ ...current, targets: draft }))
    onToast('Allocation targets saved')
  }

  return (
    <>
      <PageHeading
        eyebrow="Portfolio structure"
        title="Allocation"
        copy="Compare what you own with the mix you chose for your goals and risk capacity."
        actions={<span className={cx('attention-chip', attentionCount > 0 && 'attention-chip--warn')}><span />{attentionCount > 0 ? `${attentionCount} class${attentionCount > 1 ? 'es' : ''} to review` : 'All within range'}</span>}
      />

      <div className="allocation-page-grid">
        <section className="card target-card">
          <CardHeader eyebrow="Plan" title="Target allocation" action={<span className={cx('target-total', Math.abs(draftTotal - 100) > 0.01 && 'target-total--bad')}>{draftTotal.toFixed(0)}% total</span>} />
          <p className="section-intro">Targets should reflect when you need the money and how much loss you can withstand—not a short-term market forecast.</p>
          <div className="target-list">
            {ASSET_CLASSES.map((assetClass) => (
              <div className="target-row" key={assetClass}>
                <span className="legend-dot" style={{ background: CLASS_META[assetClass].color }} />
                <div><strong>{assetClass}</strong><span>{formatMoney((draft[assetClass] / 100) * total)} at today’s value</span></div>
                <div className="percent-input"><input aria-label={`${assetClass} target percentage`} type="number" min="0" max="100" step="1" value={draft[assetClass]} onChange={(event) => setDraft((current) => ({ ...current, [assetClass]: Math.max(0, Math.min(100, Number(event.target.value))) }))} /><span>%</span></div>
              </div>
            ))}
          </div>
          {Math.abs(draftTotal - 100) > 0.01 && <div className="form-warning">Targets must add up to 100% before saving.</div>}
          <button className="button button--primary button--full" disabled={Math.abs(draftTotal - 100) > 0.01} onClick={saveTargets}>Save target mix</button>
        </section>

        <section className="card drift-card">
          <CardHeader eyebrow="Actual vs. target" title="Allocation drift" />
          <div className="drift-summary">
            <div><span>Review band</span><strong>±{threshold}%</strong></div>
            <div><span>Portfolio value</span><strong>{formatMoney(total)}</strong></div>
          </div>
          <div className="drift-list">
            {allocations.map((item) => {
              const needsAttention = Math.abs(item.drift) >= threshold
              return (
                <div className="drift-row" key={item.assetClass}>
                  <div className="drift-row__top">
                    <div><span className="legend-dot" style={{ background: CLASS_META[item.assetClass].color }} /><strong>{item.assetClass}</strong></div>
                    <div><strong>{item.current.toFixed(1)}%</strong><span> / {item.target}% target</span></div>
                  </div>
                  <div className="drift-track"><div style={{ width: `${Math.min(item.current, 100)}%`, background: CLASS_META[item.assetClass].color }} /><span style={{ left: `${Math.min(item.target, 100)}%` }} /></div>
                  <div className={cx('drift-note', needsAttention && 'drift-note--warn')}>
                    {item.drift > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {Math.abs(item.drift).toFixed(1)}% {item.drift >= 0 ? 'overweight' : 'underweight'}
                    {needsAttention && <em>Review</em>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <section className="card principle-card">
        <div className="principle-card__icon"><Sprout size={22} /></div>
        <div><span>Steady principle</span><h3>Rebalance with intention, not emotion.</h3><p>Review on a schedule or when an asset class crosses your chosen band. Prefer contributions where practical, and account for taxes, fees, and your complete financial picture before selling.</p></div>
      </section>
    </>
  )
}

function HoldingsPage({ holdings, total, formatMoney, onAdd, onEdit, currency }: {
  holdings: Holding[]
  total: number
  formatMoney: (value: number, compact?: boolean) => string
  onAdd: () => void
  onEdit: (holding: Holding) => void
  currency: string
}) {
  const [query, setQuery] = useState('')
  const filtered = holdings.filter((holding) => `${holding.ticker} ${holding.name} ${holding.account} ${holding.assetClass}`.toLowerCase().includes(query.toLowerCase()))

  const exportCsv = () => {
    const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
    const csv = [
      ['Ticker', 'Name', 'Asset class', 'Account', `Value (${currency})`],
      ...holdings.map((item) => [item.ticker, item.name, item.assetClass, item.account, item.value]),
    ].map((row) => row.map(escape).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'steady-holdings.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeading
        eyebrow="What you own"
        title="Holdings"
        copy="Keep a simple inventory across accounts to see your portfolio as one whole."
        actions={<button className="button button--primary" onClick={onAdd}><Plus size={17} /> Add holding</button>}
      />
      <section className="card holdings-card">
        <div className="table-toolbar">
          <div className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search holdings or accounts" aria-label="Search holdings" /></div>
          <button className="button button--secondary button--small" onClick={exportCsv} disabled={holdings.length === 0}><Download size={16} /> Export CSV</button>
        </div>
        {holdings.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Holding</th><th>Asset class</th><th>Account</th><th>Weight</th><th>Value</th><th><span className="sr-only">Edit</span></th></tr></thead>
              <tbody>
                {filtered.map((holding) => {
                  const weight = total > 0 ? (holding.value / total) * 100 : 0
                  return (
                    <tr key={holding.id}>
                      <td><div className="holding-name"><div className="ticker-tile" style={{ color: CLASS_META[holding.assetClass].color, background: CLASS_META[holding.assetClass].soft }}>{holding.ticker.slice(0, 4)}</div><div><strong>{holding.ticker}</strong><span>{holding.name}</span></div></div></td>
                      <td><span className="class-tag"><span style={{ background: CLASS_META[holding.assetClass].color }} />{holding.assetClass}</span></td>
                      <td>{holding.account}</td>
                      <td><div className="weight-cell"><span>{weight.toFixed(1)}%</span><div><i style={{ width: `${Math.min(weight * 2.2, 100)}%`, background: CLASS_META[holding.assetClass].color }} /></div></div></td>
                      <td className="value-cell">{formatMoney(holding.value)}</td>
                      <td><button className="icon-button icon-button--small" onClick={() => onEdit(holding)} aria-label={`Edit ${holding.ticker}`}><Pencil size={15} /></button></td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot><tr><td colSpan={4}>Total portfolio</td><td>{formatMoney(total)}</td><td /></tr></tfoot>
            </table>
            {filtered.length === 0 && <div className="no-results">No holdings match “{query}”.</div>}
          </div>
        ) : <EmptyState icon={WalletCards} title="Build your portfolio view" copy="Add holdings manually. Values stay in this browser and are never sent to a server." action="Add my first holding" onAction={onAdd} />}
      </section>
      <div className="data-note"><ShieldCheck size={18} /><div><strong>Your data stays with you</strong><span>Steady uses browser storage. Export a CSV backup before clearing browser data or moving devices.</span></div></div>
    </>
  )
}

function PlanPage({ data, cash, total, formatMoney, updateSettings }: {
  data: AppData
  cash: number
  total: number
  formatMoney: (value: number, compact?: boolean) => string
  updateSettings: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}) {
  const { settings } = data
  const cashMonths = settings.monthlyEssentials > 0 ? cash / settings.monthlyEssentials : 0
  const reserveGoal = settings.monthlyEssentials * settings.emergencyTargetMonths
  const reserveProgress = reserveGoal > 0 ? Math.min((cash / reserveGoal) * 100, 100) : 0
  const goalProgress = settings.goalAmount > 0 ? Math.max(0, Math.min((total / settings.goalAmount) * 100, 100)) : 0
  const readiness = getReadinessScore(settings, cashMonths)

  return (
    <>
      <PageHeading eyebrow="Before chasing returns" title="Financial Health" copy="Connect your portfolio to the habits and safeguards that make long-term investing sustainable." />

      <section className="plan-hero">
        <div className="plan-hero__score">
          <span>Foundation score</span>
          <div><strong>{readiness}</strong><small>/100</small></div>
          <p>Based on the four planning inputs below—not market performance.</p>
        </div>
        <div className="plan-hero__bar"><span style={{ width: `${readiness}%` }} /></div>
        <div className="plan-hero__message"><ShieldCheck size={20} /><div><strong>{readiness >= 75 ? 'Your habits are doing the heavy lifting.' : 'A few fundamentals need attention.'}</strong><span>Keep the system simple enough to follow through every market cycle.</span></div></div>
      </section>

      <div className="plan-grid">
        <section className="card plan-card">
          <div className="plan-card__top"><div className="plan-icon plan-icon--green"><Landmark size={19} /></div><div><span>01 · Resilience</span><h2>Emergency reserve</h2></div></div>
          <div className="goal-progress">
            <div><strong>{cashMonths.toFixed(1)} months saved</strong><span>{formatMoney(cash)} of {formatMoney(reserveGoal)}</span></div>
            <div><span style={{ width: `${reserveProgress}%` }} /></div>
          </div>
          <label className="field"><span>Essential spending per month (THB)</span><div className="money-input"><span>{currencySymbol(BASE_CURRENCY)}</span><input type="text" inputMode="numeric" pattern="[0-9,]*" placeholder="0" value={moneyInputValue(settings.monthlyEssentials)} onChange={(event) => updateSettings('monthlyEssentials', moneyNumberFromText(event.target.value))} /></div></label>
          <label className="field"><span>Reserve target</span><div className="range-value"><input type="range" min="1" max="12" value={settings.emergencyTargetMonths} onChange={(event) => updateSettings('emergencyTargetMonths', Number(event.target.value))} /><strong>{settings.emergencyTargetMonths} months</strong></div></label>
        </section>

        <section className="card plan-card">
          <div className="plan-card__top"><div className="plan-icon plan-icon--sand"><TrendingUp size={19} /></div><div><span>02 · Consistency</span><h2>Saving & investing</h2></div></div>
          <label className="field"><span>Savings rate</span><div className="range-value"><input type="range" min="0" max="80" value={settings.savingsRate} onChange={(event) => updateSettings('savingsRate', Number(event.target.value))} /><strong>{settings.savingsRate}%</strong></div></label>
          <label className="field"><span>Monthly portfolio contribution (THB)</span><div className="money-input"><span>{currencySymbol(BASE_CURRENCY)}</span><input type="text" inputMode="numeric" pattern="[0-9,]*" placeholder="0" value={moneyInputValue(settings.monthlyContribution)} onChange={(event) => updateSettings('monthlyContribution', moneyNumberFromText(event.target.value))} /></div></label>
          <ToggleRow label="Automatic contributions" copy="Reduce the need for monthly willpower" checked={settings.autoContributions} onChange={(value) => updateSettings('autoContributions', value)} />
        </section>

        <section className="card plan-card">
          <div className="plan-card__top"><div className="plan-icon plan-icon--coral"><CircleDollarSign size={19} /></div><div><span>03 · Obligations</span><h2>Debt check</h2></div></div>
          <p className="plan-card__copy">High-interest debt can grow faster than a diversified portfolio can reasonably be expected to return.</p>
          <ToggleRow label="I have high-interest debt" copy="Credit cards or other costly balances" checked={settings.hasHighInterestDebt} onChange={(value) => updateSettings('hasHighInterestDebt', value)} danger />
          {settings.hasHighInterestDebt ? <div className="guidance-box guidance-box--warn"><Target size={17} /><span>Consider prioritizing a payoff plan and minimum payments before increasing investment risk.</span></div> : <div className="guidance-box"><Check size={17} /><span>No high-interest balance reported. Revisit this after major borrowing changes.</span></div>}
        </section>

        <section className="card plan-card">
          <div className="plan-card__top"><div className="plan-icon plan-icon--blue"><Target size={19} /></div><div><span>04 · Direction</span><h2>Long-term goal</h2></div></div>
          <div className="goal-progress">
            <div><strong>{goalProgress.toFixed(0)}% funded today</strong><span>{formatMoney(total)} of {formatMoney(settings.goalAmount)}</span></div>
            <div><span style={{ width: `${goalProgress}%` }} /></div>
          </div>
          <label className="field"><span>Goal name</span><input type="text" value={settings.goalName} onChange={(event) => updateSettings('goalName', event.target.value)} /></label>
          <div className="two-fields">
            <label className="field"><span>Target amount (THB)</span><input type="text" inputMode="numeric" pattern="[0-9,]*" placeholder="0" value={moneyInputValue(settings.goalAmount)} onChange={(event) => updateSettings('goalAmount', moneyNumberFromText(event.target.value))} /></label>
            <label className="field"><span>Target year</span><input type="number" min={new Date().getFullYear()} max="2200" value={settings.goalYear} onChange={(event) => updateSettings('goalYear', Number(event.target.value))} /></label>
          </div>
        </section>
      </div>
    </>
  )
}

function IncomePage({ periods, formatMoney, onAdd, onEdit }: {
  periods: IncomePeriod[]
  formatMoney: (value: number, compact?: boolean) => string
  onAdd: () => void
  onEdit: (period: IncomePeriod) => void
}) {
  const currentMonth = currentMonthKey()
  const ordered = [...periods].sort((a, b) => a.startMonth.localeCompare(b.startMonth))
  const currentPeriods = ordered.filter((period) => !period.endMonth || period.endMonth >= currentMonth)
  const currentIncome = currentPeriods.reduce((sum, period) => sum + period.monthlyIncome, 0)
  const latestIncome = currentIncome || ordered.at(-1)?.monthlyIncome || 0
  const firstIncome = ordered[0]?.monthlyIncome ?? 0
  const growth = firstIncome > 0 ? ((latestIncome - firstIncome) / firstIncome) * 100 : 0

  return (
    <>
      <PageHeading
        eyebrow="Career & earning history"
        title="Income Progress"
        copy="See how your monthly income has changed across companies and roles. All entries use gross monthly income in THB for a consistent comparison."
        actions={<button className="button button--primary" onClick={onAdd}><Plus size={16} /> Add job or income</button>}
      />
      {ordered.length > 0 ? (
        <>
          <div className="income-summary">
            <div><span>{currentPeriods.length > 0 ? 'Current monthly income' : 'Latest monthly income'}</span><strong>{formatMoney(latestIncome)}</strong><small>{currentPeriods.length > 1 ? `${currentPeriods.length} current income sources` : currentPeriods.length === 1 ? 'Current role' : 'No current role marked'}</small></div>
            <div><span>Annualized income</span><strong>{formatMoney(latestIncome * 12)}</strong><small>Monthly income × 12, before bonuses</small></div>
            <div><span>Growth from first record</span><strong className={cx(growth < 0 && 'negative')}>{growth >= 0 ? '+' : ''}{growth.toFixed(1)}%</strong><small>{ordered.length} job period{ordered.length === 1 ? '' : 's'} tracked</small></div>
          </div>
          <IncomeProgressChart periods={ordered} formatMoney={formatMoney} />
          <section className="card income-timeline-card">
            <CardHeader eyebrow="Companies & roles" title="Employment timeline" />
            <p className="section-intro">Your work history from newest to oldest, with the salary recorded for each period.</p>
            <div className="income-timeline" aria-label="Employment and income history">
              {[...ordered].reverse().map((period, index) => {
                const isCurrent = !period.endMonth || period.endMonth >= currentMonth
                return (
                  <div className="income-row" key={period.id}>
                    <div className="income-row__track"><span className={cx(isCurrent && 'current')} />{index < ordered.length - 1 && <i />}</div>
                    <div className="income-row__identity"><strong>{period.role}</strong><span>{period.company}</span>{period.note && <small>{period.note}</small>}</div>
                    <div className="income-row__period"><span><CalendarClock size={14} />{formatIncomePeriod(period)}</span>{isCurrent && <small>Current</small>}</div>
                    <div className="income-row__amount"><strong>{formatMoney(period.monthlyIncome)}</strong><small>per month</small></div>
                    <button className="icon-button icon-button--small" onClick={() => onEdit(period)} aria-label={`Edit ${period.role} at ${period.company}`}><Pencil size={15} /></button>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      ) : (
        <section className="card income-empty"><div><Building2 size={23} /></div><h3>Build your income timeline</h3><p>Add your current job first, then previous roles to reveal your salary progress graph.</p><button className="button button--primary" onClick={onAdd}><Plus size={16} /> Add current job</button></section>
      )}
    </>
  )
}

function IncomeProgressChart({ periods, formatMoney }: { periods: IncomePeriod[]; formatMoney: (value: number, compact?: boolean) => string }) {
  const chartWidth = 880
  const chartHeight = 268
  const chartLeft = 82
  const chartRight = 25
  const chartTop = 26
  const chartBottom = 42
  const maximum = Math.max(...periods.map((period) => period.monthlyIncome), 1) * 1.12
  const monthNumbers = periods.map((period) => incomeMonthNumber(period.startMonth))
  const firstMonth = Math.min(...monthNumbers)
  const lastMonth = Math.max(...monthNumbers)
  const monthRange = Math.max(lastMonth - firstMonth, 1)
  const plotHeight = chartHeight - chartTop - chartBottom
  const points = periods.map((period) => ({
    ...period,
    x: periods.length === 1 ? chartWidth / 2 : chartLeft + ((incomeMonthNumber(period.startMonth) - firstMonth) / monthRange) * (chartWidth - chartLeft - chartRight),
    y: chartTop + ((maximum - period.monthlyIncome) / maximum) * plotHeight,
  }))
  const chartFloor = chartHeight - chartBottom
  const areaPoints = points.length > 1 ? `${points[0].x},${chartFloor} ${points.map((point) => `${point.x},${point.y}`).join(' ')} ${points.at(-1)!.x},${chartFloor}` : ''
  const labelEvery = Math.max(1, Math.ceil(points.length / 6))
  const gridLevels = [0, .5, 1].map((position) => ({ position, y: chartTop + position * plotHeight, value: maximum * (1 - position) }))

  return (
    <section className="card income-progress-card">
      <div className="income-progress-card__header">
        <CardHeader eyebrow="Monthly salary in THB" title="Salary progression" />
        <span className="income-progress-chip"><TrendingUp size={14} /> {periods.length} milestone{periods.length === 1 ? '' : 's'}</span>
      </div>
      <p className="section-intro">Each point marks the salary recorded when you started a role. Hover a point to see its company and title.</p>
      <div className="income-chart" role="img" aria-label={periods.map((period) => `${formatIncomeMonth(period.startMonth)}, ${period.role} at ${period.company}, ${formatMoney(period.monthlyIncome)} per month`).join('; ')}>
        <div className="income-chart__legend"><span><i /> Monthly income</span><small>Salary milestones by job start date</small></div>
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} aria-hidden="true">
          <defs><linearGradient id="income-area-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#628fa0" stopOpacity=".3" /><stop offset="100%" stopColor="#628fa0" stopOpacity=".025" /></linearGradient></defs>
          {gridLevels.map((level) => <g key={level.position}><line x1={chartLeft} x2={chartWidth - chartRight} y1={level.y} y2={level.y} className="income-grid-line" /><text x={chartLeft - 11} y={level.y + 4} textAnchor="end" className="income-axis-label">{formatMoney(level.value, true)}</text></g>)}
          {points.length > 1 && <polygon points={areaPoints} className="income-chart-area" />}
          {points.length > 1 && <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} className="income-chart-line" />}
          {points.map((point, index) => <g key={point.id}><line x1={point.x} x2={point.x} y1={point.y + 8} y2={chartFloor} className="income-point-guide" />{points.length === 1 && <line x1={chartLeft} x2={point.x} y1={point.y} y2={point.y} className="income-single-line" />}<circle cx={point.x} cy={point.y} r={index === points.length - 1 ? 7 : 5} className={cx('income-chart-point', index === points.length - 1 && 'income-chart-point--latest')}><title>{point.role} at {point.company} · {formatMoney(point.monthlyIncome)} per month</title></circle>{(index % labelEvery === 0 || index === points.length - 1) && <text x={point.x} y={chartHeight - 10} textAnchor={index === 0 && points.length > 1 ? 'start' : index === points.length - 1 && points.length > 1 ? 'end' : 'middle'} className="income-month-label">{formatSnapshotMonth(point.startMonth)}</text>}</g>)}
        </svg>
      </div>
    </section>
  )
}

function incomeMonthNumber(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return year * 12 + monthNumber - 1
}

function formatIncomePeriod(period: IncomePeriod) {
  const start = formatIncomeMonth(period.startMonth)
  const end = period.endMonth ? formatIncomeMonth(period.endMonth) : 'Present'
  return `${start} – ${end} · ${incomePeriodDuration(period.startMonth, period.endMonth)}`
}

function formatIncomeMonth(month: string) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function incomePeriodDuration(startMonth: string, endMonth: string) {
  const start = new Date(`${startMonth}-01T00:00:00`)
  const end = new Date(`${endMonth || currentMonthKey()}-01T00:00:00`)
  const months = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1)
  const years = Math.floor(months / 12)
  const remainingMonths = months % 12
  return [years > 0 ? `${years}y` : '', remainingMonths > 0 ? `${remainingMonths}m` : ''].filter(Boolean).join(' ')
}

function ToggleRow({ label, copy, checked, onChange, danger = false }: { label: string; copy: string; checked: boolean; onChange: (value: boolean) => void; danger?: boolean }) {
  return (
    <div className="toggle-row"><div><strong>{label}</strong><span>{copy}</span></div><button role="switch" aria-checked={checked} aria-label={label} className={cx('toggle', checked && 'toggle--on', danger && checked && 'toggle--danger')} onClick={() => onChange(!checked)}><span /></button></div>
  )
}

function currencySymbol(currency: string) {
  return new Intl.NumberFormat(currencyLocale(currency), { style: 'currency', currency, maximumFractionDigits: 0 }).formatToParts(0).find((part) => part.type === 'currency')?.value ?? currency
}

function currencyLocale(currency: string) {
  return currency === 'THB' ? 'th-TH' : 'en-US'
}

function IncomePeriodModal({ period, onClose, onSave, onDelete }: {
  period: IncomePeriod | null
  onClose: () => void
  onSave: (period: IncomePeriod) => void
  onDelete: (id: string) => void
}) {
  const [form, setForm] = useState<IncomePeriod>(period ?? {
    id: crypto.randomUUID(),
    company: '',
    role: '',
    monthlyIncome: 0,
    startMonth: currentMonthKey(),
    endMonth: '',
    note: '',
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!form.company.trim() || !form.role.trim() || form.monthlyIncome <= 0 || !form.startMonth || (form.endMonth && form.endMonth < form.startMonth)) return
    onSave({ ...form, company: form.company.trim(), role: form.role.trim(), note: form.note.trim() })
  }

  return (
    <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="income-period-modal-title">
        <div className="modal__header"><div><span>Income journey</span><h2 id="income-period-modal-title">{period ? 'Edit job period' : 'Add job or income'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
        <form onSubmit={submit}>
          <div className="two-fields">
            <label className="field"><span>Company or income source</span><input autoFocus placeholder="e.g. Acme Thailand" value={form.company} onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))} required /></label>
            <label className="field"><span>Role or job</span><input placeholder="e.g. Product designer" value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} required /></label>
          </div>
          <label className="field"><span>Gross monthly income in THB</span><div className="money-input money-input--emphasis"><span>{currencySymbol(BASE_CURRENCY)}</span><input type="text" inputMode="numeric" pattern="[0-9,]*" placeholder="50,000" value={moneyInputValue(form.monthlyIncome)} onChange={(event) => setForm((current) => ({ ...current, monthlyIncome: moneyNumberFromText(event.target.value) }))} required /></div><small className="field-hint">Use your regular monthly amount before bonuses for a consistent comparison.</small></label>
          <div className="two-fields">
            <label className="field"><span>Start month</span><input type="month" value={form.startMonth} onChange={(event) => setForm((current) => ({ ...current, startMonth: event.target.value, endMonth: current.endMonth && current.endMonth < event.target.value ? '' : current.endMonth }))} required /></label>
            <label className="field"><span>End month</span><input type="month" min={form.startMonth} value={form.endMonth} onChange={(event) => setForm((current) => ({ ...current, endMonth: event.target.value }))} /><small className="field-hint">Leave blank if this is your current job.</small></label>
          </div>
          <label className="field"><span>Optional note</span><input placeholder="e.g. Promotion, career change, or freelance contract" value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label>
          <div className="modal-guidance"><ShieldCheck size={16} /><span>Income records are private and use the same local storage and Supabase sync as your portfolio.</span></div>
          <div className="modal__actions">
            {period && <button type="button" className="button button--danger" onClick={() => window.confirm(`Remove ${period.role} at ${period.company} from your income journey?`) && onDelete(period.id)}><Trash2 size={16} />Remove</button>}
            <div className="modal__actions-right"><button type="button" className="button button--secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button--primary">{period ? 'Save changes' : 'Add income period'}</button></div>
          </div>
        </form>
      </div>
    </div>
  )
}

function AccountModal({ configured, user, syncStatus, syncStatusLabel, syncError, email, message, busy, onEmailChange, onSubmit, onSignOut, onClose }: {
  configured: boolean
  user: SupabaseUser | null
  syncStatus: SyncStatus
  syncStatusLabel: string
  syncError: string | null
  email: string
  message: string | null
  busy: boolean
  onEmailChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
  onSignOut: () => void
  onClose: () => void
}) {
  return (
    <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title">
        <div className="modal__header"><div><span>Private account</span><h2 id="account-modal-title">Sync your portfolio</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
        {!configured ? (
          <div className="account-setup">
            <div className="account-state account-state--local"><CloudOff size={20} /><div><strong>Local mode is active</strong><span>Your portfolio is still safely available in this browser.</span></div></div>
            <p>To enable cross-device sync, create a Supabase project, run <code>supabase/schema.sql</code>, and add the project URL and publishable key to <code>.env.local</code>.</p>
          </div>
        ) : user ? (
          <div className="account-signed-in">
            <div className={cx('account-state', syncStatus === 'error' && 'account-state--error')}>
              {syncStatus === 'error' ? <CloudOff size={20} /> : <Cloud size={20} />}
              <div><strong>{syncStatusLabel}</strong><span>{user.email}</span></div>
            </div>
            {syncError && <div className="auth-message auth-message--error">{syncError}</div>}
            <p>Changes are also saved locally. When online, Steady updates your private cloud portfolio and monthly history.</p>
            <button className="button button--secondary button--full" type="button" disabled={busy} onClick={onSignOut}><LogOut size={16} /> Sign out</button>
          </div>
        ) : (
          <form className="account-sign-in" onSubmit={onSubmit}>
            <div className="account-state"><Cloud size={20} /><div><strong>Use the same portfolio everywhere</strong><span>Sign in by secure email link—no password to remember.</span></div></div>
            <label className="field"><span>Email address</span><div className="auth-email-input"><Mail size={17} /><input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => onEmailChange(event.target.value)} required /></div></label>
            {message && <div className={cx('auth-message', message.toLowerCase().includes('check your email') ? 'auth-message--success' : 'auth-message--error')}>{message}</div>}
            <button className="button button--primary button--full" type="submit" disabled={busy}>{busy ? 'Sending secure link…' : 'Email me a sign-in link'}</button>
            <p className="account-privacy"><ShieldCheck size={15} />Only your signed-in user can read or change these records.</p>
          </form>
        )}
      </div>
    </div>
  )
}

function EmptyState({ icon: Icon, title, copy, action, onAction }: { icon: LucideIcon; title: string; copy: string; action: string; onAction: () => void }) {
  return (
    <div className="empty-state"><div><Icon size={24} /></div><h3>{title}</h3><p>{copy}</p><button className="button button--primary" onClick={onAction}><Plus size={16} />{action}</button></div>
  )
}

function NetWorthItemModal({ item, currency, onClose, onSave, onDelete }: {
  item: NetWorthItem | null
  currency: string
  onClose: () => void
  onSave: (item: NetWorthItem) => void
  onDelete: (id: string) => void
}) {
  const [kind, setKind] = useState<'asset' | 'liability'>(item && isLiabilityCategory(item.category) ? 'liability' : 'asset')
  const [form, setForm] = useState<NetWorthItem>(item ?? {
    id: crypto.randomUUID(),
    name: '',
    category: 'Cash',
    value: 0,
    note: '',
  })
  const categories = kind === 'asset' ? ASSET_CATEGORIES : LIABILITY_CATEGORIES

  const changeKind = (nextKind: 'asset' | 'liability') => {
    setKind(nextKind)
    setForm((current) => ({ ...current, category: nextKind === 'asset' ? 'Cash' : 'Mortgage' }))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!form.name.trim() || form.value < 0) return
    onSave({ ...form, name: form.name.trim(), note: form.note.trim() })
  }

  return (
    <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="net-worth-modal-title">
        <div className="modal__header"><div><span>{item ? 'Update balance' : 'Balance sheet'}</span><h2 id="net-worth-modal-title">{item ? 'Edit item' : 'Add asset or debt'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
        <form onSubmit={submit}>
          <div className="kind-switch" aria-label="Item type">
            <button type="button" className={cx(kind === 'asset' && 'active')} onClick={() => changeKind('asset')}><BadgeCheck size={16} /> Asset</button>
            <button type="button" className={cx(kind === 'liability' && 'active', kind === 'liability' && 'liability')} onClick={() => changeKind('liability')}><CircleMinus size={16} /> Liability</button>
          </div>
          <div className="two-fields">
            <label className="field"><span>Name</span><input autoFocus placeholder={kind === 'asset' ? 'e.g. Primary condo' : 'e.g. Condo mortgage'} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></label>
            <label className="field"><span>Current value in {currency}</span><div className="money-input money-input--emphasis"><span>{currencySymbol(currency)}</span><input type="text" inputMode="numeric" pattern="[0-9,]*" placeholder="2,050,000" value={moneyInputValue(form.value)} onChange={(event) => setForm((current) => ({ ...current, value: moneyNumberFromText(event.target.value) }))} required /></div><small className="field-hint">This number is used in your net worth.</small></label>
          </div>
          <label className="field"><span>Category</span><select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as NetWorthCategory }))}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="field"><span>Optional note</span><input placeholder="e.g. Valued August 2026 — do not enter the amount here" value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label>
          <div className="modal-guidance"><ShieldCheck size={16} /><span>Add each account or property once. Items in the same category are totalled automatically.</span></div>
          <div className="modal__actions">
            {item && <button type="button" className="button button--danger" onClick={() => window.confirm(`Remove ${item.name} from your net worth?`) && onDelete(item.id)}><Trash2 size={16} />Remove</button>}
            <div className="modal__actions-right"><button type="button" className="button button--secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button--primary">{item ? 'Save changes' : `Add ${kind}`}</button></div>
          </div>
        </form>
      </div>
    </div>
  )
}

function HoldingModal({ holding, currency, onClose, onSave, onDelete }: {
  holding: Holding | null
  currency: string
  onClose: () => void
  onSave: (holding: Holding) => void
  onDelete: (id: string) => void
}) {
  const [form, setForm] = useState<Holding>(holding ?? {
    id: crypto.randomUUID(),
    ticker: '',
    name: '',
    assetClass: 'US equity',
    account: 'Brokerage',
    value: 0,
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!form.ticker.trim() || !form.name.trim() || form.value < 0) return
    onSave({ ...form, ticker: form.ticker.trim().toUpperCase(), name: form.name.trim(), account: form.account.trim() || 'Other' })
  }

  return (
    <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="holding-modal-title">
        <div className="modal__header"><div><span>{holding ? 'Update position' : 'New position'}</span><h2 id="holding-modal-title">{holding ? 'Edit holding' : 'Add a holding'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
        <form onSubmit={submit}>
          <div className="two-fields">
            <label className="field"><span>Ticker / symbol</span><input autoFocus placeholder="e.g. VTI" maxLength={12} value={form.ticker} onChange={(event) => setForm((current) => ({ ...current, ticker: event.target.value }))} required /></label>
            <label className="field"><span>Current value ({currency})</span><input type="text" inputMode="numeric" pattern="[0-9,]*" placeholder="0" value={moneyInputValue(form.value)} onChange={(event) => setForm((current) => ({ ...current, value: moneyNumberFromText(event.target.value) }))} required /></label>
          </div>
          <label className="field"><span>Holding name</span><input placeholder="e.g. Total US Stock Market" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></label>
          <div className="two-fields">
            <label className="field"><span>Asset class</span><select value={form.assetClass} onChange={(event) => setForm((current) => ({ ...current, assetClass: event.target.value as AssetClass }))}>{ASSET_CLASSES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="field"><span>Account</span><input placeholder="e.g. Brokerage" value={form.account} onChange={(event) => setForm((current) => ({ ...current, account: event.target.value }))} /></label>
          </div>
          <div className="modal__actions">
            {holding && <button type="button" className="button button--danger" onClick={() => window.confirm(`Remove ${holding.ticker} from your portfolio?`) && onDelete(holding.id)}><Trash2 size={16} />Remove</button>}
            <div className="modal__actions-right"><button type="button" className="button button--secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button--primary">{holding ? 'Save changes' : 'Add holding'}</button></div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default App
