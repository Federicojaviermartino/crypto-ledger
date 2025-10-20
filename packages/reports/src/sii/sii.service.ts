import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import * as soap from 'soap';

/**
 * SII Service (Suministro Inmediato de Información)
 * Spanish tax authority electronic invoice submission
 */
export class SiiService {
  constructor(
    private prisma: PrismaClient,
    private config: {
      endpoint: string;
      environment: 'production' | 'sandbox';
      nif: string;
    }
  ) {}

  /**
   * Submit invoice to SII
   */
  async submitInvoice(invoiceId: string, submissionType: 'issued' | 'received') {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        supplier: true,
        customer: true,
        lines: true,
      },
    });

    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    // Build SOAP envelope
    const soapEnvelope = this.buildSoapEnvelope(invoice, submissionType);

    try {
      // Send SOAP request
      const response = await axios.post(this.config.endpoint, soapEnvelope, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': submissionType === 'issued' 
            ? 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/ssii/fact/ws/SuministroFactEmitidas.wsdl'
            : 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/ssii/fact/ws/SuministroFactRecibidas.wsdl',
        },
        timeout: 30000,
      });

      // Parse response
      const result = this.parseResponse(response.data);

      // Update invoice status
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          siiStatus: result.isAccepted ? 'accepted' : 'rejected',
          siiSubmittedAt: new Date(),
          siiResponse: result,
        },
      });

      return result;
    } catch (error: any) {
      // Mark as failed
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          siiStatus: 'rejected',
          siiResponse: {
            error: error.message,
            timestamp: new Date().toISOString(),
          },
        },
      });

      throw error;
    }
  }

  /**
   * Build SOAP envelope for SII submission
   */
  private buildSoapEnvelope(invoice: any, submissionType: 'issued' | 'received'): string {
    const isIssued = submissionType === 'issued';

    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('soapenv:Envelope', {
        'xmlns:soapenv': 'http://schemas.xmlsoap.org/soap/envelope/',
        'xmlns:sii': 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/ssii/fact/ws/SuministroInformacion.xsd',
      })
      .ele('soapenv:Header').up()
      .ele('soapenv:Body')
        .ele(isIssued ? 'sii:SuministroLRFacturasEmitidas' : 'sii:SuministroLRFacturasRecibidas')
          .ele('sii:Cabecera')
            .ele('sii:IDVersionSii').txt('1.1').up()
            .ele('sii:Titular')
              .ele('sii:NombreRazon').txt(invoice.supplier.name).up()
              .ele('sii:NIF').txt(this.config.nif).up()
            .up()
            .ele('sii:TipoComunicacion').txt('A0').up() // A0 = Alta
          .up()
          .ele('sii:RegistroLRFacturasEmitidas')
            .ele('sii:PeriodoLiquidacion')
              .ele('sii:Ejercicio').txt(invoice.invoiceDate.getFullYear().toString()).up()
              .ele('sii:Periodo').txt(this.getPeriod(invoice.invoiceDate)).up()
            .up()
            .ele('sii:IDFactura')
              .ele('sii:IDEmisorFactura')
                .ele('sii:NIF').txt(invoice.supplier.taxId).up()
              .up()
              .ele('sii:NumSerieFacturaEmisor').txt(invoice.invoiceNumber).up()
              .ele('sii:FechaExpedicionFacturaEmisor').txt(this.formatDate(invoice.invoiceDate)).up()
            .up()
            .ele('sii:FacturaExpedida')
              .ele('sii:TipoFactura').txt(this.mapInvoiceType(invoice.invoiceType)).up()
              .ele('sii:ClaveRegimenEspecialOTrascendencia').txt('01').up() // 01 = General
              .ele('sii:DescripcionOperacion').txt('Factura emitida').up()
              .ele('sii:TipoDesglose')
                .ele('sii:DesgloseFactura')
                  .ele('sii:Sujeta')
                    .ele('sii:NoExenta')
                      .ele('sii:TipoNoExenta').txt('S1').up() // S1 = General
                      .ele('sii:DesgloseIVA')
                        .ele('sii:DetalleIVA')
                          .ele('sii:TipoImpositivo').txt(this.getAverageTaxRate(invoice.lines).toFixed(2)).up()
                          .ele('sii:BaseImponible').txt(invoice.subtotal.toFixed(2)).up()
                          .ele('sii:CuotaRepercutida').txt(invoice.taxAmount.toFixed(2)).up()
                        .up()
                      .up()
                    .up()
                  .up()
                .up()
              .up()
              .ele('sii:ImporteTotal').txt(invoice.total.toFixed(2)).up()
            .up()
          .up()
        .up()
      .up();

    return doc.end({ prettyPrint: true });
  }

  /**
   * Parse SOAP response from SII
   */
  private parseResponse(xml: string): any {
    // Simple XML parsing (in production use proper XML parser)
    const isAccepted = xml.includes('<EstadoEnvio>Correcto</EstadoEnvio>');
    const hasErrors = xml.includes('<CodigoErrorRegistro>');

    return {
      isAccepted,
      hasErrors,
      raw: xml,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get period code for month (01-12)
   */
  private getPeriod(date: Date): string {
    return (date.getMonth() + 1).toString().padStart(2, '0');
  }

  /**
   * Format date as DD-MM-YYYY for SII
   */
  private formatDate(date: Date): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
  }

  /**
   * Format date as DD-MM-YYYY for SII
   */
  private formatDate(date: Date): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

  }}