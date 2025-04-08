import { z } from 'zod';
import { tool } from 'ai';

// Schema definitions for reuse
const addressSchema = z.object({
  Line1: z.string().optional(),
  City: z.string().optional(),
  CountrySubDivisionCode: z.string().optional(),
  PostalCode: z.string().optional()
}).optional();

const emailSchema = z.object({
  Address: z.string().email()
}).optional();

const phoneSchema = z.object({
  FreeFormNumber: z.string()
}).optional();

const lineItemSchema = z.object({
  Amount: z.number(),
  Description: z.string(),
  DetailType: z.string(),
  SalesItemLineDetail: z.object({
    ItemRef: z.object({
      value: z.string(),
      name: z.string()
    })
  })
});

// --------------------------------
// Company Information Tools
// --------------------------------

export const getCompanyInfo = tool({
  description: 'Retrieve QuickBooks company information.',
  parameters: z.object({}),
  execute: async () => {
    try {
      const response = await fetch('http://localhost:3000/api/company');
      const data = await response.json();
      
      if (data.error) {
        return {
          error: data.error
        };
      }
      
      return {
        data: data
      };
    } catch (error) {
      return {
        error: 'Failed to retrieve company information'
      };
    }
  },
});

// --------------------------------
// Customer Tools
// --------------------------------

export const listCustomers = tool({
  description: 'List all customers from QuickBooks.',
  parameters: z.object({}),
  execute: async () => {
    try {
      console.log('listCustomers tool called');
      const response = await fetch('http://localhost:3000/api/customers');
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error fetching customers:', errorData);
        return { error: errorData.error || 'Failed to retrieve customers' };
      }
      
      const data = await response.json();
      
      if (data.error) {
        console.error('Error in customer data:', data.error);
        return { error: data.error };
      }

      // Extract just the Customer array from QueryResponse
      const customers = data.QueryResponse?.Customer || [];
      
      console.log(`Got ${customers.length} customers from QuickBooks API`);
      
      // If no customers, return an informative message instead of an empty array
      if (customers.length === 0) {
        return {
          data: [],
          message: "No customers found in your QuickBooks account.",
          count: 0
        };
      }
      
      // Log a sample of the data to help with debugging
      if (customers.length > 0) {
        console.log('Sample customer data:', JSON.stringify(customers[0].DisplayName));
      }
      
      return {
        data: customers,
        count: customers.length,
        success: true
      };
    } catch (error) {
      console.error('Error in listCustomers tool:', error);
      return {
        error: 'Failed to retrieve customers: ' + error.message,
        success: false
      };
    }
  },
});

// --------------------------------
// Invoice Tools
// --------------------------------

// Tool to list invoices
export const listInvoices = tool({
  description: 'List all invoices from QuickBooks.',
  parameters: z.object({
    status: z.enum(['All', 'Paid', 'Unpaid']).optional().describe('Filter invoices by payment status')
  }),
  execute: async ({ status }) => {
    try {
      console.log(`listInvoices tool called with status: ${status || 'All'}`);
      const response = await fetch('http://localhost:3000/api/invoices');
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error fetching invoices:', errorData);
        return { error: errorData.error || 'Failed to retrieve invoices' };
      }
      
      const data = await response.json();
      
      if (data.error) {
        console.error('Error in invoice data:', data.error);
        return { error: data.error };
      }

      let invoices = data.QueryResponse?.Invoice || [];
      
      console.log(`Got ${invoices.length} invoices from QuickBooks API`);
      
      // Filter invoices if status is specified
      if (status && status !== 'All') {
        const originalCount = invoices.length;
        invoices = invoices.filter(invoice => {
          const isPaid = invoice.Balance === 0;
          return status === 'Paid' ? isPaid : !isPaid;
        });
        console.log(`Filtered from ${originalCount} to ${invoices.length} ${status} invoices`);
      }
      
      return { 
        data: invoices,
        filtered: status !== 'All',
        filterStatus: status || 'All',
        count: invoices.length
      };
    } catch (error) {
      console.error('Error in listInvoices tool:', error);
      return { error: 'Failed to retrieve invoices: ' + error.message };
    }
  },
});

// Tool to find invoice by ID
export const findInvoiceById = tool({
  description: 'Find a specific invoice by its ID.',
  parameters: z.object({
    id: z.string().describe('The ID of the invoice to find')
  }),
  execute: async ({ id }) => {
    try {
      const response = await fetch('http://localhost:3000/api/invoices');
      const data = await response.json();
      
      if (data.error) {
        return { error: data.error };
      }

      const invoices = data.QueryResponse?.Invoice || [];
      const invoice = invoices.find(inv => inv.Id === id);
      
      if (!invoice) {
        return { error: `No invoice found with ID: ${id}` };
      }
      
      return { data: invoice };
    } catch (error) {
      return { error: 'Failed to find invoice' };
    }
  },
});

// Tool to find invoices by customer
export const findInvoicesByCustomer = tool({
  description: 'Find all invoices for a specific customer.',
  parameters: z.object({
    customerName: z.string().describe('Name of the customer to find invoices for')
  }),
  execute: async ({ customerName }) => {
    try {
      // First find the customer
      const customerResponse = await fetch('http://localhost:3000/api/customers');
      const customerData = await customerResponse.json();
      
      if (customerData.error) {
        return { error: customerData.error };
      }

      const customers = customerData.QueryResponse?.Customer || [];
      const customer = customers.find(c => 
        c.DisplayName.toLowerCase().includes(customerName.toLowerCase()) ||
        (c.GivenName && c.GivenName.toLowerCase().includes(customerName.toLowerCase())) ||
        (c.FamilyName && c.FamilyName.toLowerCase().includes(customerName.toLowerCase()))
      );

      if (!customer) {
        return { error: `No customer found with name: ${customerName}` };
      }

      // Then find their invoices
      const invoiceResponse = await fetch('http://localhost:3000/api/invoices');
      const invoiceData = await invoiceResponse.json();
      
      if (invoiceData.error) {
        return { error: invoiceData.error };
      }

      const invoices = invoiceData.QueryResponse?.Invoice || [];
      const customerInvoices = invoices.filter(inv => inv.CustomerRef.value === customer.Id);
      
      return { 
        data: {
          customer: {
            Id: customer.Id,
            DisplayName: customer.DisplayName
          },
          invoices: customerInvoices
        }
      };
    } catch (error) {
      return { error: 'Failed to find customer invoices' };
    }
  },
});

// Tool to create an invoice
export const createInvoice = tool({
  description: 'Create a new invoice in QuickBooks.',
  parameters: z.object({
    customerName: z.string().describe('Name of the customer to create invoice for'),
    items: z.array(z.object({
      description: z.string(),
      amount: z.number(),
      itemId: z.string(),
      itemName: z.string()
    })).min(1),
    dueDate: z.string().optional().describe('Due date for the invoice (YYYY-MM-DD)'),
    memo: z.string().optional().describe('Memo or note to add to the invoice')
  }),
  execute: async ({ customerName, items, dueDate, memo }) => {
    try {
      // First find the customer
      const customerResponse = await fetch('http://localhost:3000/api/customers');
      const customerData = await customerResponse.json();
      
      if (customerData.error) {
        return { error: customerData.error };
      }

      const customers = customerData.QueryResponse?.Customer || [];
      const customer = customers.find(c => 
        c.DisplayName.toLowerCase().includes(customerName.toLowerCase())
      );

      if (!customer) {
        return { error: `No customer found with name: ${customerName}` };
      }

      // Prepare invoice data
      const invoiceData = {
        CustomerRef: {
          value: customer.Id
        },
        DueDate: dueDate,
        Line: items.map(item => ({
          Amount: item.amount,
          Description: item.description,
          DetailType: "SalesItemLineDetail",
          SalesItemLineDetail: {
            ItemRef: {
              value: item.itemId,
              name: item.itemName
            }
          }
        })),
        Memo: memo
      };

      // Create the invoice
      const response = await fetch('http://localhost:3000/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoiceData),
      });
      
      const data = await response.json();
      
      if (data.error) {
        return { error: data.error };
      }
      
      return { data: data };
    } catch (error) {
      return { error: 'Failed to create invoice' };
    }
  },
});

// Tool to update an invoice
export const updateInvoice = tool({
  description: 'Update an existing invoice in QuickBooks.',
  parameters: z.object({
    id: z.string().describe('ID of the invoice to update'),
    updates: z.object({
      dueDate: z.string().optional(),
      memo: z.string().optional(),
      items: z.array(lineItemSchema).optional()
    }).describe('Fields to update on the invoice')
  }),
  execute: async ({ id, updates }) => {
    try {
      // First get the existing invoice
      const getResponse = await fetch(`http://localhost:3000/api/invoices/${id}`);
      const existingInvoice = await getResponse.json();
      
      if (existingInvoice.error) {
        return { error: existingInvoice.error };
      }

      // Prepare update data
      const updateData = {
        ...existingInvoice,
        ...updates,
        Id: id,
        SyncToken: existingInvoice.SyncToken
      };

      // Update the invoice
      const response = await fetch(`http://localhost:3000/api/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      
      const data = await response.json();
      
      if (data.error) {
        return { error: data.error };
      }
      
      return { data: data };
    } catch (error) {
      return { error: 'Failed to update invoice' };
    }
  },
});

// Tool to delete/void an invoice
export const deleteInvoice = tool({
  description: 'Delete (void) an invoice in QuickBooks.',
  parameters: z.object({
    id: z.string().describe('ID of the invoice to delete/void')
  }),
  execute: async ({ id }) => {
    try {
      const response = await fetch(`http://localhost:3000/api/invoices/${id}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.error) {
        return { error: data.error };
      }
      
      return { data: { message: `Invoice ${id} has been voided successfully` } };
    } catch (error) {
      return { error: 'Failed to delete/void invoice' };
    }
  },
});

// Tool to send an invoice via email
export const sendInvoiceEmail = tool({
  description: 'Send an invoice to a customer via email.',
  parameters: z.object({
    id: z.string().describe('ID of the invoice to send'),
    email: z.string().email().optional().describe('Optional email address to override customer\'s email')
  }),
  execute: async ({ id, email }) => {
    try {
      const response = await fetch(`http://localhost:3000/api/invoices/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      
      const data = await response.json();
      
      if (data.error) {
        return { error: data.error };
      }
      
      return { data: { message: `Invoice ${id} has been sent successfully` } };
    } catch (error) {
      return { error: 'Failed to send invoice' };
    }
  },
});

// Tool to find customer by name
export const findCustomerByName = tool({
  description: 'Find a customer by their Name.',
  parameters: z.object({
    name: z.string().describe('Name of the customer to search for')
  }),
  execute: async ({ name }) => {
    try {
      const response = await fetch('http://localhost:3000/api/customers');
      const data = await response.json();
      
      if (data.error) {
        return {
          error: data.error
        };
      }

      const customers = data.QueryResponse?.Customer || [];
      const customer = customers.find(c => 
        c.DisplayName.toLowerCase().includes(name.toLowerCase()) ||
        (c.GivenName && c.GivenName.toLowerCase().includes(name.toLowerCase())) ||
        (c.FamilyName && c.FamilyName.toLowerCase().includes(name.toLowerCase()))
      );

      if (!customer) {
        return {
          error: `No customer found with name: ${name}`
        };
      }

      return {
        data: customer
      };
    } catch (error) {
      return {
        error: 'Failed to search for customer'
      };
    }
  },
});

// Tool to create a customer
export const createCustomer = tool({
  description: 'Create a new customer in QuickBooks.',
  parameters: z.object({
    DisplayName: z.string(),
    CompanyName: z.string().optional(),
    GivenName: z.string().optional(),
    FamilyName: z.string().optional(),
    PrimaryEmailAddr: z.object({ Address: z.string() }).optional(),
    PrimaryPhone: z.object({ FreeFormNumber: z.string() }).optional(),
  }),
  execute: async (args) => {
    try {
      const response = await fetch('http://localhost:3000/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      const data = await response.json();
      
      if (data.error) {
        return {
          error: data.error
        };
      }
      
      return {
        data: data
      };
    } catch (error) {
      return {
        error: 'Failed to create customer'
      };
    }
  },
});
