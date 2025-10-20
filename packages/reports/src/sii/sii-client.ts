import axios, { AxiosInstance } from 'axios';
import { create } from 'xmlbuilder2';
import { DOMParser } from '@xmldom/xmldom';
import { SiiInvoiceData, SiiSubmissionResult, SiiConfig } from '@crypto-ledger/shared/types/sii.types';

export class SiiClient {
  private client: AxiosInstance;
  private config: SiiConfig;

  constructor(config: SiiConfig) {
    this.config = config;
    
    this.client = axios.create({
      baseURL: config.endpoint,
      timeout: 30000,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '',
      },
    });

    // Add retry interceptor
    this.client.interceptors.response.use(
      response => response,
      async error => {
        const config = error.config;
        
        if (!config || !config.retry) {
          config.retry = 0;
        }

        // Retry on network errors or 5xx
        const shouldRetry = 
          !error.response || 
          (error.response.status >= 500 && error.response.status < 600);

        if (shouldRetry && config.retry < 3) {
          config.retry += 1;
          const delay = Math.pow(2, config.retry) * 1000; // 2s, 4s, 8s
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.client(config);
        }

        return Promise.reject(error);
      }
    );
  }

  async submitIssuedInvoice(invoice: SiiInvoiceData): Promise<SiiSubmissionResult> {
    const soapRequest = this.buildIssuedInvoiceSoapRequest(invoice);
    
    try {
      const response = await this.client.post('', soapRequest);
      return this.parseResponse(response.data);
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.response?.status || 0,
        errors: [{
          code: 'NETWORK_ERROR',
          message: error.message,
        }],
      };
    }
  }

  async submitReceivedInvoice(invoice: SiiInvoiceData): Promise<SiiSubmissionResult> {
    const soapRequest = this.buildReceivedInvoiceSoapRequest(invoice);
    
    try {
      const response = await this.client.post('', soapRequest);
      return this.parseResponse(response.data);
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.response?.status || 0,
        errors: [{
          code: 'NETWORK_ERROR',
          message: error.message,
        }],
      };
    }
  }

  private buildIssuedInvoiceSoapRequest(invoice: SiiInvoiceData): string {
    const root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('soapenv:Envelope', {
        'xmlns:soapenv': 'http://schemas.xmlsoap.org/soap/envelope/',
        'xmlns:sii': 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/ssii/fact/ws/SuministroInformacion.xsd',
      })
      .ele('soapenv:Header').up()
      .ele('soapenv:Body')
      .ele('sii:SuministroLRFacturasEmitidas');

    // Header
    const header = root.ele('sii:Cabecera');
    header.ele('sii:IDVersionSii').txt('1.1');
    
    const holder = header.ele('sii:Titular');
    holder.ele('sii:NIF').txt(this.config.nif);
    holder.ele('sii:NombreRazon').txt('Titular Test'); // Should come from config

    // Invoice record
    const registros = root.ele('sii:RegistroLRFacturasEmitidas');
    
    const periodLiq = registros.ele('sii:PeriodoLiquidacion');
    const issueDate = invoice.issueDate;
    periodLiq.ele('sii:Ejercicio').txt(issueDate.getFullYear().toString());
    periodLiq.ele('sii:Periodo').txt(String(issueDate.getMonth() + 1).padStart(2, '0'));

    // Invoice identification
    const idFactura = registros.ele('sii:IDFactura');
    idFactura.ele('sii:IDEmisorFactura')
      .ele('sii:NIF').txt(invoice.sellerTaxId);
    idFactura.ele('sii:NumSerieFacturaEmisor')
      .txt(invoice.series ? `${invoice.series}${invoice.invoiceNumber}` : invoice.invoiceNumber);
    idFactura.ele('sii:FechaExpedicionFacturaEmisor')
      .txt(this.formatDate(invoice.issueDate));

    // Invoice data
    const facturaExpedida = registros.ele('sii:FacturaExpedida');
    facturaExpedida.ele('sii:TipoFactura').txt(invoice.invoiceType);
    facturaExpedida.ele('sii:ClaveRegimenEspecialOTrascendencia').txt(invoice.operationKey);

    // Import/export
    facturaExpedida.ele('sii:ImporteTotal').txt(invoice.totalAmount.toFixed(2));

    // Counterparty
    if (invoice.buyerCountry !== 'ES') {
      const counterparty = facturaExpedida.ele('sii:Contraparte');
      counterparty.ele('sii:NombreRazon').txt(invoice.buyerName);
      counterparty.ele('sii:IDOtro')
        .ele('sii:CodigoPais').txt(invoice.buyerCountry).up()
        .ele('sii:IDType').txt('02').up() // 02 = NIF-IVA
        .ele('sii:ID').txt(invoice.buyerTaxId);
    } else {
      const counterparty = facturaExpedida.ele('sii:Contraparte');
      counterparty.ele('sii:NombreRazon').txt(invoice.buyerName);
      counterparty.ele('sii:NIF').txt(invoice.buyerTaxId);
    }

    // VAT breakdown
    const tipoDesglose = facturaExpedida.ele('sii:TipoDesglose');
    const desgloseFactura = tipoDesglose.ele('sii:DesgloseFactura');
    const sujeta = desgloseFactura.ele('sii:Sujeta');
    
    const noExenta = sujeta.ele('sii:NoExenta');
    noExenta.ele('sii:TipoNoExenta').txt('S1'); // S1 = Standard rate
    
    const detalleIVA = noExenta.ele('sii:DesgloseIVA').ele('sii:DetalleIVA');
    detalleIVA.ele('sii:TipoImpositivo').txt('21.00');
    detalleIVA.ele('sii:BaseImponible').txt(invoice.baseAmount.toFixed(2));
    detalleIVA.ele('sii:CuotaRepercutida').txt(invoice.taxAmount.toFixed(2));

    return root.end({ prettyPrint: true });
  }

  private buildReceivedInvoiceSoapRequest(invoice: SiiInvoiceData): string {
    // Similar structure but for received invoices
    const root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('soapenv:Envelope', {
        'xmlns:soapenv': 'http://schemas.xmlsoap.org/soap/envelope/',
        'xmlns:sii': 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/ssii/fact/ws/SuministroInformacion.xsd',
      })
      .ele('soapenv:Header').up()
      .ele('soapenv:Body')
      .ele('sii:SuministroLRFacturasRecibidas');

    // Similar to issued but with received structure
    const header = root.ele('sii:Cabecera');
    header.ele('sii:IDVersionSii').txt('1.1');
    
    const holder = header.ele('sii:Titular');
    holder.ele('sii:NIF').txt(this.config.nif);

    // Invoice record
    const registros = root.ele('sii:RegistroLRFacturasRecibidas');
    
    const periodLiq = registros.ele('sii:PeriodoLiquidacion');
    periodLiq.ele('sii:Ejercicio').txt(invoice.issueDate.getFullYear().toString());
    periodLiq.ele('sii:Periodo').txt(String(invoice.issueDate.getMonth() + 1).padStart(2, '0'));

    const idFactura = registros.ele('sii:IDFactura');
    idFactura.ele('sii:IDEmisorFactura')
      .ele('sii:NIF').txt(invoice.sellerTaxId);
    idFactura.ele('sii:NumSerieFacturaEmisor').txt(invoice.invoiceNumber);
    idFactura.ele('sii:FechaExpedicionFacturaEmisor').txt(this.formatDate(invoice.issueDate));

    const facturaRecibida = registros.ele('sii:FacturaRecibida');
    facturaRecibida.ele('sii:TipoFactura').txt(invoice.invoiceType);
    facturaRecibida.ele('sii:ClaveRegimenEspecialOTrascendencia').txt(invoice.operationKey);
    facturaRecibida.ele('sii:FechaRegContable').txt(this.formatDate(new Date()));
    facturaRecibida.ele('sii:ImporteTotal').txt(invoice.totalAmount.toFixed(2));

    // Deductible amount
    const cuotaDeducible = facturaRecibida.ele('sii:CuotaDeducible');
    cuotaDeducible.txt(invoice.taxAmount.toFixed(2));

    return root.end({ prettyPrint: true });
  }

  private parseResponse(responseXml: string): SiiSubmissionResult {
    try {
      const doc = new DOMParser().parseFromString(responseXml, 'text/xml');
      
      // Check for SOAP fault
      const faultString = doc.getElementsByTagName('faultstring')[0];
      if (faultString) {
        return {
          success: false,
          statusCode: 500,
          errors: [{
            code: 'SOAP_FAULT',
            message: faultString.textContent || 'Unknown SOAP fault',
          }],
        };
      }

      // Parse SII response
      const estadoRegistro = doc.getElementsByTagName('EstadoRegistro')[0];
      if (!estadoRegistro) {
        return {
          success: false,
          statusCode: 200,
          errors: [{
            code: 'INVALID_RESPONSE',
            message: 'Could not parse SII response',
          }],
        };
      }

      const codigoEstado = estadoRegistro.getElementsByTagName('CodigoEstado')[0]?.textContent;
      const descripcionEstado = estadoRegistro.getElementsByTagName('DescripcionEstado')[0]?.textContent;

      const isAccepted = codigoEstado === 'Aceptada' || codigoEstado === 'AceptadaConErrores';

      // Extract registration ID if available
      const csv = doc.getElementsByTagName('CSV')[0]?.textContent;

      const result: SiiSubmissionResult = {
        success: isAccepted,
        statusCode: 200,
        responseCode: codigoEstado || undefined,
        responseMessage: descripcionEstado || undefined,
        registrationId: csv || undefined,
        errors: [],
      };

      // Parse errors if any
      const registroErrores = doc.getElementsByTagName('RegistroErrores');
      if (registroErrores.length > 0) {
        const errors = Array.from(registroErrores).map(err => {
          const codigo = err.getElementsByTagName('CodigoError')[0]?.textContent || 'UNKNOWN';
          const descripcion = err.getElementsByTagName('DescripcionError')[0]?.textContent || 'Unknown error';
          return { code: codigo, message: descripcion };
        });
        result.errors = errors;
      }

      return result;
    } catch (error: any) {
      return {
        success: false,
        statusCode: 200,
        errors: [{
          code: 'PARSE_ERROR',
          message: error.message,
        }],
      };
    }
  }

  private formatDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }
}
