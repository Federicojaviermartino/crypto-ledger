import axios from 'axios';
import { ReconciliationAlert } from '@crypto-ledger/shared/types/wallet-reconciliation.types';

export class AlertService {
  constructor(
    private webhookUrl?: string,
    private emailConfig?: {
      apiKey: string;
      from: string;
      to: string[];
    }
  ) {}

  async sendAlert(alert: ReconciliationAlert): Promise<void> {
    // Send webhook
    if (this.webhookUrl) {
      await this.sendWebhook(alert);
    }

    // Send email
    if (this.emailConfig) {
      await this.sendEmail(alert);
    }

    // Log for debugging
    console.log('🚨 RECONCILIATION ALERT:', {
      wallet: alert.walletAddress,
      asset: alert.asset,
      variance: alert.variance,
      variancePercent: alert.variancePercent.toFixed(2) + '%',
      severity: alert.severity,
      message: alert.message,
    });
  }

  private async sendWebhook(alert: ReconciliationAlert): Promise<void> {
    if (!this.webhookUrl) return;

    try {
      await axios.post(this.webhookUrl, {
        type: 'wallet_reconciliation_alert',
        severity: alert.severity,
        data: alert,
        timestamp: new Date().toISOString(),
      }, {
        timeout: 5000,
      });
    } catch (error) {
      console.error('Failed to send webhook alert:', error);
    }
  }

  private async sendEmail(alert: ReconciliationAlert): Promise<void> {
    if (!this.emailConfig) return;

    const subject = `[${alert.severity.toUpperCase()}] Wallet Reconciliation Alert: ${alert.asset}`;
    const body = `
Wallet Reconciliation Alert

Wallet: ${alert.walletAddress}
Asset: ${alert.asset}
Variance: ${alert.variance.toFixed(8)} (${alert.variancePercent.toFixed(2)}%)
Severity: ${alert.severity}

Message: ${alert.message}

Please investigate this discrepancy.
    `.trim();

    // Stub - would integrate with SendGrid, AWS SES, etc.
    console.log('📧 EMAIL ALERT:', {
      to: this.emailConfig.to,
      subject,
      body,
    });

    // Example SendGrid integration:
    // await axios.post('https://api.sendgrid.com/v3/mail/send', {
    //   personalizations: [{
    //     to: this.emailConfig.to.map(email => ({ email })),
    //   }],
    //   from: { email: this.emailConfig.from },
    //   subject,
    //   content: [{ type: 'text/plain', value: body }],
    // }, {
    //   headers: {
    //     'Authorization': `Bearer ${this.emailConfig.apiKey}`,
    //     'Content-Type': 'application/json',
    //   },
    // });
  }

  async sendBatchAlert(alerts: ReconciliationAlert[]): Promise<void> {
    if (alerts.length === 0) return;

    const criticalCount = alerts.filter(a => a.severity === 'critical').length;
    const warningCount = alerts.filter(a => a.severity === 'warning').length;

    console.log(`📊 Batch Reconciliation Alert: ${criticalCount} critical, ${warningCount} warnings`);

    for (const alert of alerts) {
      await this.sendAlert(alert);
    }
  }
}
