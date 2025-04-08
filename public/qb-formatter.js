/**
 * QuickBooks Data Formatter (Fallback)
 * Provides table-based formatting for QuickBooks data if custom-ui.js is not available
 */

// Format customer list as a table
function formatCustomersAsTable(text) {
  if (!text.includes('customer')) return text;
  
  // Extract customer lines from text format
  const customerLines = text.split('\n').filter(line => 
    line.match(/\d+\.\s+[\w\s']+/) && 
    !line.includes('Example questions:')
  );
  
  if (customerLines.length === 0) return text;
  
  let html = `
    <style>
      .qb-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 15px;
        font-size: 14px;
      }
      .qb-table th {
        background-color: #f0f0f0;
        padding: 8px;
        text-align: left;
        border: 1px solid #ddd;
      }
      .qb-table td {
        padding: 8px;
        border: 1px solid #ddd;
      }
      .qb-table tr:nth-child(even) {
        background-color: #f9f9f9;
      }
      .qb-table tr:hover {
        background-color: #f1f1f1;
      }
    </style>
    <table class="qb-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Customer Name</th>
          <th>Email</th>
          <th>Phone</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  customerLines.forEach(line => {
    // Extract customer information using regex
    const indexMatch = line.match(/(\d+)\./) || [];
    const nameMatch = line.match(/\d+\.\s+([\w\s']+)/) || [];
    const emailMatch = line.match(/\(([\w@\.-]+)\)/) || [];
    const phoneMatch = line.match(/-([\d\s\(\)-]+)$/) || [];
    
    const index = indexMatch[1] || '';
    const name = nameMatch[1] ? nameMatch[1].trim() : 'Unknown';
    const email = emailMatch[1] ? emailMatch[1].trim() : '';
    const phone = phoneMatch[1] ? phoneMatch[1].trim() : '';
    
    html += `
      <tr>
        <td>${index}</td>
        <td>${name}</td>
        <td>${email}</td>
        <td>${phone}</td>
      </tr>
    `;
  });
  
  html += `
      </tbody>
    </table>
  `;
  
  return html;
}

// Format invoices as a table
function formatInvoicesAsTable(text) {
  if (!text.includes('invoice')) return text;
  
  // Extract invoice lines
  const invoiceLines = text.split('\n').filter(line => 
    (line.includes('Invoice #') || line.match(/\d+\.\s+Invoice/)) && 
    !line.includes('Example questions:')
  );
  
  if (invoiceLines.length === 0) return text;
  
  let html = `
    <style>
      .qb-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 15px;
        font-size: 14px;
      }
      .qb-table th {
        background-color: #f0f0f0;
        padding: 8px;
        text-align: left;
        border: 1px solid #ddd;
      }
      .qb-table td {
        padding: 8px;
        border: 1px solid #ddd;
      }
      .qb-table tr:nth-child(even) {
        background-color: #f9f9f9;
      }
      .qb-table tr:hover {
        background-color: #f1f1f1;
      }
      .status-pill {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: bold;
      }
      .status-paid {
        background-color: #e8f5e9;
        color: #2e7d32;
      }
      .status-unpaid {
        background-color: #ffebee;
        color: #c62828;
      }
    </style>
    <table class="qb-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Invoice #</th>
          <th>Customer</th>
          <th>Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  invoiceLines.forEach((line, index) => {
    // Extract invoice information using regex
    const invoiceMatch = line.match(/Invoice #(\d+)/) || [];
    const customerMatch = line.match(/- ([\w\s']+) -/) || [];
    const amountMatch = line.match(/\$([\d,.]+)/) || [];
    const isPaid = line.includes('(Paid)');
    
    const invoiceNum = invoiceMatch[1] || 'Unknown';
    const customer = customerMatch[1] ? customerMatch[1].trim() : 'Unknown Customer';
    const amount = amountMatch[1] || '0.00';
    const statusHtml = isPaid 
      ? '<span class="status-pill status-paid">Paid</span>' 
      : '<span class="status-pill status-unpaid">Unpaid</span>';
    
    html += `
      <tr>
        <td>${index + 1}</td>
        <td>${invoiceNum}</td>
        <td>${customer}</td>
        <td>$${amount}</td>
        <td>${statusHtml}</td>
      </tr>
    `;
  });
  
  html += `
      </tbody>
    </table>
  `;
  
  return html;
}

// Format company information with a structured layout
function formatCompanyInfoAsTable(text) {
  if (!text.includes('company') || !(text.includes('Address:') || text.includes('Phone:'))) {
    return text;
  }
  
  // Extract company info using regex
  const nameMatch = text.match(/Your company:\s+([\w\s']+)/) || [];
  const addressMatch = text.match(/Address:\s+([\w\s,.'-]+)/) || [];
  const phoneMatch = text.match(/Phone:\s+([\d\s\(\)-]+)/) || [];
  const emailMatch = text.match(/Email:\s+([\w@\.-]+)/) || [];
  
  const companyName = nameMatch[1] ? nameMatch[1].trim() : 'Your Company';
  const address = addressMatch[1] ? addressMatch[1].trim() : '';
  const phone = phoneMatch[1] ? phoneMatch[1].trim() : '';
  const email = emailMatch[1] ? emailMatch[1].trim() : '';
  
  let html = `
    <style>
      .company-card {
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 15px;
        background-color: white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .company-header {
        font-size: 18px;
        font-weight: bold;
        margin-bottom: 15px;
        padding-bottom: 8px;
        border-bottom: 1px solid #eee;
        color: #2c3e50;
      }
      .company-section {
        margin-bottom: 12px;
      }
      .section-title {
        font-weight: bold;
        color: #486684;
        margin-bottom: 5px;
      }
      .info-row {
        display: flex;
        margin-bottom: 4px;
      }
      .info-label {
        font-weight: bold;
        width: 100px;
      }
      .info-value {
        flex: 1;
      }
    </style>
    <div class="company-card">
      <div class="company-header">${companyName}</div>
      
      <div class="company-section">
        <div class="section-title">Contact Information</div>
  `;
  
  if (address) {
    html += `
      <div class="info-row">
        <div class="info-label">Address:</div>
        <div class="info-value">${address}</div>
      </div>
    `;
  }
  
  if (phone) {
    html += `
      <div class="info-row">
        <div class="info-label">Phone:</div>
        <div class="info-value">${phone}</div>
      </div>
    `;
  }
  
  if (email) {
    html += `
      <div class="info-row">
        <div class="info-label">Email:</div>
        <div class="info-value">${email}</div>
      </div>
    `;
  }
  
  html += `
      </div>
    </div>
  `;
  
  return html;
}

// Main function to format QuickBooks data in AI responses
function formatQuickBooksData(text) {
  if (!text) return text;
  
  // Check for customer list
  if (text.includes('Here are your customers:') || 
     (text.includes('customer') && text.match(/\d+\.\s+[\w\s']+([\w@\.-]+)/))) {
    return formatCustomersAsTable(text);
  }
  
  // Check for invoice list
  if (text.includes('Here are your invoices:') || 
     (text.includes('Invoice #') && (text.includes('(Paid)') || text.includes('(Unpaid)')))) {
    return formatInvoicesAsTable(text);
  }
  
  // Check for company info
  if (text.includes('Your company:') || 
     (text.includes('company') && text.includes('Address:') && text.includes('Phone:'))) {
    return formatCompanyInfoAsTable(text);
  }
  
  // Return unmodified text if no pattern matches
  return text;
}