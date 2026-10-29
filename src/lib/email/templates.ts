// Minimal, dependency-free HTML email templates per §11 categories.
// All copy uses placeholder club branding that is replaceable via club_settings.

const BRAND = 'Entrepreneurship Club · ALTA School of Technology, ADYPU'

function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }, footerHtml?: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#111827;color:#ffffff;padding:20px 28px;font-size:15px;font-weight:bold;">Entrepreneurship Club</div>
    <div style="padding:28px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">${escapeHtml(title)}</h1>
      <div style="font-size:14px;line-height:1.6;color:#374151;">${bodyHtml}</div>
      ${
        cta
          ? `<p style="margin:24px 0 4px;"><a href="${cta.url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;">${escapeHtml(cta.label)}</a></p>`
          : ''
      }
    </div>
    <div style="padding:16px 28px;background:#f9fafb;color:#6b7280;font-size:12px;">${escapeHtml(BRAND)}<br/>${footerHtml ?? 'You are receiving this because of your relationship with the club. Manage preferences in your workspace profile.'}</div>
  </div></body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export const templates = {
  applicationReceipt(name: string, reference: string) {
    const body = `<p>Hi ${escapeHtml(name)},</p><p>We have received your application to join the Entrepreneurship Club. Our review team will get back to you after evaluation.</p><p>Your application reference: <strong>${escapeHtml(reference)}</strong></p>`
    return { subject: 'Application received — Entrepreneurship Club', html: layout('Application received', body) }
  },
  reviewerNotification(appName: string, appCount: number) {
    const body = `<p>A new membership application from <strong>${escapeHtml(appName)}</strong> is awaiting review.</p><p>There ${appCount === 1 ? 'is' : 'are'} currently <strong>${appCount}</strong> pending application${appCount === 1 ? '' : 's'}.</p>`
    return { subject: 'New application awaiting review', html: layout('New application', body) }
  },
  applicationDecision(name: string, approved: boolean, notes?: string) {
    const body = approved
      ? `<p>Hi ${escapeHtml(name)},</p><p>Congratulations! Your application has been <strong>approved</strong>. You will receive a secure invitation link shortly to activate your member account.</p>${notes ? `<p>Reviewer note: ${escapeHtml(notes)}</p>` : ''}`
      : `<p>Hi ${escapeHtml(name)},</p><p>Thank you for applying. After careful review, we are unable to approve your application at this time.${notes ? ` <em>${escapeHtml(notes)}</em>` : ''}</p><p>You are welcome to apply again in a future intake.</p>`
    return {
      subject: approved ? 'Your application was approved 🎉' : 'Application decision — Entrepreneurship Club',
      html: layout('Application decision', body),
    }
  },
  membershipInvite(inviteUrl: string, type: string) {
    const body = `<p>You have been invited to join the Entrepreneurship Club as a <strong>${escapeHtml(type)}</strong>.</p><p>This secure link is valid for 7 days and can be used once.</p>`
    return { subject: 'Your Entrepreneurship Club invitation', html: layout('You are invited', body, { label: 'Activate your account', url: inviteUrl }) }
  },
  welcome(name: string) {
    const body = `<p>Welcome aboard, ${escapeHtml(name)}! Your member account is active. Explore events, announcements and the member workspace.</p>`
    return { subject: 'Welcome to the Entrepreneurship Club', html: layout('Welcome aboard', body) }
  },
  eventRegistration(eventName: string, when: string, venue: string, name: string) {
    const body = `<p>Hi ${escapeHtml(name)},</p><p>Your registration for <strong>${escapeHtml(eventName)}</strong> is confirmed.</p><p>📅 ${escapeHtml(when)}<br/>📍 ${escapeHtml(venue || 'To be announced')}</p>`
    return { subject: `Registration confirmed — ${eventName}`, html: layout('Registration confirmed', body) }
  },
  eventReminder(eventName: string, when: string, venue: string) {
    const body = `<p>Reminder: <strong>${escapeHtml(eventName)}</strong> is happening soon.</p><p>📅 ${escapeHtml(when)}<br/>📍 ${escapeHtml(venue || 'To be announced')}</p>`
    return { subject: `Reminder — ${eventName}`, html: layout('Event reminder', body) }
  },
  announcement(title: string, bodyMd: string) {
    const body = `<p>${escapeHtml(bodyMd.slice(0, 1500))}${bodyMd.length > 1500 ? '…' : ''}</p>`
    return { subject: title, html: layout('Announcement', body) }
  },
  opsAlert(subject: string, detail: string) {
    const body = `<pre style="white-space:pre-wrap;font-size:12px;color:#374151;">${escapeHtml(detail.slice(0, 3000))}</pre>`
    return { subject, html: layout('Operational alert', body) }
  },
  setPassword(resetUrl: string) {
    const body = `<p>An account was created for you in the Entrepreneurship Club.</p><p>Set your own password using the secure link below. The link is valid for 1 hour and can be used once. For your security we never email passwords.</p>`
    return { subject: 'Set your Entrepreneurship Club password', html: layout('Set your password', body, { label: 'Set password', url: resetUrl }) }
  },
  meetingInvite(title: string, when: string, joinUrl: string, audienceNote?: string) {
    const body = `<p>You are invited to a club meeting: <strong>${escapeHtml(title)}</strong>.</p><p>🕐 ${escapeHtml(when)}</p>${audienceNote ? `<p>${escapeHtml(audienceNote)}</p>` : ''}<p>Join from your member workspace → Meetings.</p>`
    return { subject: `Meeting invitation — ${title}`, html: layout('You are invited to a meeting', body, { label: 'Open workspace', url: joinUrl }) }
  },
  eventCancelled(eventName: string, reason?: string) {
    const body = `<p><strong>${escapeHtml(eventName)}</strong> has been cancelled by the organizers.</p>${reason ? `<p>Reason: ${escapeHtml(reason)}</p>` : ''}<p>We apologize for any inconvenience.</p>`
    return { subject: `Cancelled — ${eventName}`, html: layout('Event cancelled', body) }
  },
  // ─── Newsletter (public subscribers) ───
  // Sent ONLY for audience='public' announcements / published public events.
  // Content is limited to fields already displayed on the public website — never
  // member data, internal notes, or members-only announcements.
  newsletterAnnouncement(input: { title: string; body: string; category: string; readUrl: string; unsubscribeUrl: string }) {
    const body = `<p style="margin:0 0 8px;"><span style="display:inline-block;background:#eef2f7;color:#374151;font-size:11px;padding:3px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(input.category)}</span></p><p>${escapeHtml(input.body.slice(0, 1500))}${input.body.length > 1500 ? '…' : ''}</p><p style="margin:16px 0 0;color:#6b7280;font-size:12px;">Read all announcements on the club website.</p>`
    const footer = `You are receiving this because you subscribed to Entrepreneurship Club updates. <a href="${input.unsubscribeUrl}" style="color:#6b7280;">Unsubscribe</a>`
    return {
      subject: input.title,
      html: layout(input.title, body, { label: 'Read on the website', url: input.readUrl }, footer),
      text: `${input.title}\n\n${input.body.slice(0, 2000)}\n\nRead more: ${input.readUrl}\nUnsubscribe: ${input.unsubscribeUrl}`,
    }
  },
  newsletterEvent(input: { title: string; summary: string | null; when: string; venue: string | null; eventUrl: string; unsubscribeUrl: string }) {
    const body = `<p>📅 <strong>${escapeHtml(input.when)}</strong>${input.venue ? `<br/>📍 ${escapeHtml(input.venue)}` : ''}</p>${input.summary ? `<p>${escapeHtml(input.summary)}</p>` : ''}`
    const footer = `You are receiving this because you subscribed to Entrepreneurship Club updates. <a href="${input.unsubscribeUrl}" style="color:#6b7280;">Unsubscribe</a>`
    return {
      subject: `New event: ${input.title}`,
      html: layout(input.title, body, { label: 'View event details', url: input.eventUrl }, footer),
      text: `New event: ${input.title}\n\n📅 ${input.when}${input.venue ? `\n📍 ${input.venue}` : ''}\n\n${input.summary ?? ''}\n\nDetails: ${input.eventUrl}\nUnsubscribe: ${input.unsubscribeUrl}`,
    }
  },
  staleApplicationsDigest(apps: { reference: string; fullName: string; email: string; waitingDays: number }[]) {
    const rows = apps
      .map(
        (a) =>
          `<tr><td style="padding:4px 10px;border-bottom:1px solid #eee;">${escapeHtml(a.reference)}</td><td style="padding:4px 10px;border-bottom:1px solid #eee;">${escapeHtml(a.fullName)}</td><td style="padding:4px 10px;border-bottom:1px solid #eee;">${escapeHtml(a.email)}</td><td style="padding:4px 10px;border-bottom:1px solid #eee;">${a.waitingDays}d</td></tr>`
      )
      .join('')
    const body = `<p>${apps.length} membership application${apps.length === 1 ? '' : 's'} ha${apps.length === 1 ? 's' : 've'} been pending for more than 48 hours:</p><table style="border-collapse:collapse;font-size:13px;"><thead><tr><th style="text-align:left;padding:4px 10px;">Ref</th><th style="text-align:left;padding:4px 10px;">Name</th><th style="text-align:left;padding:4px 10px;">Email</th><th style="text-align:left;padding:4px 10px;">Waiting</th></tr></thead><tbody>${rows}</tbody></table><p>Review them in the admin panel → Applications.</p>`
    return {
      subject: `Action needed: ${apps.length} pending membership application${apps.length === 1 ? '' : 's'}`,
      html: layout('Stale application digest', body),
    }
  },
}
