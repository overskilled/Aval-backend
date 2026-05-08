import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

function escapeHtml(s: string) {
  return (s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend?: Resend;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.from = this.config.get<string>('RESEND_FROM', 'Aval <noreply@aval.cm>');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn(
        'RESEND_API_KEY not set — emails will be logged to the console instead of being sent.',
      );
    }
  }

  async sendOtpCode(
    to: string,
    fullName: string,
    code: string,
    purpose: 'email_verify' | 'password_reset' | 'login_2fa',
  ) {
    const labels = {
      email_verify: {
        subject: 'Aval — vérification de votre adresse email',
        title: 'Vérifiez votre adresse email',
        intro:
          "Pour finaliser la création de votre compte Aval, saisissez le code ci-dessous dans la page de vérification :",
      },
      password_reset: {
        subject: 'Aval — code de réinitialisation',
        title: 'Réinitialisation de mot de passe',
        intro:
          'Vous avez demandé la réinitialisation de votre mot de passe. Saisissez ce code pour continuer :',
      },
      login_2fa: {
        subject: 'Aval — code de connexion',
        title: 'Code de connexion',
        intro:
          "Quelqu'un (vous, on l'espère) tente de se connecter à votre compte Aval. Saisissez ce code pour terminer la connexion :",
      },
    } as const;
    const { subject, title, intro } = labels[purpose];
    const text = `Bonjour ${fullName || ''},\n\n${intro}\n\nCode : ${code}\n\nCe code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce courriel.\n\n— Aval`;
    const html = `
      <div style="font-family: Inter, system-ui, sans-serif; color:#14181f; max-width:560px; margin:0 auto;">
        <h2 style="font-family: 'Playfair Display', Georgia, serif; font-weight:500;">${title}</h2>
        <p>Bonjour ${fullName || ''},</p>
        <p>${intro}</p>
        <p style="font-family: 'IBM Plex Mono', monospace; font-size:32px; letter-spacing:0.4em; background:#f4ede0; padding:16px 22px; display:inline-block; border:1px solid #c9bfa8;">${code}</p>
        <p style="color:#6c6655;font-size:13px;">Ce code expire dans 10 minutes.</p>
        <p style="color:#6c6655;font-size:13px;">Si vous n'êtes pas à l'origine de cette demande, ignorez ce courriel.</p>
      </div>
    `;
    return this.send({ to, subject, html, text });
  }

  async sendPasswordReset(to: string, fullName: string, resetUrl: string) {
    const subject = 'Aval — réinitialisation de votre mot de passe';
    const text = `Bonjour ${fullName || ''},\n\nVous avez demandé la réinitialisation de votre mot de passe Aval. Suivez ce lien (valable 30 minutes) :\n\n${resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce courriel.\n\n— Aval`;
    const html = `
      <div style="font-family: Inter, system-ui, sans-serif; color:#14181f; max-width:560px; margin:0 auto;">
        <h2 style="font-family: 'Playfair Display', Georgia, serif; font-weight:500;">Aval</h2>
        <p>Bonjour ${fullName || ''},</p>
        <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
        <p>Cliquez sur ce lien (valable 30 minutes) :</p>
        <p><a href="${resetUrl}" style="background:#14181f;color:#f4ede0;padding:12px 20px;text-decoration:none;display:inline-block;">Réinitialiser mon mot de passe</a></p>
        <p style="color:#6c6655;font-size:13px;">Lien direct : ${resetUrl}</p>
        <p style="color:#6c6655;font-size:13px;">Si vous n'êtes pas à l'origine de cette demande, ignorez ce courriel.</p>
      </div>
    `;
    return this.send({ to, subject, html, text });
  }

  async sendWelcome(to: string, fullName: string) {
    const subject = 'Bienvenue sur Aval';
    const text = `Bonjour ${fullName},\n\nVotre compte Aval a été créé.\n\n— Aval`;
    const html = `
      <div style="font-family: Inter, system-ui, sans-serif; color:#14181f; max-width:560px; margin:0 auto;">
        <h2 style="font-family: 'Playfair Display', Georgia, serif; font-weight:500;">Bienvenue sur Aval</h2>
        <p>Bonjour ${fullName},</p>
        <p>Votre compte a été créé avec succès. Vous pouvez maintenant vous connecter à votre espace de travail.</p>
        <p style="color:#6c6655;font-size:13px;">— Aval</p>
      </div>
    `;
    return this.send({ to, subject, html, text });
  }

  async sendKycDecision(args: {
    to: string;
    fullName: string;
    institutionName: string;
    decision: 'approved' | 'rejected';
    reason?: string;
  }) {
    const isApproved = args.decision === 'approved';
    const subject = isApproved
      ? `Aval — dossier KYC de ${args.institutionName} approuvé`
      : `Aval — dossier KYC de ${args.institutionName} rejeté`;
    const text = isApproved
      ? `Bonjour ${args.fullName || ''},\n\nLe dossier KYC de ${args.institutionName} a été approuvé. Vous pouvez désormais enregistrer des SKUs et demander des lots de codes signés depuis votre tableau de bord.\n\n— Aval`
      : `Bonjour ${args.fullName || ''},\n\nLe dossier KYC de ${args.institutionName} a été rejeté.\n\nMotif : ${args.reason || '—'}\n\nVous pouvez soumettre un nouveau dossier corrigé depuis votre tableau de bord.\n\n— Aval`;
    const accent = isApproved ? '#2c6b3f' : '#8c2a2a';
    const html = `
      <div style="font-family: Inter, system-ui, sans-serif; color:#14181f; max-width:560px; margin:0 auto;">
        <h2 style="font-family: 'Playfair Display', Georgia, serif; font-weight:500;">
          Dossier KYC ${isApproved ? 'approuvé' : 'rejeté'}
        </h2>
        <p>Bonjour ${args.fullName || ''},</p>
        <p>Le dossier KYC de <b>${args.institutionName}</b> a été ${isApproved ? 'approuvé' : 'rejeté'} par un administrateur Aval.</p>
        ${
          isApproved
            ? `<p>Vous pouvez désormais enregistrer des SKUs et demander des lots de codes signés depuis votre tableau de bord.</p>`
            : `<p style="border-left:3px solid ${accent};padding:10px 14px;background:#fbf5e7"><b>Motif :</b> ${args.reason || '—'}</p><p>Vous pouvez soumettre un nouveau dossier corrigé depuis votre tableau de bord.</p>`
        }
        <p style="color:#6c6655;font-size:13px;">— Aval</p>
      </div>
    `;
    return this.send({ to: args.to, subject, html, text });
  }

  async sendSkuDecision(args: {
    to: string;
    fullName: string;
    skuName: string;
    skuCode: string;
    decision: 'approved' | 'rejected';
    reason?: string;
  }) {
    const isApproved = args.decision === 'approved';
    const subject = isApproved
      ? `Aval — SKU "${args.skuName}" approuvé`
      : `Aval — SKU "${args.skuName}" rejeté`;
    const text = isApproved
      ? `Bonjour ${args.fullName || ''},\n\nVotre SKU "${args.skuName}" (${args.skuCode}) a été approuvé par le régulateur. Vous pouvez maintenant demander des lots de codes pour ce produit.\n\n— Aval`
      : `Bonjour ${args.fullName || ''},\n\nVotre SKU "${args.skuName}" (${args.skuCode}) a été rejeté.\n\nRaison : ${args.reason || '—'}\n\nVous pouvez soumettre un nouveau SKU corrigé.\n\n— Aval`;
    const accent = isApproved ? '#2c6b3f' : '#8c2a2a';
    const html = `
      <div style="font-family: Inter, system-ui, sans-serif; color:#14181f; max-width:560px; margin:0 auto;">
        <h2 style="font-family: 'Playfair Display', Georgia, serif; font-weight:500;">
          SKU ${isApproved ? 'approuvé' : 'rejeté'}
        </h2>
        <p>Bonjour ${args.fullName || ''},</p>
        <p>Votre SKU <b>${args.skuName}</b> (<code style="font-family:'IBM Plex Mono',monospace">${args.skuCode}</code>) a été ${isApproved ? 'approuvé' : 'rejeté'} par le régulateur.</p>
        ${
          isApproved
            ? `<p>Vous pouvez maintenant demander des lots de codes pour ce produit depuis votre tableau de bord.</p>`
            : `<p style="border-left:3px solid ${accent};padding:10px 14px;background:#fbf5e7"><b>Raison :</b> ${args.reason || '—'}</p><p>Vous pouvez soumettre un nouveau SKU corrigé.</p>`
        }
        <p style="color:#6c6655;font-size:13px;">— Aval</p>
      </div>
    `;
    return this.send({ to: args.to, subject, html, text });
  }

  async sendBatchDecision(args: {
    to: string;
    fullName: string;
    batchCode: string;
    skuName: string;
    quantity: number;
    decision: 'approved' | 'rejected';
    reason?: string;
  }) {
    const isApproved = args.decision === 'approved';
    const subject = isApproved
      ? `Aval — lot ${args.batchCode} approuvé (${args.quantity.toLocaleString('fr')} codes)`
      : `Aval — lot ${args.batchCode} rejeté`;
    const text = isApproved
      ? `Bonjour ${args.fullName || ''},\n\nVotre demande de lot ${args.batchCode} pour "${args.skuName}" (${args.quantity} codes) a été approuvée par le régulateur. Les codes seront générés et mis à votre disposition prochainement.\n\n— Aval`
      : `Bonjour ${args.fullName || ''},\n\nVotre demande de lot ${args.batchCode} pour "${args.skuName}" a été rejetée.\n\nRaison : ${args.reason || '—'}\n\nUn lot rejeté ne peut pas être renvoyé en l'état — créez une nouvelle demande corrigée.\n\n— Aval`;
    const accent = isApproved ? '#2c6b3f' : '#8c2a2a';
    const html = `
      <div style="font-family: Inter, system-ui, sans-serif; color:#14181f; max-width:560px; margin:0 auto;">
        <h2 style="font-family: 'Playfair Display', Georgia, serif; font-weight:500;">
          Lot ${isApproved ? 'approuvé' : 'rejeté'}
        </h2>
        <p>Bonjour ${args.fullName || ''},</p>
        <p>Votre demande de lot
          <code style="font-family:'IBM Plex Mono',monospace">${args.batchCode}</code>
          pour <b>${args.skuName}</b> (${args.quantity.toLocaleString('fr')} codes)
          a été ${isApproved ? 'approuvée' : 'rejetée'} par le régulateur.</p>
        ${
          isApproved
            ? `<p>Les codes seront générés et mis à votre disposition prochainement.</p>`
            : `<p style="border-left:3px solid ${accent};padding:10px 14px;background:#fbf5e7"><b>Raison :</b> ${args.reason || '—'}</p><p>Un lot rejeté ne peut pas être renvoyé en l'état — créez une nouvelle demande corrigée.</p>`
        }
        <p style="color:#6c6655;font-size:13px;">— Aval</p>
      </div>
    `;
    return this.send({ to: args.to, subject, html, text });
  }

  async sendContactInquiry(args: {
    to: string;
    submitter: { name: string; email: string; org?: string; role?: string; country?: string };
    message: string;
    receivedAt: Date;
    ip?: string;
    userAgent?: string;
  }) {
    const { name, email, org, role, country } = args.submitter;
    const subject = `Aval — demande de présentation · ${name}${org ? ` (${org})` : ''}`;
    const lines = [
      `Nom        : ${name}`,
      `Email      : ${email}`,
      org ? `Organisation : ${org}` : null,
      role ? `Rôle       : ${role}` : null,
      country ? `Pays       : ${country}` : null,
      `Reçu       : ${args.receivedAt.toISOString()}`,
      args.ip ? `IP         : ${args.ip}` : null,
    ].filter(Boolean).join('\n');
    const text = `Nouvelle demande de présentation depuis aval.cm\n\n${lines}\n\nMessage :\n${args.message || '— (vide)'}\n`;
    const html = `
      <div style="font-family: Inter, system-ui, sans-serif; color:#14181f; max-width:620px; margin:0 auto;">
        <div style="font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:0.16em; color:#6c6655; text-transform:uppercase;">§ Demande de présentation · aval.cm</div>
        <h2 style="font-family:'Playfair Display',Georgia,serif; font-weight:500; margin:6px 0 18px;">Nouvelle demande de ${name}</h2>
        <table style="border-collapse:collapse; font-size:14px;">
          <tr><td style="padding:6px 16px 6px 0;color:#6c6655;font-family:'IBM Plex Mono',monospace;font-size:11px;text-transform:uppercase;">Nom</td><td style="padding:6px 0;"><b>${name}</b></td></tr>
          <tr><td style="padding:6px 16px 6px 0;color:#6c6655;font-family:'IBM Plex Mono',monospace;font-size:11px;text-transform:uppercase;">Email</td><td style="padding:6px 0;"><a href="mailto:${email}" style="color:#a85a2c;">${email}</a></td></tr>
          ${org ? `<tr><td style="padding:6px 16px 6px 0;color:#6c6655;font-family:'IBM Plex Mono',monospace;font-size:11px;text-transform:uppercase;">Organisation</td><td style="padding:6px 0;">${org}</td></tr>` : ''}
          ${role ? `<tr><td style="padding:6px 16px 6px 0;color:#6c6655;font-family:'IBM Plex Mono',monospace;font-size:11px;text-transform:uppercase;">Rôle</td><td style="padding:6px 0;">${role}</td></tr>` : ''}
          ${country ? `<tr><td style="padding:6px 16px 6px 0;color:#6c6655;font-family:'IBM Plex Mono',monospace;font-size:11px;text-transform:uppercase;">Pays</td><td style="padding:6px 0;">${country}</td></tr>` : ''}
          <tr><td style="padding:6px 16px 6px 0;color:#6c6655;font-family:'IBM Plex Mono',monospace;font-size:11px;text-transform:uppercase;">Reçu</td><td style="padding:6px 0;">${args.receivedAt.toISOString()}</td></tr>
          ${args.ip ? `<tr><td style="padding:6px 16px 6px 0;color:#6c6655;font-family:'IBM Plex Mono',monospace;font-size:11px;text-transform:uppercase;">IP</td><td style="padding:6px 0;font-family:'IBM Plex Mono',monospace;font-size:12px;">${args.ip}</td></tr>` : ''}
        </table>
        <div style="margin-top:18px; padding:16px 18px; background:#fbf5e7; border-left:3px solid #a85a2c; white-space:pre-wrap; font-size:14.5px; line-height:1.55;">${escapeHtml(args.message || '— (message vide)')}</div>
        <p style="color:#6c6655;font-size:12px;margin-top:18px;">Répondez directement à cet email — il est configuré avec ${email} en Reply‑To.</p>
      </div>
    `;
    return this.send({ to: args.to, subject, html, text, replyTo: email });
  }

  async sendContactConfirmation(args: {
    to: string;
    name: string;
  }) {
    const subject = 'Aval — bien reçu votre demande';
    const text = `Bonjour ${args.name || ''},\n\nMerci pour votre intérêt envers Aval. Votre demande de présentation est enregistrée. Nous revenons vers vous sous 48 heures.\n\n— L'équipe Aval`;
    const html = `
      <div style="font-family: Inter, system-ui, sans-serif; color:#14181f; max-width:560px; margin:0 auto;">
        <h2 style="font-family:'Playfair Display',Georgia,serif; font-weight:500;">Demande bien reçue</h2>
        <p>Bonjour ${args.name || ''},</p>
        <p>Merci pour votre intérêt envers Aval. Votre demande de présentation est enregistrée — nous revenons vers vous sous 48 heures.</p>
        <p style="color:#6c6655;font-size:13px;">— L'équipe Aval</p>
      </div>
    `;
    return this.send({ to: args.to, subject, html, text });
  }

  async sendWorkspaceInvite(to: string, fullName: string, workspaceName: string, inviteUrl: string) {
    const subject = `Invitation — espace de travail ${workspaceName}`;
    const text = `Bonjour ${fullName || ''},\n\nVous avez été invité(e) à rejoindre l'espace de travail "${workspaceName}" sur Aval. Accédez-y ici : ${inviteUrl}\n\n— Aval`;
    const html = `
      <div style="font-family: Inter, system-ui, sans-serif; color:#14181f; max-width:560px; margin:0 auto;">
        <h2 style="font-family: 'Playfair Display', Georgia, serif; font-weight:500;">Invitation Aval</h2>
        <p>Bonjour ${fullName || ''},</p>
        <p>Vous avez été invité(e) à rejoindre l'espace de travail <b>${workspaceName}</b>.</p>
        <p><a href="${inviteUrl}" style="background:#a85a2c;color:#f4ede0;padding:12px 20px;text-decoration:none;display:inline-block;">Rejoindre l'espace</a></p>
      </div>
    `;
    return this.send({ to, subject, html, text });
  }

  private async send(params: { to: string; subject: string; html: string; text: string; replyTo?: string }) {
    if (!this.resend) {
      this.logger.log(
        `[mail:dev] To=${params.to} | Subject="${params.subject}"\n${params.text}`,
      );
      return { id: 'dev-no-send' };
    }
    const attempt = async (from: string) => {
      const { data, error } = await this.resend!.emails.send({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        ...(params.replyTo ? { replyTo: params.replyTo } : {}),
      });
      if (error) {
        const err: any = error;
        const reason = err?.message || JSON.stringify(err);
        throw new Error(`${err?.name || 'resend_error'}: ${reason}`);
      }
      return data;
    };

    try {
      const data = await attempt(this.from);
      this.logger.log(`Sent "${params.subject}" → ${params.to} (id=${data?.id})`);
      return data;
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`Resend send failed (from=${this.from}): ${msg}`);

      // Fallback: Resend's onboarding sender works without domain verification.
      // Useful for dev / first-run when the configured FROM domain isn't verified yet.
      const fallback = 'Aval <onboarding@resend.dev>';
      if (this.from !== fallback) {
        try {
          const data = await attempt(fallback);
          this.logger.warn(
            `Recovered using fallback sender ${fallback}. Verify your custom domain at https://resend.com/domains to remove this warning.`,
          );
          return data;
        } catch (err2) {
          this.logger.error(
            `Fallback resend also failed: ${(err2 as Error).message}`,
          );
        }
      }
      return null;
    }
  }
}
