import express from 'express';
import OAuthClient from 'intuit-oauth';
import nodeQuickbooks from 'node-quickbooks';
const QuickBooks = nodeQuickbooks;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

// Import AI tools and functions
import {
  getCompanyInfo, 
  listCustomers, 
  createCustomer, 
  findCustomerByName,
  listInvoices,
  findInvoiceById,
  findInvoicesByCustomer,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  sendInvoiceEmail
} from "../ai-tools/aiTools.js";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public/index.html')));
app.use(express.static(path.join(__dirname, '../public/connected.html')));

// Token refresh middleware
app.use(async (req, res, next) => {
  if (qbTokens && qbTokens.access_token) {
    try {
      // Check if access token is expired or about to expire
      const expiryDate = new Date(qbTokens.expires_in);
      const now = new Date();
      const tokenExpired = now >= expiryDate;

      // If token is expired, refresh it
      if (tokenExpired) {
        console.log('Access token expired, refreshing...');
        const authResponse = await oauthClient.refreshUsingToken(qbTokens.refresh_token);
        qbTokens = authResponse.getJson();
        console.log('Tokens refreshed successfully');
      }
    } catch (error) {
      console.error('Error in token refresh middleware:', error);
      // Continue anyway, the API call will fail but we'll see the detailed error
    }
  }
  next();
});

// QuickBooks OAuth client
const oauthClient = new OAuthClient({
  clientId: process.env.QB_CLIENT_ID,
  clientSecret: process.env.QB_CLIENT_SECRET,
  environment: process.env.QB_ENVIRONMENT,
  redirectUri: process.env.QB_REDIRECT_URI,
});

// Store tokens (in a real app, you would use a database)
let qbTokens = null;
let qbCompanyId = null;

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Authorization request - redirect to Intuit authentication page
app.get('/auth', (req, res) => {
  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.OpenId],
    state: 'testState',
  });
  res.redirect(authUri);
});

// OAuth callback - handle the callback from Intuit
app.get('/callback', async (req, res) => {
  try {
    // Extract the realmId from the query parameters
    const realmId = req.query.realmId;

    // Create the OAuth token
    const authResponse = await oauthClient.createToken(req.url);
    qbTokens = authResponse.getJson();

    // Set the company ID from the query parameter, not from the token
    qbCompanyId = realmId;

    // Store tokens (in a real app, save to database)
    console.log('Tokens acquired:', JSON.stringify(qbTokens, null, 2));
    console.log('Company ID:', qbCompanyId);

    res.redirect('/connected');
  } catch (error) {
    console.error('Error during OAuth callback:', error);
    res.status(500).send('Authentication failed: ' + error.message);
  }
});

// Connected page - after successful authentication
app.get('/connected', (req, res) => {
  if (!qbTokens) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, '../public/connected.html'));
});

// API endpoint to get company info
app.get('/api/company', (req, res) => {
  if (!qbTokens) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  console.log('Making API call to get company info. Tokens:', {
    access_token_exists: !!qbTokens.access_token,
    token_expires: qbTokens.expires_in ? new Date(qbTokens.expires_in).toISOString() : 'unknown',
    company_id: qbCompanyId
  });

  const qbo = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qbTokens.access_token,
    false, // no OAuth 1.0
    qbCompanyId,
    process.env.QB_ENVIRONMENT === 'sandbox', // sandbox = true, production = false
    true, // debug
    null, // minor version
    '2.0', // OAuth version
    qbTokens.refresh_token
  );

  qbo.getCompanyInfo(qbCompanyId, (err, companyInfo) => {
    if (err) {
      console.error('Error getting company info:', JSON.stringify(err, null, 2));
      return res.status(500).json({
        error: 'Failed to get company information',
        details: err.message || 'Unknown error',
        code: err.code || 'Unknown code',
        intuit_tid: err.intuit_tid || 'None',
        type: err.type || 'Unknown type'
      });
    }

    if (!companyInfo) {
      return res.json({
        message: 'No company information found',
        data: {}
      });
    }

    res.json(companyInfo);
  });
});

// API endpoint to get customers
app.get('/api/customers', (req, res) => {
  if (!qbTokens) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  console.log('Making API call to get customers. Company ID:', qbCompanyId);

  const qbo = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qbTokens.access_token,
    false,
    qbCompanyId,
    process.env.QB_ENVIRONMENT === 'sandbox',
    true,
    null,
    '2.0',
    qbTokens.refresh_token
  );

  qbo.findCustomers({}, (err, customers) => {
    if (err) {
      console.error('Error getting customers:', JSON.stringify(err, null, 2));
      return res.status(500).json({
        error: 'Failed to get customers',
        details: err.message || 'Unknown error',
        code: err.code || 'Unknown code',
        intuit_tid: err.intuit_tid || 'None',
        type: err.type || 'Unknown type'
      });
    }

    if (!customers || (customers.QueryResponse && customers.QueryResponse.Customer && customers.QueryResponse.Customer.length === 0)) {
      return res.json({
        message: 'No customers found in your QuickBooks account',
        data: customers || { QueryResponse: { Customer: [] } }
      });
    }

    res.json(customers);
  });
});

// --------------------------------
// Invoice API Endpoints
// --------------------------------

// Get all invoices
app.get('/api/invoices', (req, res) => {
  if (!qbTokens) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  console.log('Making API call to get invoices. Company ID:', qbCompanyId);

  const qbo = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qbTokens.access_token,
    false,
    qbCompanyId,
    process.env.QB_ENVIRONMENT === 'sandbox',
    true,
    null,
    '2.0',
    qbTokens.refresh_token
  );

  qbo.findInvoices({}, (err, invoices) => {
    if (err) {
      console.error('Error getting invoices:', JSON.stringify(err, null, 2));
      return res.status(500).json({
        error: 'Failed to get invoices',
        details: err.message || 'Unknown error',
        code: err.code || 'Unknown code',
        intuit_tid: err.intuit_tid || 'None',
        type: err.type || 'Unknown type'
      });
    }

    if (!invoices || (invoices.QueryResponse && invoices.QueryResponse.Invoice && invoices.QueryResponse.Invoice.length === 0)) {
      return res.json({
        message: 'No invoices found in your QuickBooks account',
        data: invoices || { QueryResponse: { Invoice: [] } }
      });
    }

    res.json(invoices);
  });
});

// Get invoice by ID
app.get('/api/invoices/:id', (req, res) => {
  if (!qbTokens) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  const qbo = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qbTokens.access_token,
    false,
    qbCompanyId,
    process.env.QB_ENVIRONMENT === 'sandbox',
    true,
    null,
    '2.0',
    qbTokens.refresh_token
  );

  qbo.getInvoice(req.params.id, (err, invoice) => {
    if (err) {
      console.error('Error getting invoice:', JSON.stringify(err, null, 2));
      return res.status(500).json({
        error: 'Failed to get invoice',
        details: err.message || 'Unknown error',
        code: err.code || 'Unknown code',
        intuit_tid: err.intuit_tid || 'None',
        type: err.type || 'Unknown type'
      });
    }

    if (!invoice) {
      return res.status(404).json({
        error: `No invoice found with ID: ${req.params.id}`
      });
    }

    res.json(invoice);
  });
});

// Create invoice
app.post('/api/invoices', (req, res) => {
  if (!qbTokens) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  console.log('Creating invoice with data:', JSON.stringify(req.body, null, 2));

  const qbo = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qbTokens.access_token,
    false,
    qbCompanyId,
    process.env.QB_ENVIRONMENT === 'sandbox',
    true,
    null,
    '2.0',
    qbTokens.refresh_token
  );

  qbo.createInvoice(req.body, (err, invoice) => {
    if (err) {
      console.error('Error creating invoice:', JSON.stringify(err, null, 2));
      return res.status(500).json({
        error: 'Failed to create invoice',
        details: err.message || 'Unknown error',
        code: err.code || 'Unknown code',
        intuit_tid: err.intuit_tid || 'None',
        type: err.type || 'Unknown type'
      });
    }

    console.log('Invoice created successfully:', JSON.stringify(invoice, null, 2));
    res.json(invoice);
  });
});

// Update invoice
app.put('/api/invoices/:id', (req, res) => {
  if (!qbTokens) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  console.log('Updating invoice with data:', JSON.stringify(req.body, null, 2));

  const qbo = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qbTokens.access_token,
    false,
    qbCompanyId,
    process.env.QB_ENVIRONMENT === 'sandbox',
    true,
    null,
    '2.0',
    qbTokens.refresh_token
  );

  qbo.updateInvoice(req.body, (err, invoice) => {
    if (err) {
      console.error('Error updating invoice:', JSON.stringify(err, null, 2));
      return res.status(500).json({
        error: 'Failed to update invoice',
        details: err.message || 'Unknown error',
        code: err.code || 'Unknown code',
        intuit_tid: err.intuit_tid || 'None',
        type: err.type || 'Unknown type'
      });
    }

    console.log('Invoice updated successfully:', JSON.stringify(invoice, null, 2));
    res.json(invoice);
  });
});

// Delete/void invoice
app.delete('/api/invoices/:id', (req, res) => {
  if (!qbTokens) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  const qbo = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qbTokens.access_token,
    false,
    qbCompanyId,
    process.env.QB_ENVIRONMENT === 'sandbox',
    true,
    null,
    '2.0',
    qbTokens.refresh_token
  );

  // First get the invoice to get its sync token
  qbo.getInvoice(req.params.id, (err, invoice) => {
    if (err) {
      console.error('Error getting invoice:', JSON.stringify(err, null, 2));
      return res.status(500).json({
        error: 'Failed to get invoice',
        details: err.message || 'Unknown error'
      });
    }

    if (!invoice) {
      return res.status(404).json({
        error: `No invoice found with ID: ${req.params.id}`
      });
    }

    // Now void the invoice
    const voidData = {
      ...invoice,
      Id: req.params.id,
      SyncToken: invoice.SyncToken,
      void: true
    };

    qbo.updateInvoice(voidData, (err, result) => {
      if (err) {
        console.error('Error voiding invoice:', JSON.stringify(err, null, 2));
        return res.status(500).json({
          error: 'Failed to void invoice',
          details: err.message || 'Unknown error'
        });
      }

      res.json({ message: `Invoice ${req.params.id} has been voided successfully` });
    });
  });
});

// Send invoice via email
app.post('/api/invoices/:id/send', (req, res) => {
  if (!qbTokens) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  const qbo = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qbTokens.access_token,
    false,
    qbCompanyId,
    process.env.QB_ENVIRONMENT === 'sandbox',
    true,
    null,
    '2.0',
    qbTokens.refresh_token
  );

  const emailAddress = req.body.email;
  qbo.sendInvoicePdf(req.params.id, emailAddress, (err, response) => {
    if (err) {
      console.error('Error sending invoice:', JSON.stringify(err, null, 2));
      return res.status(500).json({
        error: 'Failed to send invoice',
        details: err.message || 'Unknown error'
      });
    }

    res.json({ message: `Invoice ${req.params.id} has been sent successfully` });
  });
});

// --------------------------------
// Customer API Endpoints
// --------------------------------

// Example endpoint to create a customer
app.post('/api/customers', (req, res) => {
  if (!qbTokens) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  console.log('Creating customer with data:', JSON.stringify(req.body, null, 2));

  const qbo = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qbTokens.access_token,
    false,
    qbCompanyId,
    process.env.QB_ENVIRONMENT === 'sandbox',
    true,
    null,
    '2.0',
    qbTokens.refresh_token
  );

  qbo.createCustomer(req.body, (err, customer) => {
    if (err) {
      console.error('Error creating customer:', JSON.stringify(err, null, 2));
      return res.status(500).json({
        error: 'Failed to create customer',
        details: err.message || 'Unknown error',
        code: err.code || 'Unknown code',
        intuit_tid: err.intuit_tid || 'None',
        type: err.type || 'Unknown type'
      });
    }

    console.log('Customer created successfully:', JSON.stringify(customer, null, 2));
    res.json(customer);
  });
});

// --------------------------------
// New AI Chat Endpoint
// --------------------------------

// Initialize AI providers
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || "your-openai-api-key-here",
});

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "your-anthropic-api-key-here",
});

// Store conversation history (in a real app, you would use a database)
const conversationHistory = {};

app.post("/api/ai-chat", async (req, res) => {
  try {
    console.log("AI Chat request received");
    const { message, provider: requestedProvider = 'openai', model = '' } = req.body;
    const sessionId = req.headers['session-id'] || 'default-session';

    // Initialize conversation history for this session if it doesn't exist
    if (!conversationHistory[sessionId]) {
      console.log("Initializing new conversation history for session:", sessionId);
      conversationHistory[sessionId] = [
        {
          role: "system",
          content: `You are a QuickBooks data assistant that helps users interact with their accounting data directly.

CRITICAL INSTRUCTIONS:
1. ALWAYS use the appropriate tools to access QuickBooks data - NEVER claim to have direct access.
2. When responding to users, provide DIRECT answers:
   - For requests like "list all customers" - call the tool and show the data immediately.
   - DO NOT use phrases like "I'll retrieve", "I'll use", "Certainly!", "Let me", or "Here's the function". 
   - Instead, call the tool and IMMEDIATELY display the data with NO introduction.
   - Start your response with the actual data or confirmation, not with explanations of what you're doing.

EXAMPLES:

User: "list all customers"
[BAD RESPONSE] "Certainly! I'll retrieve the list of customers for you."
[GOOD RESPONSE] "Here are your customers:
1. Acme Corporation (acme@example.com)
2. Sunshine Bakery (info@sunshine.com)"

User: "show company information"
[BAD RESPONSE] "I'll get the company information for you."  
[GOOD RESPONSE] "Your company: Acme Inc.
Address: 123 Main St, Springfield
Phone: (555) 123-4567"

User: "create invoice for John Smith"
[BAD RESPONSE] "I'll create that invoice for you right away."
[GOOD RESPONSE] "Invoice #1001 created for John Smith. Total: $150.00. Due date: 2025-05-15."

Remember to always call the appropriate tool and present the results directly without commentary about what you're doing or going to do.`
        }
      ];
    }

    // Add user message to history
    conversationHistory[sessionId].push({ role: "user", content: message });

    // Determine which provider to use
    let provider;
    let modelId;
    let providerOptions = {};

    if (requestedProvider === 'anthropic' && process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your-anthropic-api-key-here') {
      // Use Anthropic Claude
      provider = anthropic;
      modelId = model || 'claude-3-5-sonnet-20240620';
      providerOptions = {
        anthropic: {
          cacheControl: { type: 'ephemeral' }
        }
      };
      console.log(`Using Anthropic Claude model: ${modelId}`);
    } else if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-openai-api-key-here') {
      // Use OpenAI
      provider = openai;
      modelId = model || 'gpt-4';
      console.log(`Using OpenAI model: ${modelId}`);
    } else {
      // If no API keys are configured, return a placeholder response
      const placeholderResponse = `You said: "${message}". I'm a simple echo bot for now. The AI integration will be implemented in a future update.`;
      conversationHistory[sessionId].push({ role: "assistant", content: placeholderResponse });
      return res.json({ response: placeholderResponse });
    }

    // Available tools
    const tools = [
        getCompanyInfo,
        listCustomers,
        createCustomer,
        findCustomerByName,
        listInvoices,
        findInvoiceById,
        findInvoicesByCustomer,
        createInvoice,
        updateInvoice,
        deleteInvoice,
        sendInvoiceEmail
    ];

    // Tool name map for easy lookup
    const toolMap = {
      "0": "getCompanyInfo",
      "1": "listCustomers",
      "2": "createCustomer", 
      "3": "findCustomerByName",
      "4": "listInvoices",
      "5": "findInvoiceById",
      "6": "findInvoicesByCustomer",
      "7": "createInvoice",
      "8": "updateInvoice",
      "9": "deleteInvoice",
      "10": "sendInvoiceEmail"
    };

    console.log("Generating AI response with tools");
    
    // Determine if it's a direct tool call request based on common patterns
    const isCustomerListRequest = message.toLowerCase().includes('list') && message.toLowerCase().includes('customer');
    const isInvoiceListRequest = message.toLowerCase().includes('list') && message.toLowerCase().includes('invoice');
    const isCompanyInfoRequest = message.toLowerCase().includes('company') && (message.toLowerCase().includes('info') || message.toLowerCase().includes('information'));
    
    let directToolCall = null;
    
    // For direct tool calls, execute them immediately
    if (isCustomerListRequest) {
      console.log("Direct customer list request detected, executing listCustomers tool");
      try {
        const result = await listCustomers.execute({});
        console.log("Direct listCustomers result:", result ? "Success" : "Failed");
        if (result) {
          directToolCall = {
            name: "listCustomers",
            result: result
          };
        }
      } catch (error) {
        console.error("Error executing direct customer list:", error);
      }
    } else if (isInvoiceListRequest) {
      const isPaidRequest = message.toLowerCase().includes('paid');
      const isUnpaidRequest = message.toLowerCase().includes('unpaid');
      let status = 'All';
      
      if (isPaidRequest) status = 'Paid';
      if (isUnpaidRequest) status = 'Unpaid';
      
      console.log(`Direct invoice list request detected with status: ${status}`);
      try {
        const result = await listInvoices.execute({ status });
        console.log("Direct listInvoices result:", result ? "Success" : "Failed");
        if (result) {
          directToolCall = {
            name: "listInvoices",
            result: result
          };
        }
      } catch (error) {
        console.error("Error executing direct invoice list:", error);
      }
    } else if (isCompanyInfoRequest) {
      console.log("Direct company info request detected");
      try {
        const result = await getCompanyInfo.execute({});
        console.log("Direct getCompanyInfo result:", result ? "Success" : "Failed");
        if (result) {
          directToolCall = {
            name: "getCompanyInfo",
            result: result
          };
        }
      } catch (error) {
        console.error("Error executing direct company info:", error);
      }
    }
    
    // Generate AI response with conversation history and tools
    const { text, toolCalls } = await generateText({
      model: provider(modelId),
      messages: conversationHistory[sessionId],
      tools: tools,
      providerOptions,
    });

    console.log("AI response generated");
    console.log("Text response:", text ? text.substring(0, 100) + "..." : "No text response");
    console.log("Tool calls:", toolCalls ? `${toolCalls.length} tool calls` : "none");

    // Process tool calls if any
    let finalResponse = text || "I'm processing your request...";
    
    // If we have a direct tool call result, use that instead of AI's toolCalls if they failed
    const effectiveToolCalls = (toolCalls && toolCalls.length > 0) ? toolCalls : (directToolCall ? [directToolCall] : []);
    
    if (effectiveToolCalls.length > 0) {
      try {
        console.log("Processing tool calls");
        
        // Get the last tool call
        const lastToolCall = effectiveToolCalls[effectiveToolCalls.length - 1];
        
        // Log the entire tool call for debugging
        console.log("Full tool call:", JSON.stringify({
          name: lastToolCall.name || lastToolCall.toolName,
          hasResult: !!lastToolCall.result,
          resultKeys: lastToolCall.result ? Object.keys(lastToolCall.result) : []
        }));
        
        // Get tool name from various possible formats
        let toolName = lastToolCall.name || lastToolCall.toolName || lastToolCall.function?.name;
        
        // Handle numeric tool indexes
        if (toolMap[toolName]) {
          toolName = toolMap[toolName];
        }
        
        console.log("Processing tool:", toolName);

        // Check if tool has a result
        if (lastToolCall.result) {
          // Log the full result for debugging
          console.log("Tool result detected:", JSON.stringify({
            hasData: !!lastToolCall.result.data,
            hasError: !!lastToolCall.result.error,
            dataType: lastToolCall.result.data ? (Array.isArray(lastToolCall.result.data) ? 'array' : 'object') : 'none',
            dataLength: lastToolCall.result.data && Array.isArray(lastToolCall.result.data) ? lastToolCall.result.data.length : 'n/a'
          }));
          
          // Process based on the specific tool
          if (toolName === "listCustomers" || toolName.includes("listCustomers")) {
            try {
              let customers = [];
              const result = lastToolCall.result;
              
              // Try to extract customer data
              if (result.data && Array.isArray(result.data)) {
                customers = result.data;
              } else if (result.QueryResponse && Array.isArray(result.QueryResponse.Customer)) {
                customers = result.QueryResponse.Customer;
              } else if (Array.isArray(result)) {
                customers = result;
              }
              
              // Use direct customer list if AI failed to extract
              if ((!customers || customers.length === 0) && directToolCall && directToolCall.name === "listCustomers" && directToolCall.result.data) {
                customers = directToolCall.result.data;
                console.log(`Using ${customers.length} customers from direct tool call`);
              }
              
          if (customers && customers.length > 0) {
                // Return in markdown table format
                finalResponse = `### Your Customers\n\n| # | Customer Name | Email | Phone |\n|---|--------------|-------|-------|\n`;
                
                customers.forEach((c, i) => {
                  const name = c.DisplayName || 'Unknown';
                  const email = c.PrimaryEmailAddr ? c.PrimaryEmailAddr.Address : '';
                  const phone = c.PrimaryPhone ? c.PrimaryPhone.FreeFormNumber : '';
                  finalResponse += `| ${i+1} | **${name}** | ${email} | ${phone} |\n`;
                });
              } else if (result.error) {
                finalResponse = `I encountered an issue: ${result.error}`;
          } else {
                finalResponse = "You don't have any customers in your QuickBooks account.";
          }
        } catch (error) {
          console.error("Error processing customer list:", error);
              
              // Try the direct tool call as a fallback
              if (directToolCall && directToolCall.name === "listCustomers" && directToolCall.result.data) {
                const customers = directToolCall.result.data;
                // Return in markdown table format
                finalResponse = `### Your Customers (from fallback)\n\n| # | Customer Name | Email | Phone |\n|---|--------------|-------|-------|\n`;
                
                customers.forEach((c, i) => {
                  const name = c.DisplayName || 'Unknown';
                  const email = c.PrimaryEmailAddr ? c.PrimaryEmailAddr.Address : '';
                  const phone = c.PrimaryPhone ? c.PrimaryPhone.FreeFormNumber : '';
                  finalResponse += `| ${i+1} | **${name}** | ${email} | ${phone} |\n`;
                });
              } else {
                finalResponse = "I encountered an error while processing your customer list. Please try again.";
              }
            }
          } 
          else if (toolName === "listInvoices" || toolName.includes("listInvoices")) {
            try {
              let invoices = [];
            const result = lastToolCall.result;
            
              // Try to extract invoice data
              if (result.data && Array.isArray(result.data)) {
                invoices = result.data;
              } else if (result.QueryResponse && Array.isArray(result.QueryResponse.Invoice)) {
                invoices = result.QueryResponse.Invoice;
              } else if (Array.isArray(result)) {
                invoices = result;
              }
              
              // Get filter status if provided
              let status = "All";
              if (lastToolCall.args && lastToolCall.args.status) {
                status = lastToolCall.args.status;
              } else if (typeof lastToolCall.args === 'string') {
                try {
                  const parsedArgs = JSON.parse(lastToolCall.args);
                  if (parsedArgs.status) {
                    status = parsedArgs.status;
                  }
                } catch (e) {}
              }
              
              // Use direct invoice list if AI failed to extract
              if ((!invoices || invoices.length === 0) && directToolCall && directToolCall.name === "listInvoices" && directToolCall.result.data) {
                invoices = directToolCall.result.data;
                console.log(`Using ${invoices.length} invoices from direct tool call`);
              }
              
              if (invoices && invoices.length > 0) {
                const statusLabel = status !== "All" ? status + " " : "";
                
                // Return in markdown table format
                finalResponse = `### Your ${statusLabel}Invoices\n\n| Invoice # | Customer | Amount | Status |\n|-----------|----------|--------|--------|\n`;
                
                invoices.forEach((inv) => {
                  const invoiceNum = inv.DocNumber || inv.Id;
                  const customer = inv.CustomerRef?.name || 'Unknown Customer';
                  const amount = inv.TotalAmt;
                  const isPaid = inv.Balance === 0 || inv.Balance <= 0;
                  const statusDisplay = isPaid ? '✅ Paid' : '❌ Unpaid';
                  
                  finalResponse += `| ${invoiceNum} | ${customer} | $${amount} | ${statusDisplay} |\n`;
                });
              } else if (result.error) {
                finalResponse = `I encountered an issue: ${result.error}`;
              } else {
                finalResponse = `You don't have any ${status !== "All" ? status + " " : ""}invoices in your QuickBooks account.`;
              }
            } catch (error) {
              console.error("Error processing invoice list:", error);
              
              // Try the direct tool call as a fallback
              if (directToolCall && directToolCall.name === "listInvoices" && directToolCall.result.data) {
                const invoices = directToolCall.result.data;
                const status = directToolCall.result.filterStatus || "All";
                const statusLabel = status !== "All" ? status + " " : "";
                
                // Return in markdown table format
                finalResponse = `### Your ${statusLabel}Invoices (from fallback)\n\n| Invoice # | Customer | Amount | Status |\n|-----------|----------|--------|--------|\n`;
                
                invoices.forEach((inv) => {
                  const invoiceNum = inv.DocNumber || inv.Id;
                  const customer = inv.CustomerRef?.name || 'Unknown Customer';
                  const amount = inv.TotalAmt;
                  const isPaid = inv.Balance === 0 || inv.Balance <= 0;
                  const statusDisplay = isPaid ? '✅ Paid' : '❌ Unpaid';
                  
                  finalResponse += `| ${invoiceNum} | ${customer} | $${amount} | ${statusDisplay} |\n`;
                });
                } else {
                finalResponse = "I encountered an error while processing your invoice list. Please try again.";
              }
            }
          }
          else if (toolName === "getCompanyInfo" || toolName.includes("getCompanyInfo")) {
            try {
              const result = lastToolCall.result;
              const companyInfo = result.data || result;
              
              // Use direct company info if AI failed to extract
              if ((!companyInfo || Object.keys(companyInfo).length === 0) && directToolCall && directToolCall.name === "getCompanyInfo" && directToolCall.result.data) {
                companyInfo = directToolCall.result.data;
                console.log("Using company info from direct tool call");
              }
              
              if (companyInfo && Object.keys(companyInfo).length > 0) {
                // Using markdown format for company info
                finalResponse = `### Your Company Information\n\n`;
                finalResponse += `**Company Name:** ${companyInfo.CompanyName || 'Unknown'}\n\n`;
                
                finalResponse += `#### Contact Details\n\n`;
                
                if (companyInfo.CompanyAddr) {
                  const addr = companyInfo.CompanyAddr;
                  finalResponse += `**Address:** ${addr.Line1 || ''}, ${addr.City || ''}, ${addr.CountrySubDivisionCode || ''} ${addr.PostalCode || ''}\n\n`;
                }
                
                if (companyInfo.PrimaryPhone) {
                  finalResponse += `**Phone:** ${companyInfo.PrimaryPhone.FreeFormNumber}\n\n`;
                }
                
                if (companyInfo.PrimaryEmailAddr) {
                  finalResponse += `**Email:** ${companyInfo.PrimaryEmailAddr.Address}\n\n`;
                }
                
                if (companyInfo.LegalName || companyInfo.Industry) {
                  finalResponse += `#### Business Details\n\n`;
                  
                  if (companyInfo.LegalName) {
                    finalResponse += `**Legal Name:** ${companyInfo.LegalName}\n\n`;
                  }
                  
                  if (companyInfo.Industry) {
                    finalResponse += `**Industry:** ${companyInfo.Industry}\n\n`;
                  }
                }
            } else if (result.error) {
              finalResponse = `I encountered an issue: ${result.error}`;
            } else {
                finalResponse = "I couldn't retrieve your company information.";
            }
          } catch (error) {
              console.error("Error processing company info:", error);
              
              // Try the direct tool call as a fallback
              if (directToolCall && directToolCall.name === "getCompanyInfo" && directToolCall.result.data) {
                const companyInfo = directToolCall.result.data;
                
                // Using markdown format for company info
                finalResponse = `### Your Company Information\n\n`;
                finalResponse += `**Company Name:** ${companyInfo.CompanyName || 'Unknown'}\n\n`;
                
                finalResponse += `#### Contact Details\n\n`;
                
                if (companyInfo.CompanyAddr) {
                  const addr = companyInfo.CompanyAddr;
                  finalResponse += `**Address:** ${addr.Line1 || ''}, ${addr.City || ''}, ${addr.CountrySubDivisionCode || ''} ${addr.PostalCode || ''}\n\n`;
                }
                
                if (companyInfo.PrimaryPhone) {
                  finalResponse += `**Phone:** ${companyInfo.PrimaryPhone.FreeFormNumber}\n\n`;
                }
                
                if (companyInfo.PrimaryEmailAddr) {
                  finalResponse += `**Email:** ${companyInfo.PrimaryEmailAddr.Address}\n\n`;
                }
              } else {
                finalResponse = "I encountered an error while retrieving your company information.";
              }
            }
          }
          else if (lastToolCall.result.error) {
            finalResponse = `I encountered an issue: ${lastToolCall.result.error}`;
          }
          else {
            // For other tools, use a generic approach to display the result
            try {
              if (lastToolCall.result.data) {
                finalResponse = `Here's what I found: ${JSON.stringify(lastToolCall.result.data, null, 2)}`;
              } else {
                finalResponse = `Result: ${JSON.stringify(lastToolCall.result, null, 2)}`;
              }
            } catch (error) {
              console.error("Error formatting result:", error);
              finalResponse = "I found some information but had trouble formatting it properly.";
            }
          }
        } else if (directToolCall && directToolCall.result) {
          // If AI tool call had no result, but we have a direct tool call with result
          console.log("No result in AI tool call, using direct tool call result");
          
          if (directToolCall.name === "listCustomers" && directToolCall.result.data) {
            const customers = directToolCall.result.data;
            // Return in markdown table format
            finalResponse = `### Your Customers\n\n| # | Customer Name | Email | Phone |\n|---|--------------|-------|-------|\n`;
            
            customers.forEach((c, i) => {
              const name = c.DisplayName || 'Unknown';
              const email = c.PrimaryEmailAddr ? c.PrimaryEmailAddr.Address : '';
              const phone = c.PrimaryPhone ? c.PrimaryPhone.FreeFormNumber : '';
              finalResponse += `| ${i+1} | **${name}** | ${email} | ${phone} |\n`;
            });
          } else if (directToolCall.name === "listInvoices" && directToolCall.result.data) {
            const invoices = directToolCall.result.data;
            const status = directToolCall.result.filterStatus || "All";
            const statusLabel = status !== "All" ? status + " " : "";
            
            // Return in markdown table format
            finalResponse = `### Your ${statusLabel}Invoices\n\n| Invoice # | Customer | Amount | Status |\n|-----------|----------|--------|--------|\n`;
            
            invoices.forEach((inv) => {
              const invoiceNum = inv.DocNumber || inv.Id;
              const customer = inv.CustomerRef?.name || 'Unknown Customer';
              const amount = inv.TotalAmt;
              const isPaid = inv.Balance === 0 || inv.Balance <= 0;
              const statusDisplay = isPaid ? '✅ Paid' : '❌ Unpaid';
              
              finalResponse += `| ${invoiceNum} | ${customer} | $${amount} | ${statusDisplay} |\n`;
            });
          } else if (directToolCall.name === "getCompanyInfo" && directToolCall.result.data) {
            const companyInfo = directToolCall.result.data;
            
            // Using markdown format for company info
            finalResponse = `### Your Company Information\n\n`;
            finalResponse += `**Company Name:** ${companyInfo.CompanyName || 'Unknown'}\n\n`;
            
            finalResponse += `#### Contact Details\n\n`;
            
            if (companyInfo.CompanyAddr) {
              const addr = companyInfo.CompanyAddr;
              finalResponse += `**Address:** ${addr.Line1 || ''}, ${addr.City || ''}, ${addr.CountrySubDivisionCode || ''} ${addr.PostalCode || ''}\n\n`;
            }
            
            if (companyInfo.PrimaryPhone) {
              finalResponse += `**Phone:** ${companyInfo.PrimaryPhone.FreeFormNumber}\n\n`;
            }
            
            if (companyInfo.PrimaryEmailAddr) {
              finalResponse += `**Email:** ${companyInfo.PrimaryEmailAddr.Address}\n\n`;
            }
          } else {
            finalResponse = "I tried to process your request but couldn't format the result properly. Please try again.";
          }
        } else {
          console.log("No result available from any tool call");
          finalResponse = "I tried to process your request but didn't receive any data back. Please try again.";
        }
      } catch (error) {
        console.error("Error processing tool calls:", error);
        finalResponse = "I encountered an error while processing your request.";
      }
    } else if (!text || text.trim() === '') {
      finalResponse = "I'm not sure how to respond to that. Could you please try rephrasing your question?";
    }
    
    // Add AI response to history
    conversationHistory[sessionId].push({ role: "assistant", content: finalResponse });

    // Limit history size to prevent it from growing too large
    if (conversationHistory[sessionId].length > 20) {
      // Keep system message and last 19 messages
      conversationHistory[sessionId] = [
        conversationHistory[sessionId][0],
        ...conversationHistory[sessionId].slice(-19)
      ];
    }

    // Prepare response with additional metadata
    const response = {
      response: finalResponse,
      provider: requestedProvider,
      model: modelId
    };

    // Add provider metadata if available
    if (providerOptions) {
      response.providerMetadata = providerOptions;
    }

    // Return the AI response with metadata
    res.json(response);
  } catch (error) {
    console.error("AI Chat Error:", error);
    res.status(500).json({ error: error.message });
  }
});


// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`QuickBooks OAuth redirect URI: ${process.env.QB_REDIRECT_URI}`);
  console.log(`OpenAI API Key configured: ${process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-openai-api-key-here' ? 'Yes' : 'No'}`);
  console.log(`Anthropic API Key configured: ${process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your-anthropic-api-key-here' ? 'Yes' : 'No'}`);
  console.log(`Default AI provider: ${process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your-anthropic-api-key-here' ? 'Anthropic Claude' : 'OpenAI'}`);
});
