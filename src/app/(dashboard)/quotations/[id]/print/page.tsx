import { notFound } from "next/navigation";
import { getQuotation } from "@/actions/quotations";
import { getCompanySettings } from "@/actions/settings";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Metadata } from "next";
import { PrintAction } from "./print-action";

export const metadata: Metadata = {
  title: "Print Quotation",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PrintQuotationPage({ params }: PageProps) {
  const { id } = await params;
  const [quotationRes, settingsRes] = await Promise.all([
    getQuotation(id),
    getCompanySettings(),
  ]);

  const quotation = quotationRes.data;
  const settings = settingsRes.data;

  if (!quotation) {
    notFound();
  }

  const items = [...(quotation.quotation_items ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );

  return (
    <div className="bg-white min-h-screen text-black">
      {/* Hidden button for triggering print via JS */}
      <PrintAction />

      <div className="max-w-[21cm] mx-auto p-8 md:p-12 print:p-0 print:max-w-none">
        {/* Header */}
        <div className="flex justify-between items-start mb-12">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">QUOTATION</h1>
            <p className="text-gray-500 font-medium">{quotation.quotation_number}</p>
            {quotation.version > 1 && (
              <p className="text-gray-400 text-sm">Revision {quotation.version}</p>
            )}
          </div>

          <div className="text-right">
            <h2 className="text-xl font-bold text-gray-900">
              {settings?.company_name || "Solar Operations"}
            </h2>
            {settings?.address && (
              <p className="text-gray-600 text-sm mt-1 whitespace-pre-wrap max-w-xs">
                {settings.address}
              </p>
            )}
            <div className="text-gray-600 text-sm mt-2">
              {settings?.phone && <p>{settings.phone}</p>}
              {settings?.email && <p>{settings.email}</p>}
              {settings?.gst_number && (
                <p className="mt-1 font-medium">GSTIN: {settings.gst_number}</p>
              )}
            </div>
          </div>
        </div>

        {/* Addresses / meta */}
        <div className="flex justify-between mb-10">
          <div className="w-1/2">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">
              Prepared For
            </h3>
            <p className="font-bold text-gray-900">{quotation.company?.name}</p>
          </div>

          <div className="w-1/3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Quotation Date:</span>
              <span className="font-medium text-gray-900">
                {formatDate(quotation.created_at)}
              </span>
            </div>
            {quotation.valid_from && (
              <div className="flex justify-between">
                <span className="text-gray-500">Valid From:</span>
                <span className="font-medium text-gray-900">
                  {formatDate(quotation.valid_from)}
                </span>
              </div>
            )}
            {quotation.valid_until && (
              <div className="flex justify-between">
                <span className="text-gray-500">Valid Until:</span>
                <span className="font-medium text-gray-900">
                  {formatDate(quotation.valid_until)}
                </span>
              </div>
            )}
            {quotation.capacity_kw ? (
              <div className="flex justify-between">
                <span className="text-gray-500">Capacity:</span>
                <span className="font-medium text-gray-900">
                  {quotation.capacity_kw} kW
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Title / description */}
        <div className="mb-10">
          <h3 className="text-lg font-bold text-gray-900">{quotation.title}</h3>
          {quotation.description && (
            <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">
              {quotation.description}
            </p>
          )}
          {(quotation.panel_type || quotation.inverter_type) && (
            <div className="flex gap-6 mt-3 text-sm text-gray-600">
              {quotation.panel_type && (
                <span>
                  <span className="text-gray-400">Panel:</span> {quotation.panel_type}
                </span>
              )}
              {quotation.inverter_type && (
                <span>
                  <span className="text-gray-400">Inverter:</span> {quotation.inverter_type}
                </span>
              )}
            </div>
          )}
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
            {items.map((item) => (
              <tr key={item.id} className="border-b border-gray-200">
                <td className="py-4 text-gray-800">{item.description}</td>
                <td className="py-4 text-right text-gray-600">
                  {item.quantity} {item.unit}
                </td>
                <td className="py-4 text-right text-gray-600">
                  {formatCurrency(item.unit_price)}
                </td>
                <td className="py-4 text-right font-medium text-gray-900">
                  {formatCurrency(item.line_total ?? item.quantity * item.unit_price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-between mb-12">
          <div className="w-1/2" />

          <div className="w-1/3">
            <div className="flex justify-between py-2 text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium text-gray-900">
                {formatCurrency(quotation.subtotal ?? 0)}
              </span>
            </div>

            {quotation.discount_amount && quotation.discount_amount > 0 ? (
              <div className="flex justify-between py-2 text-sm">
                <span className="text-gray-600">Discount</span>
                <span className="font-medium text-gray-900">
                  -{formatCurrency(quotation.discount_amount)}
                </span>
              </div>
            ) : null}

            <div className="flex justify-between py-2 text-sm">
              <span className="text-gray-600">GST ({quotation.gst_percent}%)</span>
              <span className="font-medium text-gray-900">
                {formatCurrency(quotation.gst_amount ?? 0)}
              </span>
            </div>

            <div className="flex justify-between py-3 border-t-2 border-gray-900 mt-2">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-bold text-gray-900">
                {formatCurrency(quotation.total_amount ?? 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Terms */}
        {(quotation.payment_terms || quotation.warranty_terms || quotation.terms) && (
          <div className="mb-8 space-y-4">
            {quotation.payment_terms && (
              <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Payment Terms
                </h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">
                  {quotation.payment_terms}
                </p>
              </div>
            )}
            {quotation.warranty_terms && (
              <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Warranty
                </h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">
                  {quotation.warranty_terms}
                </p>
              </div>
            )}
            {quotation.terms && (
              <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Terms &amp; Conditions
                </h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{quotation.terms}</p>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {quotation.notes && (
          <div className="mb-8">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">
              Notes
            </h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{quotation.notes}</p>
          </div>
        )}

        <div className="text-center text-sm text-gray-400 mt-16 pt-8 border-t border-gray-200">
          Thank you for considering us for your solar project.
        </div>
      </div>
    </div>
  );
}
