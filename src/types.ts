export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  /**
   * admin = purchase team (orders go out without approval, and they approve everyone else's);
   * site_manager = one project; department = staff of a department (HR, Sales, IT, Accounts) who raise purchase requests.
   * Orders raised by site managers and department staff need an admin's approval.
   */
  role: 'admin' | 'site_manager' | 'department';
  /** Department of a 'department' user, e.g. "HR" */
  department?: string;
  phone?: string;
  title?: string; // e.g. "Lead Site Engineer", "Senior Project Manager"
  assignedProjectId?: string;
}

export interface Project {
  id: string;
  name: string;
  location: string;
  manager: string; // Manager display name
  managerId?: string; // Linked User ID
  managerEmail?: string; // Manager Email credential
  managerPassword?: string; // Manager Password credential
  startDate: string;
  status: 'planning' | 'ongoing' | 'completed' | 'on_hold';
  createdByAdminId?: string;
}

export type MaterialCategory = 'Structural' | 'Finishing' | 'Masonry' | 'Plumbing' | 'Electrical' | 'Others' | string;

export type BillType = 'GST' | 'URD';

export interface RateHistoryPoint {
  id?: string;
  date: string; // YYYY-MM-DD
  rate: number;
  quantity?: number;
  totalPrice?: number;
  vendorName?: string;
  notes?: string;
  billType?: BillType;
  billNumber?: string;
  gstRate?: number;
  gstAmount?: number;
  baseAmount?: number;
  vendorGstin?: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

export interface Material {
  id: string;
  projectId: string; // The project this stock belongs to
  name: string;
  category: MaterialCategory;
  unit: string; // e.g., "Brass", "Bags", "Tons", "Pieces", "Liters"
  currentStock: number;
  minThreshold: number; // For low stock alert
  unitCost: number; // Rate per unit in Local Currency (Rs)
  totalPrice?: number; // Total price = quantity * rate
  vendorName?: string; // Vendor / Supplier name
  rateHistory?: RateHistoryPoint[];
  materialCode?: string; // Grouping code e.g. "001", "002"
  materialGroup?: string; // Group name e.g. "Cement & Binding", "Steel"
  billType?: BillType; // 'GST' or 'URD'
  billNumber?: string; // Invoice / Bill / Voucher #
  gstRate?: number; // GST Rate percentage (e.g. 5, 12, 18, 28, or 0)
  gstAmount?: number; // Tax portion
  baseAmount?: number; // Pre-tax taxable base
  vendorGstin?: string;
  /** The opening-stock bill of this material was deleted from the GST & URD register */
  baseBillRemoved?: boolean;
}

export interface InventoryTransaction {
  id: string;
  projectId: string;
  materialId: string;
  type: 'addition' | 'consumption';
  quantity: number;
  rate?: number;
  totalPrice?: number;
  vendorName?: string;
  invoiceUrl?: string;
  invoiceFileName?: string;
  date: string; // YYYY-MM-DD
  notes: string;
  operator: string; // Person who performed the action
  billType?: BillType;
  billNumber?: string;
  gstRate?: number;
  gstAmount?: number;
  baseAmount?: number;
  vendorGstin?: string;
  /** Inspection done when the material was received (stock added = accepted quantity) */
  verification?: MaterialVerification;
}

/** Quality grade given when material is inspected on receipt */
export type QualityGrade = 'Good' | 'Acceptable' | 'Poor';

/** Material verification / GRN inspection recorded when stock is received */
export interface MaterialVerification {
  grnNumber?: string; // assigned by the server for deliveries against a PO
  receivedQty: number; // quantity delivered by the vendor
  acceptedQty: number; // quantity accepted into stock
  rejectedQty: number; // quantity rejected (returned to the vendor)
  rejectionReason?: string;
  quality: QualityGrade;
  checks: {
    specificationMatches: boolean; // matches the PO / requirement specification
    quantityVerified: boolean; // counted / weighed
    noDamage: boolean; // packaging and material undamaged
    documentsReceived: boolean; // delivery challan / test certificate received
  };
  inspectedBy: string;
  remarks?: string;
}

export interface QueryEmailLog {
  id: string;
  type: 'New Query' | 'Query Reply' | 'Status Update';
  fromName: string;
  fromRole: string;
  toEmail: string;
  subject: string;
  body: string;
  sentAt: string;
}

export interface QueryResponse {
  id: string;
  authorUserId: string;
  authorName: string;
  authorRole: 'admin' | 'site_manager';
  message: string;
  createdAt: string;
  dispatchedToEmail?: string;
}

export interface SiteQuery {
  id: string;
  projectId: string;
  projectName: string;
  materialId?: string;
  materialName?: string;
  raisedByUserId: string;
  raisedByName: string;
  authorEmail?: string;
  targetEmail?: string;
  subject: string;
  category: 'Stock Deficit' | 'Quality Issue' | 'Delivery Delay' | 'Budget Approval' | 'General Query';
  urgency: 'Low' | 'Medium' | 'High' | 'Urgent';
  description: string;
  photoProofUrl?: string; // Compulsory uploaded photo evidence
  status: 'Open' | 'In Progress' | 'Resolved';
  createdAt: string;
  responses: QueryResponse[];
  emailLog?: QueryEmailLog[];
}

export interface ContractorBill {
  id: string;
  billNumber: string;
  date: string;
  amount: number;
  status: 'Approved' | 'Paid' | 'Pending Review' | 'Disputed';
  invoiceUrl?: string;
  invoiceFileName?: string;
  notes?: string;
}

export type ContractorCategory = 'Civil & Concrete' | 'Electrical Works' | 'Plumbing & Sanitation' | 'Steel & Structural' | 'Interior & Finishing' | 'HVAC & Firefighting' | 'Earthworks' | 'Others' | string;

export interface ContractorRecord {
  id: string;
  firmName: string;
  category: ContractorCategory;
  projectId: string;
  projectName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  pastBilling: number;
  currentBilling: number;
  totalEstimatedBilling: number;
  currentBillingStatus: 'Submitted' | 'Verified' | 'Approved' | 'Under Audit' | 'Query Raised' | 'Payment Processing';
  statusReason?: string;
  pastBills: ContractorBill[];
  createdAt: string;
}

export interface InternalTransferRecord {
  id: string;
  materialId?: string;
  materialName: string;
  category: string;
  outwardProjectId: string;
  outwardProjectName: string;
  inwardProjectId: string;
  inwardProjectName: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number; // quantity * rate
  status: 'Dispatched' | 'In Transit' | 'Received & Verified' | 'Rejected / Issue';
  transferDate: string;
  photoUrl?: string;
  photoFileName?: string;
  vehicleNumber?: string;
  driverName?: string;
  notes?: string;
  createdAt: string;
}

// -------------------------------------------------------------
// Vendor Enquiry & Quote Comparison Interfaces (PRD Requirements)
// -------------------------------------------------------------

export interface Vendor {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  gstin: string;
  rating: number; // 0.0 - 5.0
  suppliedMaterialCodes: string[]; // e.g. ['001', '002', '003']
  standardCreditPeriod: string; // e.g. "30 Days", "45 Days", "15 Days", "Advance"
  avgLeadDays: number; // e.g. 2
  status: 'Approved' | 'Verified' | 'Preferred' | 'Under Review';
  /** Items / categories the vendor supplies beyond the material codes (e.g. "Office furniture"), used for AI matching */
  suppliedItems?: string[];
  website?: string;
  /** How the vendor was added, e.g. "Nearby search (AI)" */
  source?: string;
}

/** Existing vendor that the AI thinks can supply an item */
export interface VendorMatch {
  vendorId: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/** Supplier near the delivery location found by the AI web search (not yet a registered vendor) */
export interface NearbySupplier {
  name: string;
  address: string;
  distanceKm?: number;
  phone?: string;
  email?: string;
  website?: string;
  reason?: string;
}

export interface MarketPriceBenchmark {
  materialCode: string; // e.g. "001"
  materialName: string; // e.g. "Cement (OPC 53 Grade)"
  category: string;
  unit: string;
  currentMarketPrice: number; // Rs per unit
  minMarketPrice: number;
  maxMarketPrice: number;
  lastUpdated: string;
  source: string;
  trend: 'stable' | 'up' | 'down';
  weeklyChangePct: number;
  sourceUrl?: string; // Direct online reference link
  sources?: { title: string; url: string }[]; // Additional grounding sources
  percentVsLastBuy?: number; // % comparison to last purchase rate
  lastBuyPrice?: number; // Previous recorded purchase cost
  isAiFetched?: boolean; // Flag indicating fetched live via Gemini online search
  fetchedAt?: string;
  summary?: string;
}

export type FuturePeriodKey = 'current' | '1m' | '3m' | '6m' | '1y' | '2y' | '3y';

export interface FutureRatePredictionPoint {
  periodKey: FuturePeriodKey;
  periodLabel: string; // e.g. "Current (Today)", "After 1 Month", "After 3 Months", "After 6 Months", "After 1 Year", "After 2 Years", "After 3 Years"
  targetDate: string; // e.g. "Oct 2026", "Nov 2026", "Jan 2027", "Apr 2027", "Oct 2027", "Oct 2028", "Oct 2029"
  predictedRate: number; // in INR
  minRate: number;
  maxRate: number;
  percentChangeVsCurrent: number; // % delta vs today's rate
  trend: 'up' | 'down' | 'stable';
  keyDrivers: string; // Market catalyst / inflation / demand factor
}

export interface FutureRatePredictionResult {
  materialName: string;
  category: string;
  unit: string;
  currentRate: number;
  asOfDate: string;
  forecastConfidence: 'High' | 'Medium' | 'Low' | 'Moderate' | 'Provisional';
  macroSummary: string;
  predictions: FutureRatePredictionPoint[];
  sources: { title: string; url: string }[];
  /** 'web' = from live market research (Gemini + Google Search); 'trend' = projected from the material's own trend */
  basis?: 'web' | 'trend';
  growthNext12MonthsPct?: number;
  growthLongTermPctPerYear?: number;
  marketRateToday?: number;
}

export type PRStatus =
  | 'Awaiting Admin Approval' // raised by a site manager / department: no RFQ is sent until an admin approves it
  | 'Request Rejected'
  | 'Draft'
  | 'Enquiry Sent'
  | 'Quotes Received'
  | 'Under Comparison'
  | 'Shortlisted'
  | 'Pending Approval' // vendor selected by a site manager: waiting for an admin
  | 'Awarded'
  | 'Closed';

/** Admin approval of a purchase request raised by a site manager or department (before any RFQ is sent) */
export interface PRRequestApproval {
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedBy: string;
  requestedById: string;
  requestedByRole: User['role'];
  department?: string;
  requestedAt: string; // ISO
  decidedBy?: string;
  decidedAt?: string; // ISO
  comment?: string; // reason (required on rejection)
}

/** Approval of the selected vendor by an admin (needed when a non-admin selects the vendor; admins' own awards are approved automatically) */
export interface PRApproval {
  status: 'Pending' | 'Approved' | 'Rejected';
  vendorId: string;
  vendorName: string;
  quoteId: string;
  amount: number; // total price of the selected quotation (Rs.)
  unitRate: number;
  requestedBy: string;
  requestedAt: string; // ISO
  note?: string; // why this vendor was selected
  decidedBy?: string;
  decidedAt?: string; // ISO
  comment?: string; // admin's comment (required on rejection)
  history: { action: 'requested' | 'approved' | 'rejected'; by: string; at: string; vendorName: string; amount: number; comment?: string }[];
}

/** One step of a price negotiation on a quotation */
export interface NegotiationRound {
  by: 'buyer' | 'vendor';
  action: 'offer' | 'accept' | 'counter' | 'reject' | 'revise';
  rate: number; // Rs. per unit (excl. GST)
  note?: string;
  byName?: string;
  at: string; // ISO
}

/**
 * Negotiation on a vendor quotation.
 * Offered = buyer's counter-offer is waiting for the vendor; Countered = vendor replied with a new rate;
 * Accepted = vendor accepted the buyer's rate; Rejected = vendor kept the quoted rate.
 */
export interface QuoteNegotiation {
  status: 'Offered' | 'Countered' | 'Accepted' | 'Rejected';
  originalRate: number; // vendor's first quoted rate
  originalTotal: number;
  targetRate: number; // buyer's latest offer
  agreedRate?: number;
  buyerOffers: number; // max 3
  rounds: NegotiationRound[];
  version: number;
  updatedAt: string; // ISO
}

export interface ProjectRequirement {
  id: string; // e.g. "PR-2026-001"
  token: string; // e.g. "TOK-892147"
  projectId: string;
  projectName: string;
  materialId?: string;
  materialName: string;
  materialCode: string; // Standard Material Code e.g. "001", "002"
  materialGroup?: string;
  category: string;
  quantity: number;
  unit: string;
  requiredDate: string; // YYYY-MM-DD
  targetBudgetRate?: number; // Rs. / unit
  urgency: 'Standard' | 'High' | 'Immediate';
  specifications: string;
  deliveryAddress: string;
  specialInstructions?: string;
  status: PRStatus;
  raisedByUserId: string;
  raisedByName: string;
  createdAt: string;
  invitedVendorIds: string[];
  selectedVendorId?: string; // Awarded vendor
  shortlistedVendorIds?: string[]; // Top 3 vendors shortlisted
  enquiryDispatchedAt?: string;
  vendorQuoteTokens?: Record<string, string>; // vendorId -> secret token for the vendor's quote submission link
  receivingHours?: string; // e.g. "08:00-19:00, Mon-Sat"
  unloadingConstraints?: string; // e.g. "Max 10-wheeler truck; no entry 22:00-06:00"
  quoteDeadline?: string; // ISO date-time after which vendors can no longer submit quotes
  purchaseOrder?: PurchaseOrderRef; // PO issued after the PR was awarded
  approval?: PRApproval; // vendor award waiting for / decided by an admin
  requestApproval?: PRRequestApproval; // purchase request by a site manager / department, approved by an admin
  /** Department purchase request (not for a project site), e.g. "HR" */
  department?: string;
  /** Why the item is needed (department requests) */
  purpose?: string;
}

/** A delivery received against a PO, with the vendor's invoice (amount calculated from the PO terms) */
export interface PurchaseOrderReceipt {
  id: string; // e.g. "PO-2026-0001-R1"
  receivedQty: number;
  receivedOn: string; // YYYY-MM-DD
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  baseAmount: number;
  gstRate: number;
  gstAmount: number;
  freightShare: number;
  loadingShare: number;
  computedTotal: number; // as per PO terms
  invoiceTotal: number; // as per vendor invoice (defaults to computedTotal)
  variance: number; // invoiceTotal - computedTotal
  notes?: string;
  recordedBy?: string;
  recordedAt: string;
  invoiceFile?: { id: string; name: string; size: number; mimeType: string };
  lineItems?: InvoiceLineItem[]; // line items read from the uploaded invoice
  // Payment tracking (due date from the PO payment terms, counted from the invoice date)
  paymentTerms?: string;
  creditDays?: number;
  dueDate?: string; // YYYY-MM-DD
  reminderOn?: string; // YYYY-MM-DD, 2 days before the due date
  paymentStatus?: 'Unpaid' | 'Paid' | 'Not applicable'; // Not applicable = whole delivery rejected, no invoice
  paidOn?: string;
  paymentReference?: string;
  paidBy?: string;
  reminderSentAt?: string;
  reminderEmailStatus?: 'sent' | 'failed' | 'no-recipient';
  // Material verification (GRN). receivedQty above = accepted quantity (added to stock and invoiced)
  grnNumber?: string;
  deliveredQty?: number; // delivered by the vendor (accepted + rejected)
  rejectedQty?: number;
  rejectionReason?: string;
  quality?: QualityGrade;
  checks?: MaterialVerification['checks'];
  inspectedBy?: string;
  onTime?: boolean; // received on or before the PO delivery date
}

/** A line read from a vendor's tax invoice */
export interface InvoiceLineItem {
  description: string;
  hsn?: string;
  quantity?: number;
  unit?: string;
  rate?: number;
  gstRate?: number;
  amount?: number;
}

/** Details read automatically from an uploaded vendor invoice */
export interface ExtractedInvoice {
  invoiceNumber?: string;
  invoiceDate?: string;
  vendorGstin?: string;
  poReference?: string;
  lineItems: InvoiceLineItem[];
  materialQuantity?: number;
  taxableAmount?: number;
  gstAmount?: number;
  freightCharges?: number;
  loadingCharges?: number;
  invoiceTotal?: number;
}

/** In-app notification (dues, quotations, purchase orders, deliveries) */
export interface AppNotification {
  id: string;
  type:
    | 'quote-received'
    | 'quote-declined'
    | 'rfq-sent'
    | 'po-issued'
    | 'po-email-failed'
    | 'delivery-recorded'
    | 'payment-due'
    | 'payment-overdue'
    | 'payment-recorded'
    | 'query-raised'
    | 'query-reply'
    | 'query-status'
    | 'approval-requested'
    | 'approval-approved'
    | 'approval-rejected'
    | 'negotiation-offer'
    | 'negotiation-response'
    | 'delivery-due'
    | 'delivery-overdue'
    | 'material-rejected'
    | 'request-submitted'
    | 'request-approved'
    | 'request-rejected';
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'danger';
  projectId?: string;
  link?: { view: 'rfqs' | 'pos' | 'queries' | 'approvals' | 'requests'; prId?: string; poNumber?: string; queryId?: string };
  createdAt: string;
  read: boolean;
}

/** Purchase order as tracked in the purchase_orders collection (PDF served separately) */
export interface PurchaseOrderRecord {
  poNumber: string;
  prId: string;
  vendorId: string;
  vendorName: string;
  vendorEmail?: string;
  vendorGstin?: string;
  quoteId: string;
  materialName: string;
  projectName: string;
  projectId?: string;
  materialId?: string;
  materialCode?: string;
  unit: string;
  orderedQty: number;
  rate: number;
  gstRate: number;
  freightCharges: number;
  loadingCharges: number;
  grandTotal: number;
  deliveryBy: string;
  deliveryByIso?: string; // YYYY-MM-DD
  paymentTerms?: string;
  creditDays?: number;
  receivedQty: number; // accepted quantity
  rejectedQty?: number;
  deliveryFollowUps?: { type: 'before' | 'due' | 'overdue'; at: string; emailed: boolean }[];
  invoicedAmount: number;
  receipts: PurchaseOrderReceipt[];
  deliveryStatus: 'Pending' | 'Partially Received' | 'Received';
  status: 'Issued' | 'Cancelled';
  issuedAt: string;
  issuedBy?: string;
  approvedBy?: string;
  emailStatus: 'sending' | 'sent' | 'failed' | 'no-email';
  emailedTo?: string;
}

/** Reference to a system-generated purchase order (full PO + PDF are stored in the purchase_orders collection) */
export interface PurchaseOrderRef {
  poNumber: string; // e.g. "PO-2026-0001"
  vendorId: string;
  vendorName: string;
  grandTotal: number;
  issuedAt: string; // ISO
  emailedTo?: string;
  emailStatus: 'sending' | 'sent' | 'failed' | 'no-email';
}

export type QuoteStatus = 'Submitted' | 'Under Review' | 'Shortlisted' | 'Awarded' | 'Rejected' | 'Declined';

/** How the vendor provided their quotation */
export type QuoteSubmissionMethod = 'text' | 'pdf' | 'word' | 'image-excel' | 'form';

export interface VendorQuotation {
  id: string; // e.g. "QUOTE-101"
  prId: string; // Associated PR ID
  token: string;
  materialCode: string;
  materialName: string;
  vendorId: string;
  vendorName: string;
  vendorEmail?: string;
  vendorPhone?: string;
  unit: string;

  // Local (non-registered) vendor details, entered by the site manager / admin via "Add Quote"
  isLocalVendor?: boolean;
  vendorContactPerson?: string;
  vendorGstin?: string;
  vendorAddress?: string;
  addedByName?: string;

  // ---- Key figures (all required except remarks) ----
  quotedRate: number; // 1. Unit rate (Rs. per unit, excl. GST)
  quantity: number; // 2. Quantity the vendor can supply
  gstRate: number; // 3. GST %
  freightCharges: number; // 4. Freight / transport (Rs.)
  loadingCharges: number; // 5. Loading charges (Rs.)
  totalAmount: number; // 6. Total price (Rs., incl. GST, freight & loading)
  deliveryDays: number; // 7. Delivery time in days (derived from the promised date when that is given)
  promisedDeliveryDate?: string; //    ...or promised delivery date (YYYY-MM-DD)
  validityDays: number; // 8. Quote validity (days)
  paymentTerms: string; // 9. Payment terms, e.g. "30 days credit"
  creditDays: number; //    credit days parsed from the payment terms (0 = advance / COD)
  warranty: string; // 10. Warranty
  remarks?: string; // optional

  submissionMethod?: QuoteSubmissionMethod;
  quoteText?: string; // quotation text typed / pasted by the vendor
  attachment?: { id: string; name: string; size: number; mimeType: string }; // vendor's uploaded quotation file
  declineReason?: string;

  negotiation?: QuoteNegotiation; // counter-offer rounds (quotedRate/totalAmount hold the latest agreed or countered rate)

  evaluationScore?: number; // 0 - 100 calculated score
  rank?: number; // 1, 2, 3
  status: QuoteStatus;
  submittedAt: string;
  submittedVia?: 'vendor-portal' | 'internal'; // vendor-portal = submitted by the vendor through their quote link
}

/** One measured criterion of a vendor's automatic rating */
export interface VendorCriterionScore {
  key: 'onTime' | 'quality' | 'fulfilment' | 'price' | 'responsiveness' | 'invoiceAccuracy' | 'paymentTerms';
  label: string;
  weight: number; // % weight in the overall score
  score: number | null; // 0-100, null = no data yet
  detail: string; // e.g. "4 of 5 deliveries on time"
}

/** Automatic vendor rating calculated from purchase history */
export interface VendorPerformance {
  vendorId: string;
  vendorName: string;
  score: number | null; // 0-100 (null = not enough history yet)
  rating: number | null; // 0-5 stars
  criteria: VendorCriterionScore[];
  basis: { rfqsInvited: number; quotes: number; purchaseOrders: number; deliveries: number };
}


