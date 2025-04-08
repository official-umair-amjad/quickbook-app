/**
 * QuickBooks UI Formatter
 * Enhances the display of QuickBooks data in the chat interface
 */

// Main formatting styles
const styles = `
<style>
  .qb-data-card {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 10px;
    background-color: white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  
  .qb-card-header {
    font-weight: bold;
    margin-bottom: 8px;
    color: #2d7ff9;
    border-bottom: 1px solid #eee;
    padding-bottom: 5px;
  }
  
  .qb-customer-name {
    font-weight: bold;
    color: #333;
  }
  
  .qb-customer-email {
    color: #666;
    font-style: italic;
  }
  
  .qb-customer-phone {
    color: #666;
  }
  
  .qb-tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: bold;
    margin-left: 5px;
  }
  
  .qb-paid {
    background-color: #e1f5e1;
    color: #2e7d32;
  }
  
  .qb-unpaid {
    background-color: #ffebee;
    color: #c62828;
  }
  
  .qb-amount {
    font-weight: bold;
    color: #333;
  }
  
  .qb-section-title {
    font-weight: bold;
    margin-top: 10px;
    margin-bottom: 5px;
    color: #333;
  }
  
  .qb-data-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 10px;
  }
</style>
`;

// Format customer data for display
function formatCustomers(customersData) {
  // Add our custom styles
  let html = styles;
  
  // Extract customers from different possible data structures
  let customers = [];
  if (Array.isArray(customersData)) {
    customers = customersData;
  } else if (customersData.data && Array.isArray(customersData.data)) {
    customers = customersData.data;
  } else if (customersData.QueryResponse && customersData.QueryResponse.Customer) {
    customers = customersData.QueryResponse.Customer;
  }
  
  if (!customers || customers.length === 0) {
    return "<p>No customers found</p>";
  }

  html += "<div class='qb-section-title'>Your Customers</div>";
  html += "<div class='qb-data-list'>";
  
  customers.forEach(customer => {
    html += `
      <div class='qb-data-card'>
        <div class='qb-card-header'>${customer.DisplayName || 'Unknown Customer'}</div>
        <div>
          ${customer.CompanyName ? `<div>Company: ${customer.CompanyName}</div>` : ''}
          ${customer.PrimaryEmailAddr ? `<div class='qb-customer-email'>Email: ${customer.PrimaryEmailAddr.Address}</div>` : ''}
          ${customer.PrimaryPhone ? `<div class='qb-customer-phone'>Phone: ${customer.PrimaryPhone.FreeFormNumber}</div>` : ''}
        </div>
      </div>
    `;
  });
  
  html += "</div>";
  return html;
}

// Format invoice data for display
function formatInvoices(invoicesData, status = 'All') {
  // Add our custom styles
  let html = styles;
  
  // Extract invoices from different possible data structures
  let invoices = [];
  if (Array.isArray(invoicesData)) {
    invoices = invoicesData;
  } else if (invoicesData.data && Array.isArray(invoicesData.data)) {
    invoices = invoicesData.data;
  } else if (invoicesData.QueryResponse && invoicesData.QueryResponse.Invoice) {
    invoices = invoicesData.QueryResponse.Invoice;
  }
  
  if (!invoices || invoices.length === 0) {
    return "<p>No invoices found</p>";
  }

  // Filter by status if needed
  if (status.toLowerCase() === 'paid') {
    invoices = invoices.filter(inv => inv.Balance === 0);
  } else if (status.toLowerCase() === 'unpaid') {
    invoices = invoices.filter(inv => inv.Balance > 0);
  }

  const statusLabel = status !== 'All' ? status + ' ' : '';
  html += `<div class='qb-section-title'>Your ${statusLabel}Invoices</div>`;
  html += "<div class='qb-data-list'>";
  
  invoices.forEach(invoice => {
    const isPaid = invoice.Balance === 0;
    const statusTag = isPaid 
      ? "<span class='qb-tag qb-paid'>Paid</span>" 
      : "<span class='qb-tag qb-unpaid'>Unpaid</span>";
      
    html += `
      <div class='qb-data-card'>
        <div class='qb-card-header'>
          Invoice #${invoice.DocNumber || invoice.Id} ${statusTag}
        </div>
        <div>
          <div>Customer: ${invoice.CustomerRef?.name || 'Unknown Customer'}</div>
          <div class='qb-amount'>Amount: $${invoice.TotalAmt}</div>
          ${invoice.DueDate ? `<div>Due: ${invoice.DueDate}</div>` : ''}
        </div>
      </div>
    `;
  });
  
  html += "</div>";
  return html;
}

// Format company information for display
function formatCompanyInfo(companyData) {
  // Add our custom styles
  let html = styles;
  
  // Extract company info from different possible data structures
  let companyInfo = companyData;
  if (companyData.data) {
    companyInfo = companyData.data;
  }
  
  if (!companyInfo || Object.keys(companyInfo).length === 0) {
    return "<p>No company information found</p>";
  }
  
  html += `
    <div class='qb-data-card'>
      <div class='qb-card-header'>${companyInfo.CompanyName || 'Your Company'}</div>
      
      <div class='qb-section-title'>Contact Information</div>
      <div>
        ${companyInfo.CompanyAddr ? `
          <div>
            Address: ${companyInfo.CompanyAddr.Line1 || ''}, 
            ${companyInfo.CompanyAddr.City || ''}, 
            ${companyInfo.CompanyAddr.CountrySubDivisionCode || ''} 
            ${companyInfo.CompanyAddr.PostalCode || ''}
          </div>
        ` : ''}
        
        ${companyInfo.PrimaryPhone ? `
          <div>Phone: ${companyInfo.PrimaryPhone.FreeFormNumber}</div>
        ` : ''}
        
        ${companyInfo.PrimaryEmailAddr ? `
          <div>Email: ${companyInfo.PrimaryEmailAddr.Address}</div>
        ` : ''}
      </div>
      
      <div class='qb-section-title'>Business Details</div>
      <div>
        ${companyInfo.LegalName ? `<div>Legal Name: ${companyInfo.LegalName}</div>` : ''}
        ${companyInfo.Industry ? `<div>Industry: ${companyInfo.Industry}</div>` : ''}
        ${companyInfo.WebAddr ? `<div>Website: ${companyInfo.WebAddr.URI}</div>` : ''}
      </div>
    </div>
  `;
  
  return html;
}

// Function to detect and format QuickBooks data in AI responses
function formatQuickBooksData(text) {
  // Check if the response contains patterns that look like QB data
  
  // Customer list pattern
  if (text.includes('Here are your customers:') || 
      (text.includes('customer') && text.match(/\d+\.\s+[\w\s']+([\w@\.-]+)/))) {
    
    // Extract customer data from text format and convert to structure
    const customerLines = text.split('\n').filter(line => 
      line.match(/\d+\.\s+[\w\s']+/) && 
      !line.includes('Example questions:')
    );
    
    if (customerLines.length > 0) {
      const customers = customerLines.map(line => {
        // Extract name, email, phone
        const nameMatch = line.match(/\d+\.\s+([\w\s']+)/) || [];
        const emailMatch = line.match(/\(([\w@\.-]+)\)/) || [];
        const phoneMatch = line.match(/-([\d\s\(\)-]+)$/) || [];
        
        return {
          DisplayName: nameMatch[1] ? nameMatch[1].trim() : 'Unknown',
          PrimaryEmailAddr: emailMatch[1] ? { Address: emailMatch[1].trim() } : null,
          PrimaryPhone: phoneMatch[1] ? { FreeFormNumber: phoneMatch[1].trim() } : null
        };
      });
      
      return formatCustomers(customers);
    }
  }
  
  // Invoice list pattern
  if (text.includes('Here are your invoices:') || 
      (text.includes('Invoice #') && text.includes('(Paid)') || text.includes('(Unpaid)'))) {
    
    // Extract invoice data
    const invoiceLines = text.split('\n').filter(line => 
      line.match(/\d+\.\s+Invoice #/) && 
      !line.includes('Example questions:')
    );
    
    if (invoiceLines.length > 0) {
      const invoices = invoiceLines.map(line => {
        // Extract invoice number, customer, amount, status
        const invoiceMatch = line.match(/Invoice #(\d+)/) || [];
        const customerMatch = line.match(/- ([\w\s']+) -/) || [];
        const amountMatch = line.match(/\$(\d+(\.\d+)?)/) || [];
        const isPaid = line.includes('(Paid)');
        
        return {
          DocNumber: invoiceMatch[1] || 'Unknown',
          CustomerRef: { name: customerMatch[1] ? customerMatch[1].trim() : 'Unknown Customer' },
          TotalAmt: amountMatch[1] || '0',
          Balance: isPaid ? 0 : amountMatch[1] || '0'
        };
      });
      
      // Determine if this is a filtered list
      const status = text.toLowerCase().includes('paid invoices') ? 'Paid' : 
                     text.toLowerCase().includes('unpaid invoices') ? 'Unpaid' : 'All';
      
      return formatInvoices(invoices, status);
    }
  }
  
  // Company info pattern
  if (text.includes('Your company:') || 
      (text.includes('company') && text.includes('Address:') && text.includes('Phone:'))) {
    
    // Extract company info
    const nameMatch = text.match(/Your company:\s+([\w\s']+)/) || [];
    const addressMatch = text.match(/Address:\s+([\w\s,.'-]+)/) || [];
    const phoneMatch = text.match(/Phone:\s+([\d\s\(\)-]+)/) || [];
    const emailMatch = text.match(/Email:\s+([\w@\.-]+)/) || [];
    
    const companyInfo = {
      CompanyName: nameMatch[1] ? nameMatch[1].trim() : 'Your Company',
      CompanyAddr: addressMatch[1] ? {
        Line1: addressMatch[1].split(',')[0]?.trim() || '',
        City: addressMatch[1].split(',')[1]?.trim() || '',
        CountrySubDivisionCode: addressMatch[1].split(',')[2]?.trim().split(' ')[0] || '',
        PostalCode: addressMatch[1].split(',')[2]?.trim().split(' ')[1] || ''
      } : null,
      PrimaryPhone: phoneMatch[1] ? { FreeFormNumber: phoneMatch[1].trim() } : null,
      PrimaryEmailAddr: emailMatch[1] ? { Address: emailMatch[1].trim() } : null
    };
    
    return formatCompanyInfo(companyInfo);
  }
  
  // If no recognized pattern, return the original text
  return text;
}

// Function to enhance the chat interface
function enhanceChatInterface() {
  // Original sendMessage function
  const originalSendMessage = window.sendMessage;
  
  // Override the sendMessage function to apply formatting
  window.sendMessage = async function() {
    const inputField = document.getElementById("chat-input");
    const chatBox = document.getElementById("chat-box");
    const userMessage = inputField.value.trim();
    if (!userMessage) return;

    // Display user message in chat with styling
    chatBox.innerHTML += `<div class="chat-user-message"><strong>You:</strong> ${userMessage}</div>`;
    inputField.value = "";
    
    // Show typing indicator
    const typingIndicator = document.createElement("div");
    typingIndicator.id = "typing-indicator";
    typingIndicator.innerHTML = `<div class="typing-indicator"><strong>AI:</strong> <span>Typing...</span></div>`;
    chatBox.appendChild(typingIndicator);
    
    // Scroll to the bottom of chat box
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
      // Get the selected AI provider
      const selectedProvider = document.getElementById("ai-provider").value;
      
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Session-ID": window.sessionId
        },
        body: JSON.stringify({ 
          message: userMessage,
          provider: selectedProvider
        }),
      });
      
      // Remove typing indicator
      const indicator = document.getElementById("typing-indicator");
      if (indicator) chatBox.removeChild(indicator);
      
      const data = await response.json();
      
      // Format the response with proper styling
      let aiResponse = data.response || JSON.stringify(data);
      
      // Apply QuickBooks data formatting
      const formattedResponse = formatQuickBooksData(aiResponse);
      
      // Create provider badge
      let providerBadge = '';
      if (data.provider && data.model) {
        const badgeClass = data.provider === 'anthropic' ? 'bg-primary' : 'bg-success';
        providerBadge = `<span class="badge ${badgeClass} mb-1">${data.provider} - ${data.model}</span><br>`;
      }
      
      // Add the AI response to the chat with styling and provider info
      chatBox.innerHTML += `<div class="chat-ai-message">${providerBadge}<strong>AI:</strong> ${formattedResponse}</div>`;
      
      // Scroll to the bottom of chat box
      chatBox.scrollTop = chatBox.scrollHeight;
    } catch (error) {
      // Remove typing indicator
      const indicator = document.getElementById("typing-indicator");
      if (indicator) chatBox.removeChild(indicator);
      
      chatBox.innerHTML += `<div class="alert alert-danger mb-2"><strong>Error:</strong> ${error.message}</div>`;
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  };
}

// Initialize the enhanced chat interface when the document is loaded
document.addEventListener('DOMContentLoaded', function() {
  enhanceChatInterface();
  
  // Also enhance the view data tab
  const originalFetchData = window.fetchData;
  if (typeof originalFetchData === 'function') {
    window.fetchData = function(url, title) {
      document.getElementById("resultTitle").textContent = title;
      document.getElementById("results").innerHTML = "<p>Loading...</p>";

      fetch(url)
        .then((response) => {
          if (!response.ok) {
            return response.json().then((err) => {
              throw err;
            });
          }
          return response.json();
        })
        .then((data) => {
          const resultsDiv = document.getElementById("results");
          if (data.message && data.message.includes("No")) {
            resultsDiv.innerHTML = `
              <div class="alert alert-warning">
                <h5>No Data Found</h5>
                <p>${data.message}</p>
                <p>You might need to create some data in your QuickBooks Sandbox first.</p>
              </div>
            `;
            return;
          }
          
          // Apply formatting based on the endpoint
          if (url.includes('/api/customers')) {
            resultsDiv.innerHTML = formatCustomers(data);
          } else if (url.includes('/api/invoices')) {
            resultsDiv.innerHTML = formatInvoices(data);
          } else if (url.includes('/api/company')) {
            resultsDiv.innerHTML = formatCompanyInfo(data);
          } else {
            resultsDiv.innerHTML = "<pre>" + JSON.stringify(data, null, 2) + "</pre>";
          }
        })
        .catch((error) => {
          console.error("Error fetching data:", error);
          let errorMessage = error.error || "Unknown error";
          let errorDetails = "";

          if (error.details) {
            errorDetails += `<p><strong>Details:</strong> ${error.details}</p>`;
          }
          if (error.code) {
            errorDetails += `<p><strong>Code:</strong> ${error.code}</p>`;
          }
          if (error.type) {
            errorDetails += `<p><strong>Type:</strong> ${error.type}</p>`;
          }

          document.getElementById("results").innerHTML = `
            <div class="alert alert-danger">
              <h5>Error: ${errorMessage}</h5>
              ${errorDetails}
              <p class="mt-3">
                <strong>Possible solutions:</strong>
                <ul>
                  <li>Check if your QuickBooks Sandbox has any data</li>
                  <li>Verify your app permissions in the QuickBooks Developer portal</li>
                  <li>Try reconnecting to QuickBooks</li>
                </ul>
              </p>
            </div>
          `;
        });
    };
  }
}); 