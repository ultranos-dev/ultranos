import { db } from '@/lib/db'

export interface FinancialSummary {
  todayRevenue: number
  weekRevenue: number
  monthRevenue: number
  totalOutstanding: number
  invoiceCount: number
  averageInvoiceValue: number
}

export async function getFinancialSummary(): Promise<FinancialSummary> {
  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const weekStart = new Date(now.getTime() - 7 * 86400000)
  const monthStart = new Date(now.getTime() - 30 * 86400000)
  const invoices = await db.invoices.toArray()
  const paidInvoices = invoices.filter((inv) => inv.status === 'paid' || inv.status === 'partial')
  const todayInvoices = paidInvoices.filter((inv) => inv.createdAt >= todayStart.toISOString())
  const weekInvoices = paidInvoices.filter((inv) => inv.createdAt >= weekStart.toISOString())
  const monthInvoices = paidInvoices.filter((inv) => inv.createdAt >= monthStart.toISOString())
  const todayRevenue = todayInvoices.reduce((sum, inv) => sum + inv.amountPaid, 0)
  const weekRevenue = weekInvoices.reduce((sum, inv) => sum + inv.amountPaid, 0)
  const monthRevenue = monthInvoices.reduce((sum, inv) => sum + inv.amountPaid, 0)
  const accounts = await db.patientAccounts.filter((a) => a.balance > 0).toArray()
  const totalOutstanding = accounts.reduce((sum, a) => sum + a.balance, 0)
  const invoiceCount = paidInvoices.length
  const averageInvoiceValue = invoiceCount > 0 ? Math.round(monthRevenue / Math.min(invoiceCount, monthInvoices.length || 1)) : 0
  return { todayRevenue, weekRevenue, monthRevenue, totalOutstanding, invoiceCount, averageInvoiceValue }
}
