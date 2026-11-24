import type { ProjectRequirement, User, Vendor } from '../types';
import { sendEmailNotification } from '../services/emailService';
import { safeText } from './userError';
import { EVALUATION_CRITERIA_TEXT } from './vendorComparison';
import { buildVendorQuoteUrl } from './vendorQuoteLinks';

export interface RfqDispatchResult {
  vendor: Vendor;
  ok: boolean;
  error: string;
}

/**
 * Emails the RFQ to every invited vendor, each with that vendor's own quotation link
 * (the PR must already carry `vendorQuoteTokens` and be saved, so the links work when the emails arrive).
 * Sent one after another to stay within the email provider's rate limit.
 */
export async function sendRfqEmails(pr: ProjectRequirement, vendors: Vendor[], sender: Pick<User, 'name' | 'title'>): Promise<RfqDispatchResult[]> {
  const invitedVendors = vendors.filter((v) => pr.invitedVendorIds.includes(v.id));
  const quoteUrlFor = (vendorId: string) => buildVendorQuoteUrl(pr.id, vendorId, pr.vendorQuoteTokens?.[vendorId] || '');
  const site = pr.department ? `${pr.department} Department` : pr.projectName;
  const code = pr.materialCode && pr.materialCode !== '000' ? pr.materialCode : '';

  const emailSubject = `[RFQ Enquiry ${pr.token}] Formal Material Requirement: ${pr.materialName}${code ? ` (Code #${code})` : ''} - ${site}`;
  const buildEmailBody = (vendorName: string, portalUrl: string) => `
Dear ${vendorName} Team,

We are pleased to issue this formal Request for Quotation (RFQ) for our upcoming requirement:

• PR Number: ${pr.id}
• RFQ Token ID: ${pr.token}
• ${pr.department ? 'Department' : 'Project Site'}: ${site}
• Delivery Location: ${pr.deliveryAddress}
${code ? `• Standard Material Code: #${code} (${pr.materialGroup || ''})\n` : ''}• Item: ${pr.materialName}
• Category: ${pr.category}
• Required Quantity: ${pr.quantity} ${pr.unit}
• Required By: ${pr.requiredDate}
• Urgency: ${pr.urgency}
• Target Budget: Rs. ${pr.targetBudgetRate ? pr.targetBudgetRate.toLocaleString('en-IN') : 'Competitive'} per ${pr.unit}

SPECIFICATIONS:
"${pr.specifications}"

Please open your secure quotation link below to submit your commercial quotation:

${portalUrl}

This link is unique to your company. Please do not forward it.

Issued by:
${sender.name} (${sender.title || 'Procurement Team'})
    `;

  const buildRfqEmail = (vendorName: string, portalUrl: string) => ({
    heading: `Request for Quotation: ${pr.materialName}`,
    preheader: `${pr.id} - ${pr.quantity} ${pr.unit} required by ${pr.requiredDate} for ${site}`,
    greeting: `Dear ${vendorName} Team,`,
    paragraphs: [
      'We invite you to submit your quotation for the requirement below. Please review the details and submit your rates, delivery timeline and commercial terms using the button below.',
    ],
    details: [
      { label: 'PR Number', value: pr.id },
      { label: 'RFQ Reference', value: pr.token },
      { label: pr.department ? 'Department' : 'Project Site', value: site },
      { label: 'Delivery Address', value: pr.deliveryAddress },
      { label: 'Item', value: pr.materialName },
      ...(code ? [{ label: 'Material Code', value: `#${code}${pr.materialGroup ? ` (${pr.materialGroup})` : ''}` }] : []),
      { label: 'Category', value: pr.category },
      { label: 'Required Quantity', value: `${pr.quantity} ${pr.unit}` },
      { label: 'Required By', value: pr.requiredDate },
      ...(pr.receivingHours ? [{ label: 'Receiving Hours', value: pr.receivingHours }] : []),
      ...(pr.unloadingConstraints ? [{ label: 'Unloading Constraints', value: pr.unloadingConstraints }] : []),
      {
        label: 'Quotation Deadline',
        value: pr.quoteDeadline
          ? new Date(pr.quoteDeadline).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
          : 'At the earliest',
      },
      { label: 'Urgency', value: pr.urgency },
      { label: 'Target Budget', value: pr.targetBudgetRate ? `Rs. ${pr.targetBudgetRate.toLocaleString('en-IN')} per ${pr.unit}` : 'Competitive' },
    ],
    sections: [
      { title: pr.department ? 'Specifications' : 'Technical & Quality Specifications', text: pr.specifications },
      ...(pr.department
        ? []
        : [{ title: 'Site Instructions', text: pr.specialInstructions || 'Direct offloading at site yard with manufacturer test certificate (MTC).' }]),
      { title: 'Evaluation Criteria', text: `Quotations are ranked on: ${EVALUATION_CRITERIA_TEXT.replace(/ • /g, ', ')}.` },
      {
        title: 'How to Submit',
        text: 'Use the button below to open your secure supplier page. You can type or paste your quotation, or upload it as a PDF, Word document, image or Excel file, and then confirm the 10 key figures (unit rate, quantity, GST, freight, loading, total price, delivery, validity, payment terms and warranty).',
      },
    ],
    cta: {
      label: 'Submit Quotation',
      url: portalUrl,
      note: 'This link is unique to your company. You can use it again to revise your quotation until the enquiry is awarded. Please do not forward this email.',
    },
    closing: ['Regards,', sender.name, sender.title || 'Procurement Team'],
  });

  const results: RfqDispatchResult[] = [];
  for (const vendor of invitedVendors) {
    const email = (vendor.email || '').trim();
    if (!email) {
      results.push({ vendor, ok: false, error: 'no email address on file' });
      continue;
    }
    try {
      const res = await sendEmailNotification({
        to: email,
        subject: emailSubject,
        body: buildEmailBody(vendor.name, quoteUrlFor(vendor.id)),
        fromName: `${sender.name} (PRAVAH Procurement)`,
        type: 'Vendor RFQ Enquiry',
        email: buildRfqEmail(vendor.name, quoteUrlFor(vendor.id)),
      });
      results.push({ vendor, ok: Boolean(res?.success), error: res?.success ? '' : safeText(res?.error, 'the email could not be delivered') });
    } catch {
      results.push({ vendor, ok: false, error: 'the email could not be sent (connection problem)' });
    }
  }

  // In-app notification for the team (best effort)
  const sent = results.filter((r) => r.ok).length;
  fetch('/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'rfq-sent',
      prId: pr.id,
      projectId: pr.projectId,
      title: `RFQ sent: ${pr.materialName}`,
      message: `${pr.id} (${pr.quantity} ${pr.unit}) emailed to ${sent} of ${results.length} vendor(s) by ${sender.name}.`,
    }),
  }).catch(() => undefined);

  return results;
}

/** Project id used for a department's purchase requests (departments are not project sites) */
export const departmentProjectId = (department: string) => `dept-${department.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
export const isDepartmentProjectId = (projectId?: string) => Boolean(projectId && projectId.startsWith('dept-'));

/** Tell the admins about a new purchase request that needs their approval */
export async function submitRequestForApproval(pr: ProjectRequirement, user: User): Promise<void> {
  try {
    await fetch('/api/requests/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pr, requestedById: user.id }),
    });
  } catch {
    // The request is saved through the normal sync; admins still see it in "Requests"
  }
}
