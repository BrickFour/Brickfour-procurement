export async function sendEmailNotification(data: {
  to?: string;
  subject: string;
  body: string;
  fromName?: string;
  type?: string;
  portalUrl?: string; // vendor's secure quotation link (rendered as a button in the email)
  /** Structured content rendered by the server's professional email layout */
  email?: {
    heading: string;
    preheader?: string;
    greeting?: string;
    paragraphs?: string[];
    details?: { label: string; value: string }[];
    sections?: { title: string; text: string }[];
    cta?: { label: string; url: string; note?: string };
    closing?: string[];
  };
  prDetails?: any;
}) {
  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: data.to,
        subject: data.subject,
        body: data.body,
        fromName: data.fromName || 'PRAVAH Operations',
        type: data.type || 'Site Notification',
        portalUrl: data.portalUrl,
        email: data.email,
        prDetails: data.prDetails,
      }),
    });
    const json = await res.json();
    console.log('Resend API Dispatch Result:', json);
    return json;
  } catch (err) {
    console.error('Failed to trigger /api/send-email:', err);
    return { success: false, error: err };
  }
}
