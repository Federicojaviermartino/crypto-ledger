import axios, { AxiosInstance } from 'axios';
import { create } from 'xmlbuilder2';
import { DOMParser } from '@xmldom/xmldom';

/**
 * SOAP client for Spanish SII (Sistema Inmediato de Información)
 * Submits invoices to AEAT web service
 */
export class SiiSoapClient {
  private axiosClient: AxiosInstance;
  private endpoint: string;
  private nif: string;

  constructor(config: {
    endpoint: string;
    nif: string;
    timeout?: number;
  }) {
    this.endpoint = config.endpoint;
    this.nif = config.nif;

    this.axiosClient = axios.create({
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': '',
      },
    });
  }

  /**
   * Submit issued invoice to SII
   */
  async submitIssuedInvoice(data: {
    ejercicio: string; // "2025"
    periodo: string; // "01"
    facturas: Array<{
      idFactura: {
        numeroSerieFacturaEmisor: string;
        fechaExpedicionFacturaEmisor: string; // DD-MM-YYYY
      };
      tipoFactura: string; // "F1"
      claveRegimenEspecialOTrascendencia: string; // "01"
      importeTotal: number;
      descripcionOperacion: string;
      contraparte?: {
        nombreRazon: string;
        nifRepresentante?: string;
        idOtro?: {
          codigoPais: string;
          idType: string;
          id: string;
        };
      };
      tipoDesglose?: {
        desgloseFactura?: {
          sujeta?: {
            noExenta?: {
              tipoNoExenta: string;
              desgloseIVA: Array<{
                tipoImpositivo: number;
                baseImponible: number;
                cuotaRepercutida: number;
              }>;
            };
          };
        };
      };
    }>;
  }): Promise<any> {
    const soapEnvelope = this.buildIssuedInvoiceSoapEnvelope(data);
    return this.sendSoapRequest(soapEnvelope);
  }

  /**
   * Submit received invoice to SII
   */
  async submitReceivedInvoice(data: {
    ejercicio: string;
    periodo: string;
    facturas: Array<{
      idFactura: {
        numeroSerieFacturaEmisor: string;
        fechaExpedicionFacturaEmisor: string;
      };
      fechaRegContable: string;
      claveRegimenEspecialOTrascendencia: string;
      importeTotal: number;
      descripcionOperacion: string;
      contraparteEmisor: {
        nombreRazon: string;
        nif?: string;
        idOtro?: {
          codigoPais: string;
          idType: string;
          id: string;
        };
      };
      cuotaDeducible?: number;
    }>;
  }): Promise<any> {
    const soapEnvelope = this.buildReceivedInvoiceSoapEnvelope(data);
    return this.sendSoapRequest(soapEnvelope);
  }

  /**
   * Build SOAP envelope for issued invoices
   */
  private buildIssuedInvoiceSoapEnvelope(data: any): string {
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('soapenv:Envelope', {
        'xmlns:soapenv': 'http://schemas.xmlsoap.org/soap/envelope/',
        'xmlns:sii': 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/ssii/fact/ws/SuministroInformacion.xsd',
        'xmlns:siiLR': 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/ssii/fact/ws/SuministroLR.xsd',
      })
        .ele('soapenv:Header').up()
        .ele('soapenv:Body')
          .ele('siiLR:SuministroLRFacturasEmitidas')
            .ele('sii:Cabecera')
              .ele('sii:IDVersionSii').txt('1.1').up()
              .ele('sii:Titular')
                .ele('sii:NombreRazon').txt('Company Name').up()
                .ele('sii:NIF').txt(this.nif).up()
              .up()
              .ele('sii:TipoComunicacion').txt('A0').up() // A0 = Alta
            .up()
            .ele('siiLR:RegistroLRFacturasEmitidas');

    // Add invoices
    const registroNode = doc.last();
    
    for (const factura of data.facturas) {
      const periodoNode = registroNode!
        .ele('sii:PeriodoImpositivo')
          .ele('sii:Ejercicio').txt(data.ejercicio).up()
          .ele('sii:Periodo').txt(data.periodo).up()
        .up();

      const idFacturaNode = periodoNode
        .ele('sii:IDFactura')
          .ele('sii:IDEmisorFactura')
            .ele('sii:NIF').txt(this.nif).up()
          .up()
          .ele('sii:NumSerieFacturaEmisor').txt(factura.idFactura.numeroSerieFacturaEmisor).up()
          .ele('sii:FechaExpedicionFacturaEmisor').txt(factura.idFactura.fechaExpedicionFacturaEmisor).up()
        .up();

      const facturaExpedidaNode = idFacturaNode
        .ele('siiLR:FacturaExpedida')
          .ele('sii:TipoFactura').txt(factura.tipoFactura).up()
          .ele('sii:ClaveRegimenEspecialOTrascendencia').txt(factura.claveRegimenEspecialOTrascendencia).up()
          .ele('sii:ImporteTotal').txt(factura.importeTotal.toFixed(2)).up()
          .ele('sii:DescripcionOperacion').txt(factura.descripcionOperacion).up();

      // Add contraparte if exists
      if (factura.contraparte) {
        const contraparteNode = facturaExpedidaNode.ele('sii:Contraparte');
        contraparteNode.ele('sii:NombreRazon').txt(factura.contraparte.nombreRazon).up();

        if (factura.contraparte.nifRepresentante) {
          contraparteNode.ele('sii:NIF').txt(factura.contraparte.nifRepresentante).up();
        } else if (factura.contraparte.idOtro) {
          contraparteNode
            .ele('sii:IDOtro')
              .ele('sii:CodigoPais').txt(factura.contraparte.idOtro.codigoPais).up()
              .ele('sii:IDType').txt(factura.contraparte.idOtro.idType).up()
              .ele('sii:ID').txt(factura.contraparte.idOtro.id).up()
            .up();
        }
      }

      // Add desglose if exists
      if (factura.tipoDesglose?.desgloseFactura?.sujeta?.noExenta) {
        const desglose = factura.tipoDesglose.desgloseFactura.sujeta.noExenta;
        const desgloseNode = facturaExpedidaNode
          .ele('sii:TipoDesglose')
            .ele('sii:DesgloseFactura')
              .ele('sii:Sujeta')
                .ele('sii:NoExenta')
                  .ele('sii:TipoNoExenta').txt(desglose.tipoNoExenta).up();

        for (const iva of desglose.desgloseIVA) {
          desgloseNode
            .ele('sii:DesgloseIVA')
              .ele('sii:TipoImpositivo').txt(iva.tipoImpositivo.toFixed(2)).up()
              .ele('sii:BaseImponible').txt(iva.baseImponible.toFixed(2)).up()
              .ele('sii:CuotaRepercutida').txt(iva.cuotaRepercutida.toFixed(2)).up()
            .up();
        }
      }
    }

    return doc.end({ prettyPrint: true });
  }

  /**
   * Build SOAP envelope for received invoices
   */
  private buildReceivedInvoiceSoapEnvelope(data: any): string {
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('soapenv:Envelope', {
        'xmlns:soapenv': 'http://schemas.xmlsoap.org/soap/envelope/',
        'xmlns:sii': 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/ssii/fact/ws/SuministroInformacion.xsd',
        'xmlns:siiLR': 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/ssii/fact/ws/SuministroLR.xsd',
      })
        .ele('soapenv:Header').up()
        .ele('soapenv:Body')
          .ele('siiLR:SuministroLRFacturasRecibidas')
            .ele('sii:Cabecera')
              .ele('sii:IDVersionSii').txt('1.1').up()
              .ele('sii:Titular')
                .ele('sii:NombreRazon').txt('Company Name').up()
                .ele('sii:NIF').txt(this.nif).up()
              .up()
              .ele('sii:TipoComunicacion').txt('A0').up()
            .up()
            .ele('siiLR:RegistroLRFacturasRecibidas');

    // Add invoices (similar structure for received)
    const registroNode = doc.last();
    
    for (const factura of data.facturas) {
      registroNode!
        .ele('sii:PeriodoImpositivo')
          .ele('sii:Ejercicio').txt(data.ejercicio).up()
          .ele('sii:Periodo').txt(data.periodo).up()
        .up()
        .ele('sii:IDFactura')
          .ele('sii:IDEmisorFactura')
            .ele('sii:NombreRazon').txt(factura.contraparteEmisor.nombreRazon).up()
            .ele('sii:NIF').txt(factura.contraparteEmisor.nif || 'N/A').up()
          .up()
          .ele('sii:NumSerieFacturaEmisor').txt(factura.idFactura.numeroSerieFacturaEmisor).up()
          .ele('sii:FechaExpedicionFacturaEmisor').txt(factura.idFactura.fechaExpedicionFacturaEmisor).up()
        .up()
        .ele('siiLR:FacturaRecibida')
          .ele('sii:FechaRegContable').txt(factura.fechaRegContable).up()
          .ele('sii:ClaveRegimenEspecialOTrascendencia').txt(factura.claveRegimenEspecialOTrascendencia).up()
          .ele('sii:ImporteTotal').txt(factura.importeTotal.toFixed(2)).up()
          .ele('sii:DescripcionOperacion').txt(factura.descripcionOperacion).up()
          .ele('sii:CuotaDeducible').txt((factura.cuotaDeducible || 0).toFixed(2)).up()
        .up();
    }

    return doc.end({ prettyPrint: true });
  }

  /**
   * Send SOAP request to AEAT
   */
  private async sendSoapRequest(soapEnvelope: string): Promise<any> {
    try {
      const response = await this.axiosClient.post(this.endpoint, soapEnvelope);

      return this.parseSoapResponse(response.data);
    } catch (error: any) {
      if (error.response) {
        const errorData = this.parseSoapResponse(error.response.data);
        throw new Error(`SII SOAP Error: ${errorData.error || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Parse SOAP response from AEAT
   */
  private parseSoapResponse(xml: string): any {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    // Check for SOAP fault
    const fault = doc.getElementsByTagName('faultstring')[0];
    if (fault) {
      return {
        success: false,
        error: fault.textContent,
      };
    }

    // Parse successful response
    const estadoEnvio = doc.getElementsByTagName('EstadoEnvio')[0];
    if (estadoEnvio) {
      const codigoEstado = doc.getElementsByTagName('CodigoEstado')[0]?.textContent;
      
      if (codigoEstado === 'Correcto') {
        const csv = doc.getElementsByTagName('CSV')[0]?.textContent;
        
        return {
          success: true,
          csv,
          estado: 'Correcto',
        };
      } else {
        const registros = doc.getElementsByTagName('RegistroRespuestaLinea');
        const errors = [];

        for (let i = 0; i < registros.length; i++) {
          const registro = registros[i];
          const estadoRegistro = registro.getElementsByTagName('EstadoRegistro')[0]?.textContent;
          
          if (estadoRegistro === 'AceptadoConErrores' || estadoRegistro === 'Rechazado') {
            const codigoError = registro.getElementsByTagName('CodigoError')[0]?.textContent;
            const descripcionError = registro.getElementsByTagName('DescripcionError')[0]?.textContent;
            
            errors.push({
              code: codigoError,
              description: descripcionError,
            });
          }
        }

        return {
          success: false,
          errors,
          estado: codigoEstado,
        };
      }
    }

    return {
      success: false,
      error: 'Unknown response format',
    };
  }
}
