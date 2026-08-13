import { notFound } from "next/navigation";
import { getInvoice } from "@/actions/invoices";
import { getCompanySettings } from "@/actions/settings";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Metadata } from "next";
import { PrintAction } from "./print-action";

export const metadata: Metadata = {
  title: "Print Invoice",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PrintInvoicePage({ params }: PageProps) {
  const { id } = await params;
  const [invoiceRes, settingsRes] = await Promise.all([
    getInvoice(id),
    getCompanySettings(),
  ]);

  const invoice = invoiceRes.data;
  const settings = settingsRes.data;

  if (!invoice) {
    notFound();
  }

  return (
    <div className="bg-white min-h-screen text-black">
      {/* Hidden button for triggering print via JS */}
      <PrintAction />
      
      <div className="max-w-[21cm] mx-auto p-8 md:p-12 print:p-0 print:max-w-none">
        {/* Header */}
        <div className="flex justify-between items-start mb-12">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">INVOICE</h1>
            <p className="text-gray-500 font-medium">{invoice.invoice_number}</p>
          </div>
          
          <div className="text-right">
            <h2 className="text-xl font-bold text-gray-900">{settings?.company_name || "Solar Operations"}</h2>
            {settings?.address && (
              <p className="text-gray-600 text-sm mt-1 whitespace-pre-wrap max-w-xs">{settings.address}</p>
            )}
            <div className="text-gray-600 text-sm mt-2">
              {settings?.phone && <p>{settings.phone}</p>}
              {settings?.email && <p>{settings.email}</p>}
              {settings?.gst_number && <p className="mt-1 font-medium">GSTIN: {settings.gst_number}</p>}
            </div>
          </div>
        </div>

        {/* Addresses */}
        <div className="flex justify-between mb-12">
          <div className="w-1/2">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Bill To</h3>
            <p className="font-bold text-gray-900">{invoice.company?.name}</p>
            {invoice.company?.billing_address && (
              <p className="text-gray-600 text-sm mt-1">
                <span>{invoice.company.billing_address}</span>
                {invoice.company.city && <>, {invoice.company.city}</>}
              </p>
            )}
          </div>
          
          <div className="w-1/3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Invoice Date:</span>
              <span className="font-medium text-gray-900">{formatDate(invoice.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Due Date:</span>
              <span className="font-medium text-gray-900">{invoice.due_date ? formatDate(invoice.due_date) : "On Receipt"}</span>
            </div>
            {invoice.contract && (
              <div className="flex justify-between">
                <span className="text-gray-500">Contract:</span>
                <span className="font-medium text-gray-900">{invoice.contract.contract_number}</span>
              </div>
            )}
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full mb-12 text-sm">
          <thead>
            <tr className="border-b-2 border-gray-900">
              <th className="py-3 text-left font-bold text-gray-900">Description</th>
              <th className="py-3 text-right font-bold text-gray-900">Qty</th>
              <th className="py-3 text-right font-bold text-gray-900">Price</th>
              <th className="py-3 text-right font-bold text-gray-900">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items?.map((item, index) => (
              <tr key={item.id} className="border-b border-gray-200">
                <td className="py-4 text-gray-800">{item.description}</td>
                <td className="py-4 text-right text-gray-600">{item.quantity} {item.unit}</td>
                <td className="py-4 text-right text-gray-600">{formatCurrency(item.unit_price)}</td>
                <td className="py-4 text-right font-medium text-gray-900">{formatCurrency(item.line_total ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-between mb-12">
          <div className="w-1/2">
          </div>
          
          <div className="w-1/3">
            <div className="flex justify-between py-2 text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium text-gray-900">{formatCurrency(invoice.subtotal ?? 0)}</span>
            </div>
            
            {invoice.discount_amount && invoice.discount_amount > 0 ? (
              <div className="flex justify-between py-2 text-sm">
                <span className="text-gray-600">Discount</span>
                <span className="font-medium text-gray-900">-{formatCurrency(invoice.discount_amount)}</span>
              </div>
            ) : null}
            
            {invoice.cgst_amount > 0 && (
              <div className="flex justify-between py-2 text-sm">
                <span className="text-gray-600">CGST</span>
                <span className="font-medium text-gray-900">{formatCurrency(invoice.cgst_amount)}</span>
              </div>
            )}
            {invoice.sgst_amount > 0 && (
              <div className="flex justify-between py-2 text-sm">
                <span className="text-gray-600">SGST</span>
                <span className="font-medium text-gray-900">{formatCurrency(invoice.sgst_amount)}</span>
              </div>
            )}
            {invoice.igst_amount > 0 && (
              <div className="flex justify-between py-2 text-sm">
                <span className="text-gray-600">IGST</span>
                <span className="font-medium text-gray-900">{formatCurrency(invoice.igst_amount)}</span>
              </div>
            )}
            
            <div className="flex justify-between py-3 border-t-2 border-gray-900 mt-2">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-bold text-gray-900">{formatCurrency(invoice.total_amount ?? 0)}</span>
            </div>
            
            {invoice.amount_received && invoice.amount_received > 0 ? (
              <div className="flex justify-between py-2 text-sm text-gray-600">
                <span>Amount Received</span>
                <span>-{formatCurrency(invoice.amount_received)}</span>
              </div>
            ) : null}
            
            <div className="flex justify-between py-3 bg-gray-50 mt-2 px-2">
              <span className="font-bold text-gray-900">Balance Due</span>
              <span className="font-bold text-gray-900">{formatCurrency(invoice.balance_due ?? 0)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="mb-8">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Notes</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        <div className="text-center text-sm text-gray-400 mt-16 pt-8 border-t border-gray-200">
          Thank you for your business.
        </div>
      </div>
    </div>
  );
}
