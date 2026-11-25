/**
 * Required fields of a contract (contractor record) and of a contractor bill.
 * Used by the contract forms in the browser AND by the server when contracts are saved,
 * so an incomplete contract cannot be stored through a direct API request either.
 * Returns field -> message for every problem (empty object = valid).
 */

export const CONTRACT_BILLING_STATUSES = ['Submitted', 'Verified', 'Approved', 'Under Audit', 'Query Raised', 'Payment Processing'] as const;
export const CONTRACT_BILL_STATUSES = ['Approved', 'Paid', 'Pending Review', 'Disputed'] as const;

export type ContractErrors = Partial<
  Record<
    | 'firmName'
    | 'category'
    | 'projectId'
    | 'contactPerson'
    | 'phone'
    | 'email'
    | 'totalEstimatedBilling'
    | 'pastBilling'
    | 'currentBilling'
    | 'currentBillingStatus'
    | 'statusReason'
    | 'pastBills',
    string
  >
>;
export type BillErrors = Partial<Record<'billNumber' | 'date' | 'amount' | 'status', string>>;

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const isNum = (v: unknown) => typeof v === 'number' ? Number.isFinite(v) : v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));

export const isValidContractEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
/** Indian / international phone: 10-13 digits, optional +, spaces or dashes */
export const isValidContractPhone = (s: string) => /^\+?[\d\s-]{10,18}$/.test(s) && s.replace(/\D/g, '').length >= 10 && s.replace(/\D/g, '').length <= 13;

export function validateContractBill(b: any): BillErrors {
  const e: BillErrors = {};
  if (!text(b?.billNumber)) e.billNumber = 'Bill number is required.';
  else if (text(b.billNumber).length > 60) e.billNumber = 'Bill number is too long (max 60 characters).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(b?.date)) || Number.isNaN(Date.parse(text(b?.date)))) e.date = 'Billing date is required.';
  if (!isNum(b?.amount) || Number(b.amount) <= 0) e.amount = 'Enter the bill amount (more than 0).';
  if (!(CONTRACT_BILL_STATUSES as readonly string[]).includes(b?.status)) e.status = 'Choose the bill status.';
  return e;
}

export function validateContract(c: any): ContractErrors {
  const e: ContractErrors = {};
  if (!text(c?.firmName)) e.firmName = 'Firm name is required.';
  else if (text(c.firmName).length > 150) e.firmName = 'Firm name is too long (max 150 characters).';
  if (!text(c?.category)) e.category = 'Category is required.';
  if (!text(c?.projectId)) e.projectId = 'Choose the site / project.';
  if (!text(c?.contactPerson)) e.contactPerson = 'Contact person is required.';
  if (!text(c?.phone)) e.phone = 'Phone number is required.';
  else if (!isValidContractPhone(text(c.phone))) e.phone = 'Enter a valid phone number (10-13 digits).';
  if (!text(c?.email)) e.email = 'Email address is required.';
  else if (!isValidContractEmail(text(c.email))) e.email = 'Enter a valid email address.';
  if (!isNum(c?.totalEstimatedBilling) || Number(c.totalEstimatedBilling) <= 0) e.totalEstimatedBilling = 'Enter the total estimated budget (more than 0).';
  if (!isNum(c?.pastBilling) || Number(c.pastBilling) < 0) e.pastBilling = 'Enter the past billing (0 or more).';
  if (!isNum(c?.currentBilling) || Number(c.currentBilling) < 0) e.currentBilling = 'Enter the current bill amount (0 or more).';
  if (!(CONTRACT_BILLING_STATUSES as readonly string[]).includes(c?.currentBillingStatus)) e.currentBillingStatus = 'Choose the billing status.';
  if (!text(c?.statusReason)) e.statusReason = 'Reason / remarks are required.';
  if (!Array.isArray(c?.pastBills)) e.pastBills = 'Billing history is missing.';
  else if (c.pastBills.some((b: any) => Object.keys(validateContractBill(b)).length > 0)) e.pastBills = 'A bill in the billing history is incomplete.';
  return e;
}

export const firstError = (errors: Record<string, string | undefined>) => Object.values(errors).find(Boolean) || '';
