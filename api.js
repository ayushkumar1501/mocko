import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'; // Added Chevron icons
import { fetchInvoiceResultDetails } from '../api'; // Import the API function

function ValidationDetailView({ invoiceResultId }) {
  const [validationData, setValidationData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openSections, setOpenSections] = useState({
    invoiceData: true,
    poData: true,
    invoiceLineItems: true,
    poLineItems: true,
  });

  useEffect(() => {
    const loadDetails = async () => {
      if (!invoiceResultId) {
        setError("Invoice Result ID not provided to ValidationDetailView.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        console.log("API MODE: Fetching validation details from backend for ID:", invoiceResultId);
        const data = await fetchInvoiceResultDetails(invoiceResultId);
        setValidationData(data);
        console.log("Fetched validation details:", data);
      } catch (err) {
        console.error("Error loading validation details for ID:", invoiceResultId, ":", err);
        setError(err.message || "Failed to load validation details.");
      } finally {
        setIsLoading(false);
      }
    };

    loadDetails();
  }, [invoiceResultId]);

  const toggleSection = (sectionName) => {
    setOpenSections(prev => ({ ...prev, [sectionName]: !prev[sectionName] }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 text-gray-700">
        <Loader2 className="h-8 w-8 animate-spin mr-3 text-custom-red" />
        <span className="text-lg">Loading detailed validation report...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-red-600 p-4 text-center">
        <XCircle className="h-12 w-12 mb-4 text-red-500" />
        <h2 className="text-2xl font-bold mb-3">Error Loading Report</h2>
        <p className="mb-6 text-lg">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-custom-red text-white rounded-lg shadow-md hover:bg-red-700 transition-all duration-300 flex items-center text-lg"
        >
          <RefreshCw className="h-5 w-5 mr-3" /> Retry
        </button>
      </div>
    );
  }

  if (!validationData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 text-gray-700">
        <p className="text-lg font-medium">No validation data found for this ID.</p>
      </div>
    );
  }

  const {
    summary,
    extracted_invoice_data,
    invoice_validation_issues,
    extracted_po_data,
    po_comparison_results,
  } = validationData;

  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  };

  const getFieldStatus = (fieldPath, issues) => {
    if (issues && issues[fieldPath]) {
      return { isValid: false, message: issues[fieldPath] };
    }
    if (po_comparison_results?.missing_in_invoice && po_comparison_results.missing_in_invoice.includes(fieldPath)) {
      return { isValid: false, message: "Missing in invoice (as per PO comparison)." };
    }
    return { isValid: true, message: "" }; // Empty message for valid fields
  };

  const renderField = (fieldPath, extractedData, issues, label, isPoField = false) => {
    const value = getNestedValue(extractedData, fieldPath);
    const { isValid, message } = getFieldStatus(fieldPath, issues);

    let poMismatch = null;
    if (!isPoField && po_comparison_results?.mismatched_fields && po_comparison_results.mismatched_fields[fieldPath]) {
      poMismatch = po_comparison_results.mismatched_fields[fieldPath];
    }

    return (
      <div key={fieldPath} className="grid grid-cols-1 md:grid-cols-3 gap-2 py-3 px-4 border-b border-gray-100 last:border-b-0 items-center">
        <span className="font-medium text-gray-700">{label}:</span>
        <div className="col-span-1 md:col-span-1 text-gray-800 break-words pr-2">
          {value === null || value === "" ? (
            <span className="text-gray-500 italic">N/A</span>
          ) : typeof value === 'object' ? (
            <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-2 rounded-md border border-gray-200">{JSON.stringify(value, null, 2)}</pre>
          ) : (
            String(value)
          )}
        </div>
        <div className="col-span-1 md:col-span-1 flex flex-col justify-center items-start md:items-end">
          <div className="flex items-center mb-1">
            {isValid ? (
              <CheckCircle className="h-5 w-5 text-green-500 mr-2" title="Valid" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500 mr-2" title={`Issue: ${message}`} />
            )}
            <span className={`text-sm ${isValid ? 'text-green-600' : 'text-red-600 font-medium'}`}>
              {isValid ? 'Valid' : message || 'Issue Detected'}
            </span>
          </div>
          {poMismatch && !isPoField && (
            <p className="text-yellow-700 text-xs mt-1 bg-yellow-50 p-1 rounded-md border border-yellow-200">
              PO Mismatch: Invoice: <span className="font-semibold">{String(poMismatch.invoice_value)}</span>, PO: <span className="font-semibold">{String(poMismatch.po_value)}</span>
            </p>
          )}
        </div>
      </div>
    );
  };

  // Define common line item keys to display in order
  const commonLineItemKeys = [
    { key: 'description', label: 'Description' },
    { key: 'quantity', label: 'Qty' },
    { key: 'unit_price', label: 'Unit Price' },
    { key: 'total_line_amount', label: 'Line Total' },
    { key: 'item_tax_rate', label: 'Tax Rate' },
    { key: 'item_amount_of_tax_charged', label: 'Tax Amt' },
  ];

  const renderLineItemRow = (item, index, type) => {
    const isInvoiceItem = type === 'invoice';
    const detailedLineItemMismatches = po_comparison_results?.mismatched_fields?.line_item_details?.find(
      m => m.type === 'item_value_mismatch' && m.item_index === index
    );

    let itemOverallValid = true;
    let itemMismatchDetails = {};

    if (detailedLineItemMismatches) {
      itemOverallValid = false;
      itemMismatchDetails = detailedLineItemMismatches.mismatches;
    }

    return (
      <tr key={`${type}-item-${index}`} className={`${itemOverallValid ? 'bg-white hover:bg-gray-50' : 'bg-red-50 hover:bg-red-100'} border-b border-gray-200`}>
        <td className="py-3 px-4 text-sm font-medium text-gray-900 flex items-center">
          {index + 1}
          {!itemOverallValid && <XCircle className="h-4 w-4 text-red-600 ml-2" title="Item Mismatch" />}
        </td>
        {commonLineItemKeys.map(({ key }) => {
          const value = item[key];
          const isMismatched = itemMismatchDetails[key];
          let displayValue = value === null || value === undefined || value === "" ? "N/A" : String(value);

          // If there's a mismatch, show both values
          if (isMismatched) {
            displayValue = (
              <>
                <span className="font-semibold text-red-700">{String(isMismatched.invoice_value)}</span>
                {' / '}
                <span className="font-semibold text-blue-700">{String(isMismatched.po_value)}</span>
                <span className="text-xs text-red-500 ml-1 block">{isMismatched.issue?.replace(/_/g, ' ') || 'Mismatch'}</span>
              </>
            );
          }

          return (
            <td
              key={`${type}-item-${index}-${key}`}
              className={`py-3 px-4 text-sm whitespace-nowrap ${isMismatched ? 'bg-red-100' : 'text-gray-800'}`}
            >
              {displayValue}
            </td>
          );
        })}
      </tr>
    );
  };


  const invoiceFieldsToDisplay = [
    { path: "invoice_number", label: "Invoice Number" },
    { path: "invoice_date", label: "Invoice Date" },
    { path: "po_number_extracted", label: "PO Number (from Invoice)" },
    { path: "bond_lut_number", label: "BOND/LUT No." },
    { path: "supplier_details.name", label: "Supplier Name" },
    { path: "supplier_details.address", label: "Supplier Address" },
    { path: "supplier_details.gstin", label: "Supplier GSTIN" },
    { path: "recipient_details.name", label: "Recipient Name" },
    { path: "recipient_details.address", label: "Recipient Address" },
    { path: "recipient_details.gstin", label: "Recipient GSTIN" },
    { path: "delivery_address", label: "Delivery Address" },
    { path: "hsn_sac_code", label: "HSN/SAC Code" },
    { path: "quantity_code", label: "Overall Quantity Code" },
    { path: "total_value_of_supply", label: "Total Value of Supply" },
    { path: "taxable_value_of_supply", label: "Taxable Value of Supply" },
    { path: "tax_rate", label: "Overall Tax Rate" },
    { path: "amount_of_tax_charged", label: "Amount of Tax Charged" },
    { path: "place_of_supply", label: "Place of Supply" },
    { path: "delivery_address_different", label: "Delivery Address Different" },
    { path: "tax_payable_on_reverse_charge", label: "Tax Payable on Reverse Charge" },
    { path: "manual_digital_signature", label: "Manual/Digital Signature" },
    { path: "remarks", label: "Remarks" },
  ];

  const poFieldsToDisplay = [
    { path: "po_number", label: "PO Number" },
    { path: "po_date", label: "PO Date" },
    { path: "invoice_number", label: "Invoice Number (from PO)" },
    { path: "invoice_date", label: "Invoice Date (from PO)" },
    { path: "bond_lut_number", label: "BOND/LUT No." },
    { path: "supplier_details.name", label: "Supplier Name" },
    { path: "supplier_details.address", label: "Supplier Address" },
    { path: "supplier_details.gstin", label: "Supplier GSTIN" },
    { path: "recipient_details.name", label: "Recipient Name" },
    { path: "recipient_details.address", label: "Recipient Address" },
    { path: "recipient_details.gstin", label: "Recipient GSTIN" },
    { path: "delivery_address", label: "Delivery Address" },
    { path: "hsn_sac_code", label: "HSN/SAC Code" },
    { path: "quantity_code", label: "Overall Quantity Code" },
    { path: "total_amount", label: "PO Total Amount" },
    { path: "total_value_of_supply", label: "Total Value of Supply (from PO)" },
    { path: "taxable_value_of_supply", label: "Taxable Value of Supply (from PO)" },
    { path: "tax_rate", label: "Overall Tax Rate (from PO)" },
    { path: "amount_of_tax_charged", label: "Amount of Tax Charged (from PO)" },
    { path: "place_of_supply", label: "Place of Supply (from PO)" },
    { path: "delivery_address_different", label: "Delivery Address Different (from PO)" },
    { path: "tax_payable_on_reverse_charge", label: "Tax Payable on Reverse Charge (from PO)" },
    { path: "manual_digital_signature", label: "Manual/Digital Signature (from PO)" },
    { path: "remarks", label: "Remarks (from PO)" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 flex flex-col items-center">
      <div className="bg-white rounded-xl shadow-2xl p-6 md:p-8 w-full max-w-5xl border border-gray-200">
        <h1 className="text-3xl md:text-4xl font-extrabold text-gray-800 mb-8 border-b-4 pb-4 border-custom-red text-center">
          Invoice Validation Report
        </h1>

        {/* Overall Summary */}
        <div className="mb-8 p-6 bg-blue-50 rounded-lg border border-blue-200 shadow-md">
          <h2 className="text-2xl font-bold text-blue-800 mb-4 flex items-center">
            <span className="mr-2">📊</span> Overall Status
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-8 text-lg">
            <p>
              <strong className="text-gray-700">Invoice Number:</strong> <span className="font-semibold text-gray-900">{summary?.invoice_number || 'N/A'}</span>
            </p>
            <p>
              <strong className="text-gray-700">Selected Checklist:</strong>{' '}
              <span className="font-semibold text-gray-900">
                {summary?.selected_checklist_option ? summary.selected_checklist_option.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown'}
              </span>
            </p>
            <p className="flex items-center">
              <strong className="text-gray-700">Invoice Validation:</strong>{' '}
              <span className={`font-bold ml-2 flex items-center ${summary?.overall_invoice_validation_status === 'Accepted' ? 'text-green-600' : 'text-red-600'}`}>
                {summary?.overall_invoice_validation_status}
                {summary?.overall_invoice_validation_status === 'Accepted' ? <CheckCircle className="h-5 w-5 ml-2" /> : <XCircle className="h-5 w-5 ml-2" />}
              </span>
            </p>
            <p className="flex items-center">
              <strong className="text-gray-700">PO Comparison:</strong>{' '}
              <span className={`font-bold ml-2 flex items-center ${
                summary?.overall_po_comparison_status === 'Accepted' || summary?.overall_po_comparison_status === 'N/A (No PO Provided)'
                  ? 'text-green-600' : 'text-red-600'
                }`}>
                {summary?.overall_po_comparison_status}
                {summary?.overall_po_comparison_status === 'Accepted' || summary?.overall_po_comparison_status === 'N/A (No PO Provided)' ? <CheckCircle className="h-5 w-5 ml-2" /> : <XCircle className="h-5 w-5 ml-2" />}
              </span>
            </p>
          </div>
          <p className="mt-6 text-gray-600 italic border-t border-blue-100 pt-4 text-center">
            "{summary?.summary_message}"
          </p>
        </div>

        {/* Detailed PO Mismatches Summary */}
        {(po_comparison_results?.mismatched_fields && Object.keys(po_comparison_results.mismatched_fields).length > 0) ||
         (po_comparison_results?.missing_in_invoice && po_comparison_results.missing_in_invoice.length > 0) ||
         (po_comparison_results?.missing_in_po && po_comparison_results.missing_in_po.length > 0) ? (
          <div className="mb-8 p-6 bg-red-50 border border-red-200 rounded-lg shadow-md">
            <h3 className="text-2xl font-bold text-red-800 mb-4 flex items-center">
              <span className="mr-2">⚠️</span> PO Comparison Discrepancies
            </h3>

            {po_comparison_results?.mismatched_fields && Object.keys(po_comparison_results.mismatched_fields).length > 0 && (
              <div className="mb-4">
                <h4 className="text-xl font-semibold text-red-700 mb-3">Field Value Mismatches:</h4>
                <ul className="space-y-2">
                  {Object.entries(po_comparison_results.mismatched_fields).map(([field, values]) => {
                    if (field === "line_item_details") {
                      return (
                        <li key={field} className="border-t border-red-100 pt-3 mt-3">
                          <h5 className="text-lg font-semibold text-red-600 mb-2">Line Item Discrepancies:</h5>
                          <ul className="list-disc list-inside ml-4 space-y-1">
                            {(values || []).map((mismatch_detail, index) => (
                              <li key={`line-mismatch-summary-${index}`} className="text-sm text-red-600">
                                {mismatch_detail.type === "count_mismatch" && (
                                  <p className="font-medium">{mismatch_detail.message}</p>
                                )}
                                {mismatch_detail.type === "extra_invoice_item" && (
                                  <p className="font-medium">Extra Invoice Item #{mismatch_detail.item_index + 1}: <span className="font-normal text-gray-700">{JSON.stringify(mismatch_detail.invoice_item)}</span></p>
                                )}
                                {mismatch_detail.type === "extra_po_item" && (
                                  <p className="font-medium">Extra PO Item #{mismatch_detail.item_index + 1}: <span className="font-normal text-gray-700">{JSON.stringify(mismatch_detail.po_item)}</span></p>
                                )}
                                {mismatch_detail.type === "item_value_mismatch" && (
                                  <div>
                                    <p className="font-medium">Item #{mismatch_detail.item_index + 1} Field Mismatches:</p>
                                    <ul className="list-disc list-inside ml-4">
                                      {Object.entries(mismatch_detail.mismatches).map(([subField, subValues]) => (
                                        <li key={`${index}-${subField}`}>
                                          <span className="font-semibold">{subField.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</span>
                                          Invoice: <span className="font-normal text-gray-700">{JSON.stringify(subValues.invoice_value)}</span>, PO: <span className="font-normal text-gray-700">{JSON.stringify(subValues.po_value)}</span>
                                          {subValues.issue && ` (${subValues.issue.replace(/_/g, ' ')})`}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </li>
                      );
                    } else {
                      return (
                        <li key={field} className="text-red-700 text-base">
                          <span className="font-semibold">{field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</span>{' '}
                          Invoice: <span className="font-normal text-gray-700">{JSON.stringify(values.invoice_value)}</span>, PO: <span className="font-normal text-gray-700">{JSON.stringify(values.po_value)}</span>
                        </li>
                      );
                    }
                  })}
                </ul>
              </div>
            )}

            {po_comparison_results?.missing_in_invoice && po_comparison_results.missing_in_invoice.length > 0 && (
              <div className="mb-4 border-t border-red-100 pt-4">
                <h3 className="text-xl font-semibold text-red-700 mb-3">Fields Missing in Invoice (based on PO):</h3>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  {po_comparison_results.missing_in_invoice.map((field, index) => (
                    <li key={`missing-inv-${index}`} className="text-red-700 text-base">{field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</li>
                  ))}
                </ul>
              </div>
            )}

            {po_comparison_results?.missing_in_po && po_comparison_results.missing_in_po.length > 0 && (
              <div className="border-t border-red-100 pt-4">
                <h3 className="text-xl font-semibold text-red-700 mb-3">Fields Missing in PO (based on Invoice):</h3>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  {po_comparison_results.missing_in_po.map((field, index) => (
                    <li key={`missing-po-${index}`} className="text-red-700 text-base">{field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}

        {/* Extracted Invoice Data */}
        <div className="mb-8 bg-white rounded-lg shadow-md border border-gray-200">
          <button
            className="w-full flex justify-between items-center p-5 bg-gray-100 rounded-t-lg text-gray-800 font-bold text-xl hover:bg-gray-200 transition-colors"
            onClick={() => toggleSection('invoiceData')}
          >
            Extracted Invoice Data & Checklist Validation
            {openSections.invoiceData ? <ChevronUp className="h-6 w-6" /> : <ChevronDown className="h-6 w-6" />}
          </button>
          {openSections.invoiceData && (
            <div className="py-4">
              {invoiceFieldsToDisplay.map(field =>
                renderField(field.path, extracted_invoice_data, invoice_validation_issues, field.label)
              )}
            </div>
          )}
        </div>

        {/* Invoice Line Items */}
        {extracted_invoice_data?.items && extracted_invoice_data.items.length > 0 ? (
          <div className="mb-8 bg-white rounded-lg shadow-md border border-gray-200 overflow-x-auto">
            <button
              className="w-full flex justify-between items-center p-5 bg-gray-100 rounded-t-lg text-gray-800 font-bold text-xl hover:bg-gray-200 transition-colors"
              onClick={() => toggleSection('invoiceLineItems')}
            >
              Invoice Line Items
              {openSections.invoiceLineItems ? <ChevronUp className="h-6 w-6" /> : <ChevronDown className="h-6 w-6" />}
            </button>
            {openSections.invoiceLineItems && (
              <div className="p-4">
                <table className="min-w-full divide-y divide-gray-200 rounded-lg overflow-hidden border border-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        #
                      </th>
                      {commonLineItemKeys.map(({ key, label }) => (
                        <th key={key} scope="col" className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {extracted_invoice_data.items.map((item, index) => renderLineItemRow(item, index, 'invoice'))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200 text-gray-600 italic text-center">
            No line items extracted from the invoice.
          </div>
        )}

        {/* PO Comparison Results */}
        {extracted_po_data ? (
          <>
            <div className="mb-8 bg-white rounded-lg shadow-md border border-gray-200">
              <button
                className="w-full flex justify-between items-center p-5 bg-gray-100 rounded-t-lg text-gray-800 font-bold text-xl hover:bg-gray-200 transition-colors"
                onClick={() => toggleSection('poData')}
              >
                Extracted PO Data & Comparison
                {openSections.poData ? <ChevronUp className="h-6 w-6" /> : <ChevronDown className="h-6 w-6" />}
              </button>
              {openSections.poData && (
                <div className="py-4">
                  {poFieldsToDisplay.map(field =>
                    renderField(field.path, extracted_po_data,
                      po_comparison_results?.missing_in_po?.reduce((acc, miss_path) => {
                        if (miss_path === field.path) acc[field.path] = `Missing in PO.`;
                        return acc;
                      }, {}) || {},
                      field.label, true)
                  )}
                </div>
              )}
            </div>

            {/* PO Line Items */}
            {extracted_po_data?.items && extracted_po_data.items.length > 0 ? (
              <div className="mb-8 bg-white rounded-lg shadow-md border border-gray-200 overflow-x-auto">
                <button
                  className="w-full flex justify-between items-center p-5 bg-gray-100 rounded-t-lg text-gray-800 font-bold text-xl hover:bg-gray-200 transition-colors"
                  onClick={() => toggleSection('poLineItems')}
                >
                  PO Line Items
                  {openSections.poLineItems ? <ChevronUp className="h-6 w-6" /> : <ChevronDown className="h-6 w-6" />}
                </button>
                {openSections.poLineItems && (
                  <div className="p-4">
                    <table className="min-w-full divide-y divide-gray-200 rounded-lg overflow-hidden border border-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            #
                          </th>
                          {commonLineItemKeys.map(({ key, label }) => (
                            <th key={key} scope="col" className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {extracted_po_data.items.map((item, index) => renderLineItemRow(item, index, 'po'))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200 text-gray-600 italic text-center">
                No line items extracted from the PO.
              </div>
            )}
          </>
        ) : (
          <div className="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200 text-gray-600 italic text-center">
            No Purchase Order data available for comparison.
          </div>
        )}
      </div>
    </div>
  );
}

export default ValidationDetailView;
